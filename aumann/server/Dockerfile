# Aumann server. Standard Node 20-alpine.
# Built from the repo root context so we can grab ../js (the shared logic
# the server imports). Build command (from aumann/server/):
#   fly deploy   (uses fly.toml's [build] dockerfile + context)
FROM node:20-alpine
WORKDIR /app

# Server deps only (no dev deps in prod).
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Shared game logic and the server itself.
COPY js/ ./js/
COPY server/server.js ./server/

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

WORKDIR /app/server
CMD ["node", "server.js"]
