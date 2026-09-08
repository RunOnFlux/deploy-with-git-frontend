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

# Install the Express BFF and MCP runtime dependencies. Keep this list in sync
# with server.js and server/** imports.
# runtime. Every other production dependency is client-only and already compiled
# into dist/, so we don't ship it here — this keeps the image small and the pull
# fast. Keep this list in sync with server.js's imports + package.json ranges.
# (puppeteer-core does NOT download a browser; it uses the system chromium above.)
RUN npm install --omit=dev --no-package-lock --no-audit --no-fund \
      express@^5.2.1 \
      cors@^2.8.6 \
      puppeteer-core@^24.42.0 \
      @modelcontextprotocol/server@^2.0.0 \
      @modelcontextprotocol/node@^2.0.0 \
      jose@^6.2.10 \
      zod@^4.4.3 \
  && npm pkg set type=module \
  && npm cache clean --force

COPY --chown=node:node server.js docker-entrypoint.sh package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node config ./config
COPY --chown=node:node --from=builder /app/dist ./dist
# server.js reads the marketing route list from this module so the served routes
# and the prerendered shells cannot drift. It is the only thing it needs from
# src/, and it has no imports of its own — the rest of src/ deliberately stays
# out of the runtime image.
COPY --chown=node:node src/content/pagesContent.js ./src/content/pagesContent.js
COPY --chown=node:node src/services/deployService.js ./src/services/deployService.js
COPY --chown=node:node src/services/databaseSpec.js ./src/services/databaseSpec.js
COPY --chown=node:node src/services/geolocationSpec.js ./src/services/geolocationSpec.js
COPY --chown=node:node src/services/appSpecParser.js ./src/services/appSpecParser.js
COPY --chown=node:node src/services/repoIntelligenceService.js ./src/services/repoIntelligenceService.js
COPY --chown=node:node src/services/repoConfigImportService.js ./src/services/repoConfigImportService.js
# deployService imports this for the replicated-folder container data. Added to the tree in
# "Add replicated persistent folders" without a line here, which is what stopped the image
# booting from v1.4.21 onwards.
COPY --chown=node:node src/services/persistentVolumeService.js ./src/services/persistentVolumeService.js
# deployService imports this for the free trial's on-chain grant, which it puts in the spec.
COPY --chown=node:node src/config/offer.js ./src/config/offer.js

# THE LIST ABOVE IS A LANDMINE, so the build steps on it deliberately.
#
# Every runtime file is named one by one, on purpose — the rest of src/ is client code already
# compiled into dist/ and has no business in this image. The cost is that adding an import to a
# file already on the list silently leaves the image without it, and NOTHING notices: the build
# succeeds, the push succeeds, the release succeeds, and the container exits on its first line
# of work. That is exactly what happened between v1.4.21 and v1.5.0.
#
# This resolves the whole graph server.js reaches. A module missing from the list now fails the
# BUILD, where it costs minutes, instead of the deploy, where it costs the site. It imports
# rather than executes: the module body runs (which is the point — that is what resolves the
# imports), the listen it starts is thrown away with the container, and the timeout means a
# module that blocks on something cannot hang the build forever.
RUN timeout 60 node -e "import('./server.js').then(() => { console.log('runtime module graph resolves'); process.exit(0); }, (e) => { console.error('MISSING FROM IMAGE:', e.message); process.exit(1); })"

RUN chmod +x docker-entrypoint.sh

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
