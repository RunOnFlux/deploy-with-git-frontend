/**
 * Orbit Deployment UI — Express BFF (Backend for Frontend)
 * - Proxies authenticated Flux API calls (avoids CORS for zelidauth endpoints)
 * - Proxies FluxCore SSO sign/signInOrUp calls
 * - Provides server-side SSO signing for Firebase/email users
 * - Serves the built frontend in production
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');
const bitcoinMessage = require('bitcoinjs-message');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

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
 * POST /api/node-verifylogin
 * Proxies a verifylogin call to the sticky Flux node selected for a login phrase.
 * Used by SSP wallet (browser → BFF → node), avoiding browser CORS issues.
 *
 * SSRF protection: validates stickyBackend matches *.node.api.runonflux.io
 */
const STICKY_NODE_PATTERN = /^https:\/\/[\d-]+-\d+\.node\.api\.runonflux\.io$/;

app.post('/api/node-verifylogin', express.json(), async (req, res) => {
  const { zelid, signature, loginPhrase, stickyBackend } = req.body;

  if (!zelid || !signature || !loginPhrase || !stickyBackend) {
    return res.status(400).json({ status: 'error', data: 'Missing required fields' });
  }

  if (!STICKY_NODE_PATTERN.test(stickyBackend)) {
    return res.status(400).json({ status: 'error', data: 'Invalid sticky backend URL' });
  }

  try {
    const upstream = await fetch(`${stickyBackend}/id/verifylogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zelid, signature, loginPhrase }),
    });

    const data = await upstream.text();
    res.status(upstream.status).send(data);
  } catch (err) {
    console.error('node-verifylogin proxy error:', err.message);
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

/**
 * GET /api/config
 * Exposes server-side configuration to the frontend.
 * Change SSO_PROVIDER in .env and restart the server to switch SSO backends
 * without requiring a frontend rebuild.
 */
app.get('/api/config', (_req, res) => {
  res.json({
    ssoProvider: process.env.SSO_PROVIDER || 'self',
  });
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

const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'orbit-fdf48';

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
    const { address } = deriveFluxKeypair(payload.uid);
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
    const { privateKey, address } = deriveFluxKeypair(payload.uid);

    const sigBuf = bitcoinMessage.sign(message, privateKey, true);
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
 */
const NODE_BASE_PATTERN = /^https:\/\/[\d-]+-\d+\.node\.api\.runonflux\.io$/;

app.post('/api/node-proxy', express.json(), async (req, res) => {
  const { nodeBase, path: nodePath, method = 'GET', zelidauth, data } = req.body || {};

  if (!nodeBase || !nodePath) {
    return res.status(400).json({ status: 'error', data: 'Missing nodeBase or path' });
  }

  if (!NODE_BASE_PATTERN.test(nodeBase)) {
    return res.status(400).json({ status: 'error', data: 'Invalid nodeBase URL' });
  }

  const targetUrl = `${nodeBase}${nodePath.startsWith('/') ? nodePath : `/${nodePath}`}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (zelidauth) headers['zelidauth'] = zelidauth;

    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      ...(data ? { body: JSON.stringify(data) } : {}),
    };

    const upstream = await fetch(targetUrl, fetchOptions);
    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error(`node-proxy error [${targetUrl}]:`, err.message);
    res.status(502).json({ status: 'error', data: 'Node request failed' });
  }
});

/**
 * POST /api/orbit-node-status
 * Proxies requests to a specific node's Orbit management (webhook) server.
 * Body: { nodeIp, mgmtPort, path }
 *
 * Allowed paths: /status  or  /logs/<releaseId>
 */
const VALID_ORBIT_PATH = /^\/status$|^\/logs\/[a-zA-Z0-9_-]{1,80}$/;
const VALID_IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

app.post('/api/orbit-node-status', express.json(), async (req, res) => {
  const { nodeIp, mgmtPort, path: statusPath = '/status' } = req.body || {};

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

  const targetUrl = `http://${nodeIp}:${port}${statusPath}`;
  try {
    const upstream = await fetch(targetUrl, {
      headers: { Accept: 'application/json, text/plain, */*' },
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
  const { nodeIp, mgmtPort, webhookSecret, branch = 'main', hardRedeploy = false } = req.body || {};

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

const server = createServer(app);
server.listen(PORT, () => {
  console.log(`🚀 Orbit BFF running on http://localhost:${PORT}`);
});

export default app;
