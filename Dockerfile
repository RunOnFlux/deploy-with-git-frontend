# syntax=docker/dockerfile:1

# ── Build frontend (no secrets or env-specific config required) ──────────────
FROM node:22-bookworm-slim AS builder

# Chromium is needed only at build time: the post-build prerender step
# (scripts/prerender.mjs) drives it headless to snapshot the landing page to
# static HTML for crawlers / AI engines. This whole stage is discarded — only
# /app/dist is copied to the runner — so it does not affect the final image size.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY config ./config
COPY public ./public
COPY src ./src
COPY scripts ./scripts

RUN npm run build

# ── Production: Node BFF + static dist + Chromium for screenshots ────────────
FROM node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# App code lives outside containerData — Flux mounts persistence over that path
# and would hide server.js/dist if they shared the same directory.
WORKDIR /opt/orbit-ui

ENV NODE_ENV=production \
    PORT=4000 \
    CHROMIUM_PATH=/usr/bin/chromium

# /data is the persistence mount. Own both it and the app dir as the unprivileged
# node user *before* installing, so node_modules is created node-owned and we
# never need a `chown -R` (which would duplicate the whole layer).
RUN mkdir -p /data && chown node:node /opt/orbit-ui /data

USER node

# The Express BFF (server.js) imports only express, cors and puppeteer-core at
# runtime. Every other production dependency is client-only and already compiled
# into dist/, so we don't ship it here — this keeps the image small and the pull
# fast. Keep this list in sync with server.js's imports + package.json ranges.
# (puppeteer-core does NOT download a browser; it uses the system chromium above.)
RUN npm install --omit=dev --no-package-lock --no-audit --no-fund \
      express@^5.2.1 \
      cors@^2.8.6 \
      puppeteer-core@^24.42.0 \
  && npm pkg set type=module \
  && npm cache clean --force

COPY --chown=node:node server.js docker-entrypoint.sh ./
COPY --chown=node:node config ./config
COPY --chown=node:node --from=builder /app/dist ./dist

RUN chmod +x docker-entrypoint.sh

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
