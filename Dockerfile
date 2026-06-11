# syntax=docker/dockerfile:1

# ── Build frontend (no secrets or env-specific config required) ──────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY config ./config
COPY public ./public
COPY src ./src

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

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js docker-entrypoint.sh ./
COPY config ./config
COPY --from=builder /app/dist ./dist

RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /data \
  && chown -R node:node /opt/orbit-ui /data

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
