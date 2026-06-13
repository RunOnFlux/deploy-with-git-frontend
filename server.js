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
import { dirname, join } from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import puppeteer from 'puppeteer-core';
import {
  DEFAULT_APP_URL,
  DEFAULT_PAYMENT_BRIDGE_URL,
  DEFAULT_FIREBASE,
  DEFAULT_GA_MEASUREMENT_ID,
} from './config/defaults.js';

const require = createRequire(import.meta.url);
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');
const bitcoinMessage = require('bitcoinjs-message');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
// JSON parsing only for routes that explicitly need it (see below).
// The Flux API proxy forwards raw bodies to preserve content-type.

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
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
    ssoProvider: process.env.SSO_PROVIDER || 'self',
    appUrl: process.env.VITE_APP_URL || DEFAULT_APP_URL,
    paymentBridgeUrl: process.env.VITE_PAYMENT_BRIDGE_URL || DEFAULT_PAYMENT_BRIDGE_URL,
    stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
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
const FLUX_STATS_URL = 'https://stats.runonflux.io/fluxinfo?projection=geolocation,tier';
const NETWORK_STATS_TTL = 30 * 60 * 1000; // 30 min
let networkStatsCache = null; // { data, timestamp }

function clusterNodeData(nodes) {
  const countries = {};
  const cities = {};
  // Code-based breakdown for the deploy location picker (capacity filtering).
  const geoContinents = {}; // code -> { code, name, nodeCount }
  const geoCountries = {};  // `${continentCode}_${countryCode}` -> { continentCode, code, name, nodeCount }
  let total = 0;

  for (const node of nodes) {
    const g = node.geolocation || {};

    // Count availability by continent/country code regardless of lat/lon
    // (matches the FluxOS location picker, which uses projection=geo).
    if (g.continentCode && g.countryCode) {
      if (!geoContinents[g.continentCode]) {
        geoContinents[g.continentCode] = { code: g.continentCode, name: g.continent || g.continentCode, nodeCount: 0 };
      }
      geoContinents[g.continentCode].nodeCount++;
      const key = `${g.continentCode}_${g.countryCode}`;
      if (!geoCountries[key]) {
        geoCountries[key] = { continentCode: g.continentCode, code: g.countryCode, name: g.country || g.countryCode, nodeCount: 0 };
      }
      geoCountries[key].nodeCount++;
    }

    const lat = parseFloat(g.lat);
    const lon = parseFloat(g.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const country = g.country || 'Unknown';
    const countryCode = (g.countryCode || '').toLowerCase();
    const region = g.regionName || '';

    if (!countries[country]) {
      countries[country] = { country, countryCode, lat, lon, count: 0 };
    }
    countries[country].count++;

    // Group to a ~0.1° grid so nearby nodes form a single city dot.
    const cityKey = `${country}_${Math.round(lat * 10) / 10}_${Math.round(lon * 10) / 10}`;
    if (!cities[cityKey]) {
      cities[cityKey] = {
        lat: Math.round(lat * 1000) / 1000,
        lon: Math.round(lon * 1000) / 1000,
        count: 0,
        country,
        region,
      };
    }
    cities[cityKey].count++;
    total++;
  }

  // Round country centroids too; they're only used to place a marker.
  const countryList = Object.values(countries)
    .map((c) => ({ ...c, lat: Math.round(c.lat * 1000) / 1000, lon: Math.round(c.lon * 1000) / 1000 }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    countryCount: countryList.length,
    countries: countryList,
    cityClusters: Object.values(cities),
    geo: {
      continents: Object.values(geoContinents).sort((a, b) => b.nodeCount - a.nodeCount),
      countries: Object.values(geoCountries).sort((a, b) => b.nodeCount - a.nodeCount),
    },
  };
}

app.get('/api/network-stats', async (_req, res) => {
  const fresh = networkStatsCache && (Date.now() - networkStatsCache.timestamp) < NETWORK_STATS_TTL;
  if (fresh) return res.json(networkStatsCache.data);

  try {
    const upstream = await fetch(FLUX_STATS_URL, { signal: AbortSignal.timeout(25_000) });
    const json = await upstream.json();
    if (json.status !== 'success' || !Array.isArray(json.data)) {
      throw new Error('Unexpected stats response');
    }
    const data = clusterNodeData(json.data);
    networkStatsCache = { data, timestamp: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('network-stats error:', err.message);
    // Serve stale cache if we have any, otherwise signal failure.
    if (networkStatsCache) return res.json(networkStatsCache.data);
    res.status(502).json({ status: 'error', message: 'Could not load network stats' });
  }
});

/**
 * Server-side SSO signing for Firebase/email users.
 *
 * Each Firebase user gets a deterministic Flux keypair derived from:
 *   HMAC-SHA256(SSO_SIGNING_SECRET, uid)
 * This means:
 *  - No key storage needed (deterministic from uid)
 *  - Same user always gets the same zelid across server restarts
 *  - Keep SSO_SIGNING_SECRET safe — changing it changes all zelids
 */

// JWKS client for verifying Firebase ID tokens
const firebaseJwksClient = jwksClient({
  jwksUri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  cache: true,
  cacheMaxAge: 3600000, // 1 hour
});

const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE.projectId;

async function verifyFirebaseToken(idToken) {
  return new Promise((resolve, reject) => {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded?.header?.kid) return reject(new Error('Invalid token format'));

    firebaseJwksClient.getSigningKey(decoded.header.kid, (err, key) => {
      if (err) return reject(new Error('Failed to fetch signing key'));
      const pubKey = key.getPublicKey();
      jwt.verify(
        idToken,
        pubKey,
        {
          algorithms: ['RS256'],
          audience: FIREBASE_PROJECT_ID,
          issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        },
        (verifyErr, payload) => {
          if (verifyErr) return reject(new Error(`Token verification failed: ${verifyErr.message}`));
          resolve(payload);
        },
      );
    });
  });
}

function deriveFluxKeypair(uid) {
  const secret = process.env.SSO_SIGNING_SECRET;
  if (!secret) throw new Error('SSO_SIGNING_SECRET not configured');
  if (!uid) throw new Error('uid is undefined — check Firebase token claims (uid vs user_id)');
  const privateKey = crypto.createHmac('sha256', secret).update(uid).digest();
  if (!ecc.isPrivate(privateKey)) throw new Error('Derived key is invalid');
  const publicKey = Buffer.from(ecc.pointFromScalar(privateKey));
  const { address } = bitcoin.payments.p2pkh({ pubkey: publicKey });
  return { privateKey, address };
}

/**
 * POST /api/sso/zelid
 * Returns the deterministic Flux zelid for the authenticated Firebase user.
 * Used in authService so the zelid is set as app owner.
 */
app.post('/api/sso/zelid', express.json(), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!idToken) return res.status(401).json({ status: 'error', message: 'Missing token' });

    const payload = await verifyFirebaseToken(idToken);
    const uid = payload.uid || payload.user_id || payload.sub;
    const { address } = deriveFluxKeypair(uid);
    res.json({ status: 'success', zelid: address });
  } catch (err) {
    console.error('SSO zelid error:', err.message);
    res.status(401).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/sso/sign
 * Signs an arbitrary message with the user's derived Flux keypair.
 * Body: { message: string }
 * Returns: { status: 'success', zelid, signature }
 */
app.post('/api/sso/sign', express.json(), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!idToken) return res.status(401).json({ status: 'error', message: 'Missing token' });

    const { message } = req.body || {};
    if (!message) return res.status(400).json({ status: 'error', message: 'Missing message' });

    const payload = await verifyFirebaseToken(idToken);
    const uid = payload.uid || payload.user_id || payload.sub;
    const { privateKey, address } = deriveFluxKeypair(uid);

    // bitcoinMessage.sign expects a Buffer/Uint8Array for the private key
    // and the message as a string. Validate both before calling.
    if (!Buffer.isBuffer(privateKey) && !(privateKey instanceof Uint8Array)) {
      throw new Error('Derived private key is not a Buffer');
    }
    if (typeof message !== 'string') {
      throw new Error(`message must be a string, got ${typeof message}`);
    }

    const keyBuf = Buffer.isBuffer(privateKey) ? privateKey : Buffer.from(privateKey);
    // bitcoinjs-message passes extraEntropy directly to secp256k1 as { data: extraEntropy }.
    // secp256k1 rejects undefined/null — must pass a real 32-byte Buffer or omit the option.
    // We use a signer object so bitcoinjs-message never calls secp256k1.sign with options.
    const secp256k1 = require('secp256k1');
    const signer = {
      sign: (hash) => {
        const { signature, recovery } = secp256k1.sign(hash, keyBuf);
        return { signature: Buffer.from(signature), recovery };
      },
    };
    const sigBuf = bitcoinMessage.sign(message, signer, true);
    const signature = sigBuf.toString('base64');

    res.json({ status: 'success', zelid: address, signature });
  } catch (err) {
    console.error('SSO sign error:', err.message);
    res.status(401).json({ status: 'error', message: err.message });
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
