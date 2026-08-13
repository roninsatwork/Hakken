FROM node:24.18.0-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci \
  --fetch-retries=5 \
  --fetch-retry-factor=2 \
  --fetch-retry-mintimeout=20000 \
  --fetch-retry-maxtimeout=120000 \
  --prefer-offline \
  --no-audit \
  --fund=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL

# Where the public site's "Talk to us" and "Contact" go. NEXT_PUBLIC_ values
# are baked in at build time, so this has to be here rather than on the
# running service. Unset builds fall back to the in-app /contact route.
ARG NEXT_PUBLIC_CONTACT_URL
ENV NEXT_PUBLIC_CONTACT_URL=$NEXT_PUBLIC_CONTACT_URL

ARG CONVEX_SITE_URL
ENV CONVEX_SITE_URL=$CONVEX_SITE_URL

ARG CONVEX_DEPLOYMENT
ENV CONVEX_DEPLOYMENT=$CONVEX_DEPLOYMENT

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Commit the image was built from, surfaced by /api/health so a running
# container can be tied back to an exact revision during an incident.
ARG BUILD_SHA=unknown
ENV BUILD_SHA=$BUILD_SHA

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Liveness only (no `deps=1`): restarting the container is a sensible response
# to this process being wedged, but not to Convex being unreachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
