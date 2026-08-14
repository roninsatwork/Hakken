# The live voice relay, as it runs on Cloud Run.
#
# Deliberately tiny: three source files, two dependencies, no build step. On
# Cloud Run in the same Google project the service account comes from the
# runtime, so no key file is ever baked in or mounted.
FROM node:24-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY protocol.mjs telephonyAudio.mjs twilioBridge.mjs server.mjs ./

# Cloud Run provides PORT; the server already reads it.
CMD ["node", "server.mjs"]
