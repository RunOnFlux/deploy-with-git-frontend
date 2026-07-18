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
import crypto from 'crypto';
import puppeteer from 'puppeteer-core';
import {
  DEFAULT_APP_URL,
  DEFAULT_PAYMENT_BRIDGE_URL,
  DEFAULT_FIREBASE,
  DEFAULT_GA_MEASUREMENT_ID,
} from './config/defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

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
  app.use(
    express.static(join(__dirname, 'dist'), {
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
  res.json({ status: 'ok', service: 'orbit-bff' });
});

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
// arcaneVersion; both enterprise and standard apps need benchmark (hardware) to
// size nodes. NOTE: `flux` MUST come last — the stats API returns an internal
// error when `flux` is the first projection field.
const FLUX_STATS_URL = 'https://stats.runonflux.io/fluxinfo?projection=geolocation,benchmark,flux';
const NETWORK_STATS_TTL = 30 * 60 * 1000; // 30 min
// Resources reserved for each node's OS/FluxOS — an app can only use what's left.
const OS_RESERVE = { cores: 1, ram: 2, ssd: 80 };
let rawNodesCache = null; // { nodes, landing, timestamp }

/**
 * Flatten the raw stats list into the minimal per-node shape we need for both the
 * landing map (lat/lon) and the capacity picker (hardware + IP + arcane). Multiple
 * Flux nodes can share one public IP (up to 8, on different ports), so we keep the
 * port-less IP to measure real host/network diversity per location.
 */
function normalizeRawNodes(nodes) {
  return nodes.map((node) => {
    const g = node.geolocation || {};
    const b = (node.benchmark && node.benchmark.bench) || {};
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
      cores: b.cores || 0,
      ram: b.ram || 0, // GB
      ssd: b.ssd || 0, // GB
      arcane: !!(node.flux && node.flux.arcaneVersion),
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
 * Per-continent / per-country capacity for the deploy location picker. Counts both
 * nodes AND unique public IPs (the real placement constraint — Flux spreads an
 * app's instances across distinct IPs). When a hardware/enterprise filter is given,
 * only nodes that can actually host the app (after the OS reserve) are counted.
 * @param {null | {cpu:number, ram:number, hdd:number, enterprise:boolean}} filter
 */
function computeGeoBreakdown(nodes, filter) {
  const fits = (n) => {
    if (!n.continentCode || !n.countryCode) return false;
    if (!filter) return true;
    if (!n.cores) return false; // no benchmark → can't be sized when filtering
    if (filter.enterprise && !n.arcane) return false;
    if (n.cores - OS_RESERVE.cores < filter.cpu) return false;
    if (n.ram - OS_RESERVE.ram < filter.ram) return false;
    if (n.ssd - OS_RESERVE.ssd < filter.hdd) return false;
    return true;
  };
  const conts = new Map(); // code -> { code, name, nodeCount, ips:Set }
  const countries = new Map(); // `${cont}_${cc}` -> { continentCode, code, name, nodeCount, ips:Set }
  for (const n of nodes) {
    if (!fits(n)) continue;
    if (!conts.has(n.continentCode)) {
      conts.set(n.continentCode, { code: n.continentCode, name: n.continent, nodeCount: 0, ips: new Set() });
    }
    const c = conts.get(n.continentCode);
    c.nodeCount++; if (n.ip) c.ips.add(n.ip);
    const key = `${n.continentCode}_${n.countryCode}`;
    if (!countries.has(key)) {
      countries.set(key, { continentCode: n.continentCode, code: n.countryCode, name: n.country, nodeCount: 0, ips: new Set() });
    }
    const cc = countries.get(key);
    cc.nodeCount++; if (n.ip) cc.ips.add(n.ip);
  }
  const finalize = (m) => [...m.values()]
    .map(({ ips, ...rest }) => ({ ...rest, ipCount: ips.size }))
    .sort((a, b) => b.ipCount - a.ipCount);
  return { continents: finalize(conts), countries: finalize(countries) };
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
  app.get('/*splat', (_req, res) => {
    // SPA fallback: always revalidate so a new deploy is picked up immediately.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(__dirname, 'dist', 'index.html'));
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
