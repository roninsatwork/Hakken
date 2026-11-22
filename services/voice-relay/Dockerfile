# The live voice relay, as it runs on Cloud Run.
#
# Deliberately tiny: three source files, two dependencies, no build step. On
# Cloud Run in the same Google project the service account comes from the
# runtime, so no key file is ever baked in or mounted.
FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --fund=false

COPY protocol.mjs telephonyAudio.mjs twilioBridge.mjs server.mjs ./

# Cloud Run provides PORT; the server already reads it.
USER node
CMD ["node", "server.mjs"]
