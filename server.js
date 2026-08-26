/**
 * Orbit Deployment UI — Express BFF (Backend for Frontend)
 * - Proxies authenticated Flux API calls (avoids CORS for zelidauth endpoints)
 * - Proxies FluxCore SSO sign/signInOrUp calls
 * - Provides server-side SSO signing for Firebase/email users
 * - Serves the built frontend in production
 */

import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, sep } from 'path';
import { readFileSync } from 'fs';
import crypto from 'crypto';
import puppeteer from 'puppeteer-core';
import {
  DEFAULT_APP_URL,
  DEFAULT_PAYMENT_BRIDGE_URL,
  DEFAULT_FIREBASE,
  DEFAULT_GA_MEASUREMENT_ID,
} from './config/defaults.js';
// Same module scripts/prerender.mjs walks to decide what to prerender, so the
// served routes and the built shells cannot drift apart.
import { MARKETING_PAGES } from './src/content/pagesContent.js';
import { FirebaseTokenVerifier } from './server/auth/firebaseTokenVerifier.js';
import { createOrbitMcpRouter } from './server/mcp/router.js';
import { OrbitServices } from './server/orbit/services.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_VERSION = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')).version;

const app = express();
const PORT = process.env.PORT || 4000;

// Prerendered marketing routes, keyed by their canonical path — no trailing
// slash, matching both the sitemap and each page's <link rel="canonical">.
// Derived from MARKETING_PAGES so a new page needs no second registration here.
const MARKETING_SHELLS = new Map(
  Object.keys(MARKETING_PAGES).map((p) => {
    const path = p.startsWith('/') ? p : `/${p}`;
    return [path, join(path.replace(/^\//, ''), 'index.html')];
  }),
);

// Client-only routes that render real UI but are not prerendered — they must
// still answer 200 with the SPA shell rather than the 404 one. Mirrors the
// non-marketing <Route>s in src/App.jsx; keep the two in step when adding a page.
const SPA_ROUTES = new Set(['/', '/login', '/deploy', '/successcheckout']);
// /dashboard has nested and parameterised children (deployments/:appName, …), so
// it is matched by prefix rather than enumerated.
const SPA_PREFIXES = ['/dashboard'];

const isSpaRoute = (path) =>
  SPA_ROUTES.has(path) ||
  SPA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

app.use(cors());
// JSON parsing only for routes that explicitly need it (see below).
// The Flux API proxy forwards raw bodies to preserve content-type.

// In production, serve the built frontend with cache headers tuned for SEO and
// repeat-visit performance (Core Web Vitals):
//  - /assets/* are content-hashed by Vite, so cache them forever (immutable).
//  - *.html (incl. the prerendered landing page) must revalidate every time so
//    deploys propagate instantly and crawlers never serve stale content.
//  - other unhashed public files (favicons, og-banner, robots.txt, sitemap.xml)
//    get a short cache so updates still appear within the hour.
if (process.env.NODE_ENV === 'production') {
  // Send the trailing-slash form to the canonical one.
  //
  // These pages used to be reachable at both, and the two forms disagreed about
  // which was real: express.static's default `redirect: true` answered
  // /decentralized-hosting with a 301 to /decentralized-hosting/, while the
  // markup served there named /decentralized-hosting as canonical — a URL that
  // redirected away again. Google indexed both and split the signals; the same
  // page sat at pos 34 under one form and pos 62 under the other.
  //
  // This runs before express.static so the static handler never sees the
  // trailing-slash form, and `redirect: false` below stops it manufacturing the
  // opposite redirect.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const stripped = req.path.slice(0, -1);
      if (MARKETING_SHELLS.has(stripped)) {
        const query = req.originalUrl.slice(req.path.length);
        return res.redirect(301, stripped + query);
      }
    }
    return next();
  });

  app.use(
    express.static(join(__dirname, 'dist'), {
      // Never 301 a directory request to its trailing-slash form: for these
      // routes that is the non-canonical URL, and the redirect above already
      // points the other way.
      redirect: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${sep}assets${sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    }),
  );

  // Thin / app-only public routes render no unique content (auth gateways and a
  // post-checkout redirect, all served from the same SPA shell). Mark them
  // noindex so they don't get indexed as duplicates of the homepage. X-Robots-Tag
  // is an HTTP header, so it works even for crawlers that don't run JS — unlike a
  // client-injected <meta robots>. These are deliberately NOT in robots.txt
  // Disallow: a disallowed URL is never fetched and so would never see this.
  const NOINDEX_ROUTES = new Set(['/login', '/deploy', '/successcheckout']);
  app.use((req, res, next) => {
    if (NOINDEX_ROUTES.has(req.path)) res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });
}

/**
 * Health check
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'orbit-bff', version: APP_VERSION, mcp: { endpoint: '/mcp', transport: 'streamable-http', stateless: true } });
});

const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE.projectId;
const publicAppOrigin = new URL(process.env.VITE_APP_URL || DEFAULT_APP_URL).origin;
app.use('/mcp', createOrbitMcpRouter({
  tokenVerifier: new FirebaseTokenVerifier({ projectId: firebaseProjectId }),
  services: new OrbitServices({
    paymentBridgeUrl: process.env.VITE_PAYMENT_BRIDGE_URL || DEFAULT_PAYMENT_BRIDGE_URL,
    appUrl: process.env.VITE_APP_URL || DEFAULT_APP_URL,
  }),
  version: APP_VERSION,
  allowedOrigins: [publicAppOrigin],
}));

/**
 * Proxy: GET /api/flux/*  → https://api.runonflux.io/*
 * Forwards the raw request body and original Content-Type unchanged so the
 * Flux API receives exactly what the client sends (e.g. form-urlencoded JSON
 * strings as used by the FluxOS frontend).
 */
app.all('/api/flux/*splat', async (req, res) => {
  const fluxPath = Array.isArray(req.params.splat) ? req.params.splat.join('/') : req.params.splat;
  const qs = new URLSearchParams(req.query).toString();
  const targetUrl = `https://api.runonflux.io/${fluxPath}${qs ? `?${qs}` : ''}`;

  try {
    // Read raw body so we can forward it byte-for-byte without re-encoding.
    const rawChunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', (c) => rawChunks.push(c));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const rawBody = Buffer.concat(rawChunks);

    const headers = {};
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['zelidauth']) headers['zelidauth'] = req.headers['zelidauth'];
    if (req.headers['enterprise-key']) headers['enterprise-key'] = req.headers['enterprise-key'];
    if (req.headers['x-apicache-bypass']) headers['x-apicache-bypass'] = req.headers['x-apicache-bypass'];

    const fetchOptions = {
      method: req.method,
      headers,
      ...(rawBody.length > 0 ? { body: rawBody } : {}),
    };

    const upstream = await fetch(targetUrl, fetchOptions);

    // Forward sticky backend header for auth endpoints
    const fluxnode = upstream.headers.get('fluxnode');
    if (fluxnode) res.setHeader('fluxnode', fluxnode);

    const data = await upstream.text();
    res.status(upstream.status).send(data);
  } catch (err) {
    console.error(`Flux proxy error [${fluxPath}]:`, err.message);
    res.status(502).json({ status: 'error', data: 'Upstream request failed' });
  }
});

/**
 * Proxy: POST /api/fluxcore/*  → https://service.fluxcore.ai/api/*
 * Used for SSO sign-in and signing operations.
 * Forwards Authorization: Bearer <idToken> from client.
 */
app.all('/api/fluxcore/*splat', express.json(), async (req, res) => {
  const fluxcorePath = Array.isArray(req.params.splat) ? req.params.splat.join('/') : req.params.splat;
  const qs = new URLSearchParams(req.query).toString();
  const targetUrl = `https://service.fluxcore.ai/api/${fluxcorePath}${qs ? `?${qs}` : ''}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'];
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: JSON.stringify(req.body) }
        : {}),
    });

    const data = await upstream.text();
    res.status(upstream.status).send(data);
  } catch (err) {
    console.error(`FluxCore proxy error [${fluxcorePath}]:`, err.message);
    res.status(502).json({ status: 'error', data: 'Upstream request failed' });
  }
});

/**
 * GET /api/flux-stream/apps/testappinstall/:hash
 * Streams NDJSON from Flux API testappinstall endpoint.
 * The generic proxy buffers responses — this route pipes the stream directly.
 */
app.get('/api/flux-stream/apps/testappinstall/:hash', async (req, res) => {
  const { hash } = req.params;
  const zelidauth = req.headers['zelidauth'];

  if (!hash) {
    return res.status(400).json({ status: 'error', data: 'Missing hash' });
  }

  const targetUrl = `https://api.runonflux.io/apps/testappinstall/${encodeURIComponent(hash)}`;

  try {
    const headers = {};
    if (zelidauth) headers['zelidauth'] = zelidauth;

    const upstream = await fetch(targetUrl, { headers });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => 'Upstream error');
      return res.status(upstream.status || 502).json({ status: 'error', data: text });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if behind proxy

    // Pipe upstream body directly to response
    const reader = upstream.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (err) {
        console.error('testappinstall stream error:', err.message);
      } finally {
        res.end();
      }
    };
    pump();
  } catch (err) {
    console.error('testappinstall proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ status: 'error', data: 'Upstream request failed' });
    }
  }
});

function envFlag(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1';
}

/**
 * GET /api/config
 * Public client configuration loaded at runtime (no secrets).
 * Inject via container environment variables — no frontend rebuild required.
 */
app.get('/api/config', (_req, res) => {
  res.json({
    appUrl: process.env.VITE_APP_URL || DEFAULT_APP_URL,
    paymentBridgeUrl: process.env.VITE_PAYMENT_BRIDGE_URL || DEFAULT_PAYMENT_BRIDGE_URL,
    firebase: {
      apiKey: process.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE.apiKey,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE.authDomain,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE.projectId,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE.storageBucket,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE.messagingSenderId,
      appId: process.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE.appId,
      measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE.measurementId,
    },
    analytics: {
      enabled: envFlag(process.env.VITE_ENABLE_ANALYTICS, true),
      measurementId: process.env.VITE_GA_MEASUREMENT_ID || DEFAULT_GA_MEASUREMENT_ID,
    },
  });
});

/**
 * GET /api/network-stats
 * Public Flux network overview for the landing-page map.
 *
 * Fetches the full node list from stats.runonflux.io (~1.8 MB, ~7k nodes) and
 * clusters it server-side into a compact ~50 KB payload (country + city
 * clusters). Cached in-memory for 30 min so we don't refetch per visitor.
 * Keeps the heavy fetch off the client and matches the BFF pattern (the
 * browser never talks to Flux infra directly).
 */
// Enterprise apps (encrypted compose) can only run on nodes reporting an
// arcaneVersion. Nested field projections keep the payload to ~2.3 MB while
// carrying more than the old `geolocation,benchmark,flux` request did: what each
// node measures on ITSELF (apps.fluxusage.nodeSpecs — os.cpus(), os.totalmem(),
// the benchmarked ssd) and what its apps have already reserved (apps.resources,
// the same payload a node serves from its own /apps/appsresources). That second
// block is the whole point: the benchmark says how big a node is, never how much
// of it is still free. NOTE: the `flux` SUBTREE must come last in a projection or
// the stats API 500s; the nested `flux.ip` form below is exempt.
const FLUX_STATS_URL = 'https://stats.runonflux.io/fluxinfo?projection='
  + [
    'flux.ip',
    'flux.arcaneVersion',
    'geolocation.continentCode',
    'geolocation.countryCode',
    'geolocation.continent',
    'geolocation.country',
    'geolocation.regionName',
    'geolocation.lat',
    'geolocation.lon',
    'apps.resources',
    'apps.fluxusage.nodeSpecs',
  ].join(',');
const NETWORK_STATS_TTL = 30 * 60 * 1000; // 30 min
// Resources reserved for each node's OS/FluxOS — an app can only use what's left.
// Mirrors FluxOS's config.lockedSystemResources: cpu 10 (tenths), ram 2000 MB,
// hdd 60 plus extrahdd 20.
const OS_RESERVE = { cores: 1, ram: 2, ssd: 80 };
// FluxOS only ever offers 95% of a node's disk to apps before subtracting the
// reserve (totalSpaceOnNode * 0.95 - hdd - extrahdd in checkAppHWRequirements).
// Leaving it out counted roughly 11 GB per 220 GB node that is never handed out.
const DISK_USABLE_FACTOR = 0.95;
let rawNodesCache = null; // { nodes, landing, timestamp }

/** What a node can offer apps in total, before anything is placed on it. */
function totalForApps(n) {
  return {
    cpu: n.cores - OS_RESERVE.cores,
    ram: n.ram - OS_RESERVE.ram,
    hdd: n.ssd * DISK_USABLE_FACTOR - OS_RESERVE.ssd,
  };
}

/** Big enough to host the app at all, ignoring what is already on it. */
function nodeFitsApp(n, hw, enterprise) {
  if (!n.cores) return false; // no self-report → cannot be sized
  if (enterprise && !n.arcane) return false;
  const t = totalForApps(n);
  return t.cpu >= hw.cpu && t.ram >= hw.ram && t.hdd >= hw.hdd;
}

/**
 * Room for the app ON TOP of what the node already runs, against a reading of its
 * reserved resources. These three lines are FluxOS's checkAppHWRequirements.
 *
 * Deliberately NOT modelled: the CPU burst headroom FluxOS reserves for enterprise
 * apps. This number is advisory and cpu/ram/disk are what customers can reason
 * about, but it does mean the count runs optimistic for enterprise apps.
 */
function roomFor(n, used, hw) {
  const t = totalForApps(n);
  return (t.cpu - used.cpu) >= hw.cpu
    && (t.ram - used.ram) >= hw.ram
    && (t.hdd - used.hdd) >= hw.hdd;
}

/** Room according to the cached aggregate. No reading means no opinion, never "free". */
function nodeHasRoom(n, hw, enterprise) {
  if (!nodeFitsApp(n, hw, enterprise)) return false;
  if (!n.used) return false;
  return roomFor(n, n.used, hw);
}

/**
 * Flatten the raw stats list into the minimal per-node shape we need for both the
 * landing map (lat/lon) and the capacity picker (hardware + IP + arcane). Multiple
 * Flux nodes can share one public IP (up to 8, on different ports), so we keep the
 * port-less IP to measure real host/network diversity per location.
 */
function normalizeRawNodes(nodes) {
  return nodes.map((node) => {
    const g = node.geolocation || {};
    const apps = node.apps || {};
    const specs = (apps.fluxusage && apps.fluxusage.nodeSpecs) || {};
    const used = apps.resources;
    const rawIp = (node.flux && node.flux.ip) || g.ip || '';
    return {
      continentCode: g.continentCode || null,
      countryCode: g.countryCode || null,
      continent: g.continent || g.continentCode || null,
      country: g.country || g.countryCode || null,
      countryCodeLc: (g.countryCode || '').toLowerCase(),
      regionName: g.regionName || '',
      lat: parseFloat(g.lat),
      lon: parseFloat(g.lon),
      ip: rawIp.split(':')[0] || null,
      // Kept whole as well as split: this is the only place the node's API PORT
      // appears, and one public IP routinely hosts several nodes on other ports.
      apiIp: rawIp || null,
      cores: specs.cpuCores || 0,
      // nodeSpecs.ram is MB and app specs are MB too — /1000, not /1024, so this
      // stays in the units the plans are expressed in.
      ram: specs.ram ? specs.ram / 1000 : 0, // GB
      ssd: specs.ssdStorage || 0, // GB
      arcane: !!(node.flux && node.flux.arcaneVersion),
      // What apps on this node have already reserved. Null when the node did not
      // report — a node with no reading is never counted as free.
      used: used && typeof used.appsCpusLocked === 'number'
        ? {
            cpu: used.appsCpusLocked || 0,
            ram: (used.appsRamLocked || 0) / 1000, // GB
            hdd: used.appsHddLocked || 0, // GB
          }
        : null,
    };
  });
}

/** Landing-page map + marketing figures (unfiltered, hardware-agnostic). */
function computeLanding(nodes) {
  const countries = {};
  const cities = {};
  let total = 0;
  for (const n of nodes) {
    if (Number.isNaN(n.lat) || Number.isNaN(n.lon)) continue;
    const country = n.country || 'Unknown';
    if (!countries[country]) {
      countries[country] = { country, countryCode: n.countryCodeLc, lat: n.lat, lon: n.lon, count: 0 };
    }
    countries[country].count++;
    // Group to a ~0.1° grid so nearby nodes form a single city dot.
    const cityKey = `${country}_${Math.round(n.lat * 10) / 10}_${Math.round(n.lon * 10) / 10}`;
    if (!cities[cityKey]) {
      cities[cityKey] = {
        lat: Math.round(n.lat * 1000) / 1000,
        lon: Math.round(n.lon * 1000) / 1000,
        count: 0,
        country,
        region: n.regionName,
      };
    }
    cities[cityKey].count++;
    total++;
  }
  const countryList = Object.values(countries)
    .map((c) => ({ ...c, lat: Math.round(c.lat * 1000) / 1000, lon: Math.round(c.lon * 1000) / 1000 }))
    .sort((a, b) => b.count - a.count);
  return {
    total,
    countryCount: countryList.length,
    countries: countryList,
    cityClusters: Object.values(cities),
  };
}

/**
 * Per-continent / per-country capacity for the deploy location picker.
 *
 * Three numbers per location, and the third is the one that decides anything:
 * `nodeCount` is how many nodes match, `ipCount` how many DISTINCT public IPs they
 * sit behind (Flux places one instance per IP, so several nodes on one IP are one
 * place for a copy to land), and `freeIpCount` how many of those have room for this
 * app right now rather than merely being big enough for it.
 *
 * Sorted by what has room, with depth as the tie-break, so a full location sinks to
 * the bottom instead of ranking on a count that cannot be used.
 * @param {null | {cpu:number, ram:number, hdd:number, enterprise:boolean}} filter
 */
function computeGeoBreakdown(nodes, filter) {
  const fits = (n) => {
    if (!n.continentCode || !n.countryCode) return false;
    if (!filter) return true;
    return nodeFitsApp(n, filter, filter.enterprise);
  };
  const blank = (rest) => ({ ...rest, nodeCount: 0, ips: new Set(), freeIps: new Set() });
  const conts = new Map();
  const countries = new Map();
  // `${cont}_${cc}_${regionName}` — FluxOS's third geolocation level, matched
  // against the node's regionName verbatim, so it is carried through untouched.
  const regions = new Map();
  const add = (m, key, rest, n, hasRoom) => {
    if (!m.has(key)) m.set(key, blank(rest));
    const a = m.get(key);
    a.nodeCount++;
    if (!n.ip) return;
    a.ips.add(n.ip);
    if (hasRoom) a.freeIps.add(n.ip);
  };
  for (const n of nodes) {
    if (!fits(n)) continue;
    // Read once per node rather than once per aggregate it belongs to.
    const hasRoom = filter ? nodeHasRoom(n, filter, filter.enterprise) : false;
    add(conts, n.continentCode, { code: n.continentCode, name: n.continent }, n, hasRoom);
    const key = `${n.continentCode}_${n.countryCode}`;
    add(countries, key, { continentCode: n.continentCode, code: n.countryCode, name: n.country }, n, hasRoom);
    if (!n.regionName) continue; // can't be placed by region — country is as deep as it goes
    add(regions, `${key}_${n.regionName}`, {
      continentCode: n.continentCode, countryCode: n.countryCode,
      code: n.regionName, name: n.regionName,
    }, n, hasRoom);
  }
  const finalize = (m) => [...m.values()]
    .map(({ ips, freeIps, ...rest }) => ({ ...rest, ipCount: ips.size, freeIpCount: freeIps.size }))
    .sort((a, b) => b.freeIpCount - a.freeIpCount || b.ipCount - a.ipCount);
  return { continents: finalize(conts), countries: finalize(countries), regions: finalize(regions) };
}

async function getRawNodes() {
  const fresh = rawNodesCache && (Date.now() - rawNodesCache.timestamp) < NETWORK_STATS_TTL;
  if (fresh) return rawNodesCache;
  const upstream = await fetch(FLUX_STATS_URL, { signal: AbortSignal.timeout(25_000) });
  const json = await upstream.json();
  if (json.status !== 'success' || !Array.isArray(json.data)) {
    throw new Error('Unexpected stats response');
  }
  const nodes = normalizeRawNodes(json.data);
  rawNodesCache = { nodes, landing: computeLanding(nodes), timestamp: Date.now() };
  return rawNodesCache;
}

/**
 * Does a node satisfy one geolocation entry?
 *
 * FluxOS encodes allowed locations as `ac<CONT>[_<COUNTRY>[_<REGION>]]` and forbidden
 * ones as `a!c<CONT>[_...]`. Orbit lets a customer mark either, so both are honoured.
 */
function matchesGeoEntry(n, entry) {
  const negative = entry.startsWith('a!c');
  const code = entry.replace(/^a!?c/, '');
  const [cont, country, ...regionParts] = code.split('_');
  // Region names legitimately contain underscores, so rejoin everything past the country.
  const region = regionParts.join('_');
  let hit = n.continentCode === cont;
  if (hit && country) hit = n.countryCode === country;
  if (hit && region) hit = n.regionName === region;
  return { hit, negative };
}

/** Nodes allowed by a whole `geolocation` array (empty array = anywhere). */
function nodesInGeolocation(nodes, geolocation) {
  const entries = (geolocation || []).filter((e) => typeof e === 'string' && e);
  if (!entries.length) return nodes;
  const allow = entries.filter((e) => !e.startsWith('a!c'));
  return nodes.filter((n) => {
    for (const entry of entries) {
      const { hit, negative } = matchesGeoEntry(n, entry);
      if (hit && negative) return false;
    }
    if (!allow.length) return true; // only exclusions were set
    return allow.some((entry) => matchesGeoEntry(n, entry).hit);
  });
}

// ── Live confirmation ────────────────────────────────────────────────────────
//
// The aggregate above is not live. A stats round over the whole network completes
// about every 13 minutes, /fluxinfo is cached 10 minutes upstream and this process
// caches 30 more, so a count can be the best part of an hour old. That is fine
// while someone is still choosing locations and not fine at the click that takes
// their money: three locations reading "1 free" each can be one that is free and
// two that were taken half an hour ago, and nothing on the screen would say so.
//
// So the commit points ask the nodes themselves. It is a smaller question than the
// aggregate answers -- "are there still at least this many", which can stop the
// moment the answer is yes, rather than "how many are free", which needs every
// candidate measured. A selection of four host servers and one of four hundred both
// settle in a handful of requests.
//
// Probed here rather than in the browser so one cache serves every visitor, and
// because the BFF is where this app talks to Flux infrastructure.
const PROBE_TIMEOUT_MS = 4000;
const PROBE_BATCH = 8;
const MAX_LIVE_PROBES = 24;
const LIVE_BUDGET_MS = 6000;
const PROBE_CACHE_TTL_MS = 60 * 1000;
/** How much spare the cached reading must show before a live check is skipped. */
const LIVE_CHECK_MARGIN = 3;
const liveUsageCache = new Map(); // apiIp -> { at, used|null }

/** `1.2.3.4:16127` → `https://1-2-3-4-16127.node.api.runonflux.io` */
function nodeApiBase(ip) {
  if (!ip) return null;
  const [host, port = '16127'] = String(ip).split(':');
  return `https://${host.replace(/\./g, '-')}-${port}.node.api.runonflux.io`;
}

/**
 * Ask one node what its apps have reserved, right now. `/apps/appsresources` is
 * public and cached node-side for 30s.
 *
 * Returns null for unknown, and unknown must never read as "full": a warning built
 * on a request that failed is a guess, and a guess is what teaches people to click
 * through the ones that are real.
 */
async function probeNodeUsage(node) {
  const key = node.apiIp || node.ip;
  const base = nodeApiBase(key);
  if (!base) return null;
  const hit = liveUsageCache.get(key);
  if (hit && Date.now() - hit.at < PROBE_CACHE_TTL_MS) return hit.used;

  let used = null;
  try {
    const r = await fetch(`${base}/apps/appsresources`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const body = await r.json();
    const d = body && body.data;
    if (body && body.status === 'success' && d && typeof d.appsCpusLocked === 'number') {
      used = {
        cpu: d.appsCpusLocked,
        ram: (Number(d.appsRamLocked) || 0) / 1000, // the node reports MB, like the aggregate
        hdd: Number(d.appsHddLocked) || 0,
      };
    }
  } catch { /* unreachable, timed out or malformed — stays unknown */ }
  // Failures are cached too: a node that just spent four seconds timing out is not
  // worth the same four on the next customer's click.
  liveUsageCache.set(key, { at: Date.now(), used });
  return used;
}

/**
 * One node per unique IP, best bet first.
 *
 * Flux places one copy per IP, so an IP is settled by a single node with room and
 * there is nothing to learn from asking its neighbours. The node worth asking is the
 * one the cached reading rates highest: for an IP that reads free, a node with room;
 * for one that reads full, whichever came closest, since that is the likeliest to
 * have been freed since. Free-looking IPs first because they are what a confirmation
 * needs, each group shuffled so every request does not question the same node.
 */
function probeTargets(candidates, hw, enterprise) {
  const best = new Map();
  for (const n of candidates) {
    if (!n.ip) continue;
    const room = nodeHasRoom(n, hw, enterprise);
    // RAM decides most of these, so it is the tie-break.
    const spare = n.used ? totalForApps(n).ram - n.used.ram : -Infinity;
    const cur = best.get(n.ip);
    if (!cur || (room && !cur.room) || (room === cur.room && spare > cur.spare)) {
      best.set(n.ip, { node: n, room, spare });
    }
  }
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const entries = [...best.values()];
  return [...shuffle(entries.filter((e) => e.room)), ...shuffle(entries.filter((e) => !e.room))];
}

/**
 * Confirm against the nodes themselves that a selection still has room for `need`
 * copies.
 *
 * @returns {Promise<null|{freeIpCount:number, complete:boolean}>} null when we could
 *   not tell and the cached verdict must stand: the budget ran out before enough was
 *   confirmed, or a node never answered while the ones that did were not enough on
 *   their own. Both are unknown, not full. `complete` is true only when every
 *   candidate IP answered, the only case where `freeIpCount` is an exact count
 *   rather than a floor, and so the only case worth putting on a screen.
 */
async function confirmFreeIpCount(candidates, hw, enterprise, need) {
  if (!(need > 0)) return { freeIpCount: 0, complete: true };
  const targets = probeTargets(candidates, hw, enterprise);
  if (!targets.length) return { freeIpCount: 0, complete: true };

  const deadline = Date.now() + LIVE_BUDGET_MS;
  let confirmed = 0;
  let asked = 0;
  let failed = 0;
  while (confirmed < need && asked < targets.length
    && asked < MAX_LIVE_PROBES && Date.now() < deadline) {
    const batch = targets.slice(asked, asked + PROBE_BATCH);
    asked += batch.length;
    const readings = await Promise.all(batch.map((t) => probeNodeUsage(t.node)));
    readings.forEach((used, i) => {
      if (!used) { failed += 1; return; }
      if (roomFor(batch[i].node, used, hw)) confirmed += 1;
    });
  }
  if (confirmed >= need) return { freeIpCount: confirmed, complete: asked === targets.length && !failed };
  // Short of the target with questions left unasked, or with a node that never
  // answered among the ones we did ask: either could hide the copy that decides it.
  if (asked < targets.length || failed) return null;
  return { freeIpCount: confirmed, complete: true };
}

/**
 * POST /api/deploy-capacity
 * Whether ONE selection of locations can host ONE app, judged as a whole.
 *
 * Capacity is a property of the selection, never of a single location in it: Flux
 * places into the pool of every allowed location, so Portugal's 2 IPs and Spain's 20
 * are 22 candidates and the app places fine. Any per-location gate asks the wrong
 * question -- which is why the picker offers everything with a node that fits, and
 * the judgement happens here, once, on the way to committing.
 *
 * Body: { geolocation: string[] (Flux `ac…` / `a!c…` tokens), cpu, ram, hdd,
 *         enterprise, instances, probe = true }
 * Returns { nodeCount, ipCount, freeIpCount, instances, live, verdict } where verdict
 * is 'short' (the selection can never hold the copies, permanent), 'full' (the host
 * servers exist and are occupied, about right now) or null.
 */
app.post('/api/deploy-capacity', express.json(), async (req, res) => {
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const body = req.body || {};
  const hw = { cpu: num(body.cpu), ram: num(body.ram), hdd: num(body.hdd) };
  const enterprise = body.enterprise === true || body.enterprise === '1' || body.enterprise === 'true';
  const instances = Math.max(1, Math.round(num(body.instances)) || 1);
  const geolocation = Array.isArray(body.geolocation) ? body.geolocation : [];

  let nodes;
  try {
    ({ nodes } = await getRawNodes());
  } catch (err) {
    console.error('deploy-capacity error:', err.message);
    if (!rawNodesCache) return res.status(502).json({ status: 'error', message: 'Could not load network stats' });
    nodes = rawNodesCache.nodes;
  }

  const candidates = nodesInGeolocation(nodes, geolocation)
    .filter((n) => n.continentCode && n.countryCode && nodeFitsApp(n, hw, enterprise) && n.ip);
  const ips = new Set(candidates.map((n) => n.ip));
  const freeIps = new Set(candidates.filter((n) => nodeHasRoom(n, hw, enterprise)).map((n) => n.ip));
  let freeIpCount = freeIps.size;
  let live = false;

  // Only when the answer could change. A selection with room to spare is not worth
  // the wait -- every one of those host servers would have to fill inside the same
  // half hour -- and 'short' is arithmetic over unique IPs no live reading can move.
  // `probe: false` is the location picker asking as the customer edits, where a
  // round of requests per keystroke would be absurd and the cached figure is what
  // the aggregate is for. The commit points leave it on.
  const worthChecking = body.probe !== false
    && ips.size >= instances
    && freeIpCount - instances <= LIVE_CHECK_MARGIN;
  if (worthChecking) {
    const confirmed = await confirmFreeIpCount(candidates, hw, enterprise, instances);
    if (confirmed && confirmed.complete) {
      // Every candidate answered: an exact count, measured, and it replaces the cache.
      freeIpCount = confirmed.freeIpCount;
      live = true;
    } else if (confirmed) {
      // Stopped early because enough was already confirmed: a floor, not a count. It
      // cannot correct the cached figure, but the cached figure must not contradict
      // it either -- a stale 'full' does not stand against copies proven to have
      // somewhere to go. `live` stays false: this number was not the one measured.
      freeIpCount = Math.max(freeIpCount, confirmed.freeIpCount);
    }
    // confirmed === null: could not tell, so the cached verdict stands untouched.
  }

  let verdict = null;
  if (ips.size < instances) verdict = 'short';
  else if (freeIpCount < instances) verdict = 'full';

  res.json({
    nodeCount: candidates.length,
    ipCount: ips.size,
    freeIpCount,
    instances,
    live,
    verdict,
  });
});

app.get('/api/network-stats', async (req, res) => {
  // Optional capacity filter (deploy wizard / spec editor): only count nodes that
  // can host the app. Absent params (landing page) → unfiltered breakdown, still
  // annotated with unique-IP counts.
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const hasFilter = ['cpu', 'ram', 'hdd', 'enterprise'].some((k) => k in req.query);
  const filter = hasFilter
    ? {
        cpu: num(req.query.cpu),
        ram: num(req.query.ram),
        hdd: num(req.query.hdd),
        enterprise: req.query.enterprise === '1' || req.query.enterprise === 'true',
      }
    : null;

  try {
    const { nodes, landing } = await getRawNodes();
    res.json({ ...landing, geo: computeGeoBreakdown(nodes, filter) });
  } catch (err) {
    console.error('network-stats error:', err.message);
    // Serve stale cache if we have any, otherwise signal failure.
    if (rawNodesCache) {
      return res.json({ ...rawNodesCache.landing, geo: computeGeoBreakdown(rawNodesCache.nodes, filter) });
    }
    res.status(502).json({ status: 'error', message: 'Could not load network stats' });
  }
});

/**
 * POST /api/node-proxy
 * Proxies API calls to individual Flux nodes (avoids CORS and mixed-content issues).
 * Body: { nodeBase, path, method, zelidauth, data }
 *
 * SSRF protection: validates nodeBase matches the node.api.runonflux.io pattern.
 * Streams the upstream response body back to the client — supports both single-JSON
 * and Flux's concatenated-JSON streaming ops (redeploy, restart, etc.).
 */
const NODE_BASE_PATTERN = /^https:\/\/[\d-]+-\d+\.node\.api\.runonflux\.io$/;

app.post('/api/node-proxy', express.json(), async (req, res) => {
  const { nodeBase, path: nodePath, method = 'GET', zelidauth, enterpriseKey, data } = req.body || {};

  if (!nodeBase || !nodePath) {
    return res.status(400).json({ status: 'error', data: 'Missing nodeBase or path' });
  }

  if (!NODE_BASE_PATTERN.test(nodeBase)) {
    return res.status(400).json({ status: 'error', data: 'Invalid nodeBase URL' });
  }

  const targetUrl = `${nodeBase}${nodePath.startsWith('/') ? nodePath : `/${nodePath}`}`;

  try {
    // Flux nodes expect application/x-www-form-urlencoded (not JSON)
    const bodyStr = data ? new URLSearchParams(data).toString() : null;
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (zelidauth) headers['zelidauth'] = zelidauth;
    if (enterpriseKey) headers['enterprise-key'] = enterpriseKey;

    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      signal: AbortSignal.timeout(90_000),
      ...(bodyStr ? { body: bodyStr } : {}),
    };

    const upstream = await fetch(targetUrl, fetchOptions);
    // Pipe the response body stream directly — client handles parsing.
    // This supports both single-JSON and Flux's concatenated-JSON streaming ops.
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    res.setHeader('Content-Type', ct || 'application/json');
    const { Readable } = await import('node:stream');
    const readable = Readable.fromWeb(upstream.body);
    // Must handle 'error' on the readable — otherwise ECONNRESET from the
    // upstream node becomes an uncaught exception and crashes the process.
    readable.on('error', (streamErr) => {
      console.error(`node-proxy stream error [${targetUrl}]:`, streamErr.message);
      if (!res.writableEnded) res.end();
    });
    // If the client disconnects, stop reading from the upstream.
    res.on('error', () => readable.destroy());
    readable.pipe(res);
  } catch (err) {
    console.error(`node-proxy error [${targetUrl}]:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ status: 'error', data: 'Node request failed' });
    }
  }
});

/**
 * POST /api/enterprise-decrypt
 * Server-side enterprise spec decryption — avoids WebCrypto browser requirement.
 * Body: { specName, specOwner, zelidauth }
 *
 * Flow:
 *  1. GET  /apps/apporiginalowner/<name>  → canonical owner
 *  2. POST /apps/getpublickey { name, owner } → RSA-2048 public key (SPKI/DER base64)
 *  3. Generate ephemeral AES-256 key; RSA-OAEP/SHA-256 wrap it
 *  4. GET  /apps/appspecifications/<name>/true  with enterprise-key header
 *     → node re-encrypts blob with our AES key (nonce|ciphertext+tag)
 *  5. AES-GCM decrypt → JSON { contacts, compose }
 */
app.post('/api/enterprise-decrypt', express.json(), async (req, res) => {
  const { specName, specOwner, zelidauth } = req.body || {};
  if (!specName || !zelidauth) {
    return res.status(400).json({ status: 'error', data: 'Missing specName or zelidauth' });
  }

  const FLUX_API = 'https://api.runonflux.io';
  const tag = `[enterprise-decrypt:${specName}]`;

  try {
    // 0. Original owner
    let owner = specOwner || '';
    try {
      console.log(`${tag} step 0: fetching original owner`);
      const ownerRes = await fetch(`${FLUX_API}/apps/apporiginalowner/${encodeURIComponent(specName)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const ownerJson = await ownerRes.json();
      if (ownerJson.status === 'success' && ownerJson.data) owner = ownerJson.data;
      console.log(`${tag} step 0 done: owner=${owner}`);
    } catch (e) {
      console.warn(`${tag} step 0 failed (using fallback):`, e.message);
    }

    // 1. Get RSA public key
    console.log(`${tag} step 1: getpublickey name=${specName} owner=${owner}`);
    const pkRes = await fetch(`${FLUX_API}/apps/getpublickey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', zelidauth },
      body: JSON.stringify({ name: specName, owner }),
      signal: AbortSignal.timeout(20_000),
    });
    const pkJson = await pkRes.json();
    console.log(`${tag} step 1 done: status=${pkJson.status} keyLen=${pkJson.data?.length}`);
    if (pkJson.status !== 'success' || !pkJson.data) {
      return res.json({ status: 'error', data: `getpublickey failed: ${pkJson.data || pkJson.status}` });
    }

    // 2. Import RSA public key (SPKI DER, base64-encoded)
    const pubKeyDer = Buffer.from(pkJson.data.trim().replace(/\s+/g, ''), 'base64');
    const rsaKey = crypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });

    // 3. Generate ephemeral AES-256 key, base64-encode it, RSA-OAEP wrap it
    //    (matches browser impl: RSA encrypts the base64 string of the raw key bytes)
    const aesKeyBytes = crypto.randomBytes(32);
    const aesKeyB64 = aesKeyBytes.toString('base64');
    const encryptedAesKey = crypto.publicEncrypt(
      { key: rsaKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(aesKeyB64),
    );
    const enterpriseKeyB64 = encryptedAesKey.toString('base64');
    console.log(`${tag} step 3 done: aes key wrapped`);

    // 4. Fetch re-encrypted spec from same CDN endpoint
    console.log(`${tag} step 4: appspecifications/true`);
    const specRes = await fetch(
      `${FLUX_API}/apps/appspecifications/${encodeURIComponent(specName)}/true`,
      {
        headers: {
          zelidauth,
          'enterprise-key': enterpriseKeyB64,
          'x-apicache-bypass': 'true',
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    const specJson = await specRes.json();
    console.log(`${tag} step 4 done: status=${specJson.status} hasEnterprise=${!!specJson.data?.enterprise}`);
    if (specJson.status !== 'success' || !specJson.data?.enterprise) {
      return res.json({ status: 'error', data: `appspecifications/true failed: ${specJson.data?.message || specJson.status}` });
    }

    // 5. AES-GCM decrypt: node returns nonce(12B) | ciphertext+tag
    const encBuf = Buffer.from(specJson.data.enterprise, 'base64');
    const nonce = encBuf.subarray(0, 12);
    const ciphertextTag = encBuf.subarray(12);
    const ciphertext = ciphertextTag.subarray(0, ciphertextTag.length - 16);
    const authTag = ciphertextTag.subarray(ciphertextTag.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKeyBytes, nonce);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const fields = JSON.parse(plain);
    console.log(`${tag} ✅ success, compose services: ${fields.compose?.length}`);

    return res.json({ status: 'success', data: fields });
  } catch (err) {
    console.error(`${tag} ❌ error:`, err.message);
    return res.status(500).json({ status: 'error', data: err.message });
  }
});


/**
 * Proxies requests to a specific node's Orbit management (webhook) server.
 * Body: { nodeIp, mgmtPort, path }
 *
 * Allowed paths: /status  or  /logs/<releaseId>
 */
const VALID_ORBIT_PATH = /^\/status$|^\/logs\/[a-zA-Z0-9_-]{1,80}$|^\/applogs$/;
const VALID_IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

app.post('/api/orbit-node-status', express.json(), async (req, res) => {
  const { nodeIp, mgmtPort, path: statusPath = '/status', query, apiKey } = req.body || {};

  if (!nodeIp || !VALID_IPV4.test(nodeIp)) {
    return res.status(400).json({ error: 'Invalid nodeIp' });
  }
  const port = parseInt(mgmtPort, 10);
  if (!port || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Invalid mgmtPort' });
  }
  if (!VALID_ORBIT_PATH.test(statusPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // query must be a safe alphanumeric query string (no injection vectors)
  const qs = typeof query === 'string' && /^[a-zA-Z0-9=&%_.+-]{0,200}$/.test(query) ? query : '';
  const targetUrl = `http://${nodeIp}:${port}${statusPath}${qs ? `?${qs}` : ''}`;
  try {
    const headers = { Accept: 'application/json, text/plain, */*' };
    if (apiKey && typeof apiKey === 'string') headers['X-API-Key'] = apiKey;
    const upstream = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } else {
      const text = await upstream.text();
      res.status(upstream.status).type('text/plain').send(text);
    }
  } catch (err) {
    console.error(`orbit-node-status error [${targetUrl}]:`, err.message);
    res.status(502).json({ error: 'Node unreachable', detail: err.message });
  }
});

/**
 * POST /api/orbit-deploy
 * Triggers a redeploy (or hard redeploy) on a specific Orbit node by posting
 * a synthetic push payload to that node's webhook server.
 * Body: { nodeIp, mgmtPort, webhookSecret, branch, hardRedeploy }
 */
app.post('/api/orbit-deploy', express.json(), async (req, res) => {
  const { nodeIp, mgmtPort, webhookSecret, branch = 'main', hardRedeploy = false, apiKey } = req.body || {};

  if (!nodeIp || !VALID_IPV4.test(nodeIp)) {
    return res.status(400).json({ error: 'Invalid nodeIp' });
  }
  const port = parseInt(mgmtPort, 10);
  if (!port || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Invalid mgmtPort' });
  }

  // Build a minimal push-event payload
  const payload = JSON.stringify({
    ref: `refs/heads/${branch}`,
    forced: Boolean(hardRedeploy),
    head_commit: {
      id: '0000000000000000000000000000000000000000',
      message: hardRedeploy ? 'Hard redeploy from Orbit UI' : 'Redeploy from Orbit UI',
    },
  });

  const headers = {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'push',
  };

  if (apiKey && typeof apiKey === 'string') headers['X-API-Key'] = apiKey;
  if (webhookSecret) {
    const sig = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    headers['X-Hub-Signature-256'] = sig;
  }

  const targetUrl = `http://${nodeIp}:${port}/webhook`;
  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error(`orbit-deploy error [${targetUrl}]:`, err.message);
    res.status(502).json({ error: 'Node unreachable', detail: err.message });
  }
});

/**
/**
 * Screenshot — shared browser instance + 1-hour in-memory cache.
 */
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/snap/bin/chromium';
let _browser = null;
const screenshotCache = new Map(); // url → { buf, ts }
const SCREENSHOT_TTL = 60 * 60 * 1000;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  _browser.on('disconnected', () => { _browser = null; });
  return _browser;
}

/**
 * GET /api/screenshot?url=<encoded-url>
 * Takes a headless screenshot and returns it as a JPEG.
 */
app.get('/api/screenshot', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  let decoded;
  try {
    decoded = decodeURIComponent(url);
    new URL(decoded);
  } catch {
    return res.status(400).send('Invalid url');
  }

  // Serve from cache if fresh
  const cached = screenshotCache.get(decoded);
  if (cached && Date.now() - cached.ts < SCREENSHOT_TTL) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(cached.buf);
  }

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(decoded, { waitUntil: 'networkidle2', timeout: 20000 });
    const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
    await page.close();

    screenshotCache.set(decoded, { buf, ts: Date.now() });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(buf);
  } catch (err) {
    console.error('screenshot error:', err.message);
    res.status(502).send('Screenshot unavailable');
  }
});

if (process.env.NODE_ENV === 'production') {
  app.get('/*splat', (req, res) => {
    // Always revalidate so a new deploy is picked up immediately.
    res.setHeader('Cache-Control', 'no-cache');

    // express.static no longer resolves a bare directory to its index (see
    // `redirect: false` above), so the prerendered shells are served here by
    // their canonical, slashless path. Without this they would fall through to
    // the SPA shell and every marketing URL would serve the homepage's markup
    // to crawlers.
    const shell = MARKETING_SHELLS.get(req.path);
    if (shell) return res.sendFile(join(__dirname, 'dist', shell));

    if (isSpaRoute(req.path)) {
      return res.sendFile(join(__dirname, 'dist', 'index.html'));
    }

    // Anything else is a genuine 404 and now says so. Answering 200 with the SPA
    // shell turned every typo, dead backlink and probe into a "valid page" as far
    // as a crawler is concerned, which wastes crawl budget on URLs that will
    // never rank and can get thin near-duplicates of the homepage indexed.
    return res.status(404).sendFile(join(__dirname, 'dist', '404.html'));
  });
}

// Safety net — keep the process alive if a stream/handler throws unexpectedly.
// Individual handlers are still responsible for proper error responses.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server kept alive):', reason?.message ?? reason);
});

const server = createHttpServer(app);
server.listen(PORT, () => {
  console.log(`🚀 Orbit BFF running on http://localhost:${PORT}`);
});

export default app;
