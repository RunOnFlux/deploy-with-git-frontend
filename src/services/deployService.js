/**
 * Orbit Deployment Service
 * Pure/async functions for the deployment wizard.
 */
import qs from 'qs';

// Cached server config — fetched once per page load
let _serverConfig = null;
async function getServerConfig() {
  if (!_serverConfig) {
    const resp = await fetch('/api/config');
    _serverConfig = await resp.json();
  }
  return _serverConfig;
}

// ─── Plans ──────────────────────────────────────────────────────────────────
export const PLANS = [
  {
    id: 'free',
    label: 'Free',
    cpu: 0.5,
    ram: 1000,   // MB
    hdd: 5,
    instances: 1,
    priceMonthly: 0,
    description: 'Perfect for side projects and hobby apps',
    badge: null,
  },
  {
    id: 'developer',
    label: 'Developer',
    cpu: 1.5,
    ram: 4000,
    hdd: 15,
    instances: 2,
    priceMonthly: 2.49,
    description: 'For production apps that need reliability',
    badge: 'Popular',
  },
  {
    id: 'pro',
    label: 'Pro',
    cpu: 2,
    ram: 6000,
    hdd: 20,
    instances: 2,
    priceMonthly: 3.99,
    description: 'High-performance with extra resources',
    badge: null,
  },
  {
    id: 'custom',
    label: 'Custom',
    cpu: null,
    ram: null,
    hdd: null,
    instances: null,
    priceMonthly: null,
    description: 'Configure every resource exactly as you need',
    badge: null,
  },
];

// ─── Billing periods ─────────────────────────────────────────────────────────
export const BILLING_PERIODS = [
  { months: 1, label: '1 month', discount: 0 },
  { months: 3, label: '3 months', discount: 5 },
  { months: 6, label: '6 months', discount: 10 },
  { months: 12, label: '12 months', discount: 15 },
];

export function calcExpire(months) {
  return months * 88000;
}

// ─── Geolocation options ─────────────────────────────────────────────────────
export const GEO_OPTIONS = [
  { code: 'EU', label: 'Europe' },
  { code: 'NA', label: 'North America' },
  { code: 'AS', label: 'Asia' },
  { code: 'OC', label: 'Oceania' },
  { code: 'SA', label: 'South America' },
  { code: 'AF', label: 'Africa' },
];

// ─── Port generation ─────────────────────────────────────────────────────────
const BANNED_PORTS = new Set([
  // Well-known
  21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995,
  // Common dev ports
  3000, 3001, 3306, 5432, 5900, 6379, 8080, 8443, 8888, 9200, 9300,
  // Flux internal
  16127, 16197,
]);

export function generatePort(exclude = []) {
  const excluded = new Set([...BANNED_PORTS, ...exclude]);
  let attempts = 0;
  while (attempts < 1000) {
    const port = Math.floor(Math.random() * (65535 - 10000 + 1)) + 10000;
    if (!excluded.has(port)) return port;
    attempts++;
  }
  throw new Error('Could not generate a valid port after 1000 attempts');
}

export function generatePortPair() {
  const ext = generatePort();
  const mgmt = generatePort([ext]);
  return [ext, mgmt];
}

// ─── App name validation ─────────────────────────────────────────────────────
export const APP_NAME_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;

export function validateAppName(name) {
  if (!name) return 'App name is required';
  if (name.length < 3) return 'Must be at least 3 characters';
  if (name.length > 32) return 'Must be at most 32 characters';
  if (!APP_NAME_REGEX.test(name)) {
    return 'Lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.';
  }
  return null;
}

/**
 * Check if an app name is already taken on the Flux network.
 * Returns true if available, false if taken.
 * Advisory only — registration failure is the authoritative check.
 */
export async function checkAppNameAvailable(name) {
  try {
    const resp = await fetch(`/api/flux/apps/getappspecifics/${encodeURIComponent(name)}`);
    const json = await resp.json();
    // If the app exists, data will be non-null
    return json.status !== 'success' || !json.data || !json.data.name;
  } catch {
    return true; // Assume available on network error
  }
}

// ─── Build private Git URL (embeds credentials) ──────────────────────────────
/**
 * Builds a GIT_REPO_URL with embedded credentials for private repos.
 * The token is embedded as: https://username:token@github.com/owner/repo
 * ⚠️ This credential will be visible in the Flux permanentmessages API.
 * Use only disposable, minimal-scope read-only tokens.
 */
export function buildPrivateRepoUrl(baseUrl, username, token) {
  try {
    const url = new URL(baseUrl);
    url.username = encodeURIComponent(username);
    url.password = encodeURIComponent(token);
    return url.toString();
  } catch {
    // Fallback for malformed URLs
    return baseUrl.replace(/^(https?:\/\/)/, `$1${username}:${token}@`);
  }
}

/**
 * Mask a git URL for display (redact credentials).
 */
export function maskGitUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.password) {
      u.username = u.username ? '***' : '';
      u.password = '***';
    }
    return u.toString();
  } catch {
    return url.replace(/^(https?:\/\/)[^@]*@/, '$1***@');
  }
}

/**
 * Strip private credentials from a spec for safe storage / price calculation.
 * Replaces GIT_REPO_URL env var value with the public URL (no user:token).
 */
export function redactSpecCredentials(spec) {
  if (!spec) return spec;
  try {
    const clone = JSON.parse(JSON.stringify(spec));
    const envParams = clone.compose?.[0]?.environmentParameters;
    if (Array.isArray(envParams)) {
      clone.compose[0].environmentParameters = envParams.map((param) => {
        if (typeof param === 'string' && param.startsWith('GIT_REPO_URL=')) {
          const rawUrl = param.slice('GIT_REPO_URL='.length);
          return `GIT_REPO_URL=${maskGitUrl(rawUrl)}`;
        }
        return param;
      });
    }
    return clone;
  } catch {
    return spec;
  }
}

// ─── Build app spec ──────────────────────────────────────────────────────────
/**
 * Build the full v8 Orbit app spec from wizard state.
 * RAM is in MB. HDD in GB. CPU in vCPU.
 *
 * @param {object} params
 * @param {string} params.zelid
 * @param {string} params.email
 * @param {object} params.plan - { cpu, ram (MB), hdd, instances }
 * @param {object} params.repo - { url, branch, subdirectory }
 * @param {object} params.config - { appName, port, billingPeriod, geolocation, extraEnvVars, contactEmail, pollingInterval, runtime, runtimeVersion }
 * @param {[number, number]} params.ports - [extPort, mgmtPort]
 */
export function buildSpec({ zelid, contactsRef, plan, repo, config, ports }) {
  const [extPort, mgmtPort] = ports;
  const {
    appName, port, billingPeriod, geolocation = [], extraEnvVars = [],
    pollingInterval, runtime, runtimeVersion,
  } = config;

  // Core env vars — only add GIT_BRANCH if not the default branch
  const envParams = [
    `GIT_REPO_URL=${repo.url}`,
    `APP_PORT=${port}`,
  ];
  const branch = repo.branch || 'main';
  if (branch !== 'main' && branch !== 'master') {
    envParams.push(`GIT_BRANCH=${branch}`);
  }
  if (repo.subdirectory) {
    envParams.push(`PROJECT_PATH=${repo.subdirectory}`);
  }

  // Polling interval (skip if 'disabled')
  if (pollingInterval && pollingInterval !== 'disabled') {
    envParams.push(`POLLING_INTERVAL=${pollingInterval}`);
  }

  // Runtime
  if (runtime) {
    envParams.push(`ORBIT_RUNTIME=${runtime}`);
    if (runtimeVersion) envParams.push(`ORBIT_RUNTIME_VERSION=${runtimeVersion}`);
  }

  // Extra user-defined env vars
  for (const { key, value } of extraEnvVars) {
    if (key?.trim()) envParams.push(`${key.trim()}=${value || ''}`);
  }

  // Geolocation: array of "a=XX" / "f=XX" strings
  const geoArray = geolocation
    .filter((g) => g.code)
    .map((g) => `${g.type === 'forbidden' ? 'f' : 'a'}=${g.code}`);

  const expireBlocks = calcExpire(billingPeriod?.months ?? 1);

  // contacts must be a Flux Storage reference (F_S_CONTACTS=<url>)
  const contacts = contactsRef ? [contactsRef] : [];

  return {
    version: 8,
    name: appName,
    description: `Orbit deployment — ${appName}`,
    owner: zelid,
    compose: [
      {
        name: 'cloudgit',
        description: 'cloudgit',
        repotag: 'runonflux/orbit:latest',
        ports: [extPort, mgmtPort],
        domains: ['', ''],
        environmentParameters: envParams,
        commands: [],
        containerPorts: [parseInt(port, 10), 9001],
        containerData: '/app',
        cpu: plan.cpu,
        ram: plan.ram,   // already in MB
        hdd: plan.hdd,
        repoauth: '',
        tiered: false,
      },
    ],
    instances: plan.instances,
    contacts,
    geolocation: geoArray,
    expire: expireBlocks,
    nodes: [],
    staticip: false,
    enterprise: '',
  };
}

/**
 * Upload contact email to Flux Storage.
 * Returns the F_S_CONTACTS reference string to embed in the spec.
 */
export async function uploadContacts(email) {
  const contactsId = Math.floor(Math.random() * 999999999999999).toString();
  const resp = await fetch('https://storage.runonflux.io/v1/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactsid: contactsId, contacts: [email] }),
  });
  if (!resp.ok) {
    throw new Error(`Contacts upload failed: ${resp.status}`);
  }
  return `F_S_CONTACTS=https://storage.runonflux.io/v1/contacts/${contactsId}`;
}

function zelidauthHeader(zelidauth) {
  const { zelid, signature, loginPhrase } = zelidauth;
  return qs.stringify({ zelid, signature, loginPhrase });
}

/**
 * POST /apps/verifyappregistrationspecifications
 * Sends the spec with application/x-www-form-urlencoded content-type (matching
 * the FluxOS frontend — Axios serializes pre-stringified JSON this way).
 * No zelidauth needed for this endpoint.
 * Returns the normalized spec to sign. Falls back gracefully on timeout.
 */
export async function verifySpec(spec) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const resp = await fetch('/api/flux/apps/verifyappregistrationspecifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: JSON.stringify(spec),
      signal: controller.signal,
    });
    const json = await resp.json();
    if (json.status !== 'success' || !json.data) {
      throw new Error(json.data?.message || json.data || 'Spec verification failed');
    }
    return json.data; // normalized spec
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST /apps/appregister
 * Returns { data: <txid> }.
 */
export async function registerApp({ verifiedSpec, timestamp, signature, zelidauth }) {
  const payload = JSON.stringify({
    type: 'fluxappregister',
    version: 1,
    appSpecification: verifiedSpec,
    timestamp,
    signature,
  });
  const resp = await fetch('/api/flux/apps/appregister', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      zelidauth: zelidauthHeader(zelidauth),
    },
    body: payload,
  });
  const json = await resp.json();
  if (json.status !== 'success') {
    throw new Error(json.data?.message || json.data || 'Registration failed');
  }
  return json.data; // txid / registration hash
}

/**
 * POST /apps/verifyappupdatespecifications
 * Validates an update spec. Returns the normalised spec on success.
 */
export async function verifyUpdateSpec(spec) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const resp = await fetch('/api/flux/apps/verifyappupdatespecifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: JSON.stringify(spec),
      signal: controller.signal,
    });
    const json = await resp.json();
    if (json.status !== 'success' || !json.data) {
      throw new Error(json.data?.message || json.data || 'Update spec verification failed');
    }
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST /apps/appupdate
 * Submits an app update transaction to the blockchain.
 * Returns the transaction hash on success.
 */
export async function updateApp({ verifiedSpec, timestamp, signature, zelidauth }) {
  const payload = JSON.stringify({
    type: 'fluxappupdate',
    version: 1,
    appSpecification: verifiedSpec,
    timestamp,
    signature,
  });
  const resp = await fetch('/api/flux/apps/appupdate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      zelidauth: zelidauthHeader(zelidauth),
    },
    body: payload,
  });
  const json = await resp.json();
  if (json.status !== 'success') {
    throw new Error(json.data?.message || json.data || 'Update failed');
  }
  return json.data;
}

/**
 * GET /apps/deploymentinformation
 * Returns the Flux payment address for the app.
 */
export async function getPaymentAddress(zelidauth) {
  const resp = await fetch('/api/flux/apps/deploymentinformation', {
    headers: { zelidauth: zelidauthHeader(zelidauth) },
  });
  const json = await resp.json();
  if (json.status !== 'success') {
    throw new Error(json.data || 'Failed to get payment address');
  }
  return json.data.address;
}

/**
 * POST /apps/calculatefiatandfluxprice
 * Returns { usd, flux }.
 */
export async function calculatePrice(spec, zelidauth) {
  const resp = await fetch('/api/flux/apps/calculatefiatandfluxprice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      zelidauth: zelidauthHeader(zelidauth),
    },
    body: JSON.stringify(spec),
  });
  const json = await resp.json();
  if (json.status !== 'success') {
    throw new Error(json.data || 'Failed to calculate price');
  }
  return json.data; // { usd, flux, fluxDiscount }
}

/**
 * Sign the registration payload.
 *
 * dataToSign = "fluxappregister1" + JSON.stringify(verifiedSpec) + timestamp
 *
 * Returns the signature string.
 *
 * For SSO: POST /api/fluxcore/sign with Bearer idToken.
 * For ZelCore: WebSocket + deep link (caller manages the WS).
 * For SSP: window.ssp.request('sign', ...).
 */
export function buildDataToSign(verifiedSpec, timestamp) {
  return `fluxappregister1${JSON.stringify(verifiedSpec)}${timestamp}`;
}

/**
 * Sign via Firebase SSO.
 * @param {string} dataToSign
 * @param {import('firebase/auth').User} firebaseUser
 */
export async function signWithSSO(dataToSign, firebaseUser) {
  const token = await firebaseUser.getIdToken();

  // Read SSO provider from server config (cached after first call)
  const { ssoProvider } = await getServerConfig();

  if (ssoProvider === 'fluxcore') {
    // FluxCore: service.fluxcore.ai/api/signMessage (requires fluxcore-prod Firebase project)
    const resp = await fetch('/api/fluxcore/signMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: dataToSign }),
    });
    const json = await resp.json();
    if (json.status !== 'success' || !json.signature) {
      throw new Error(json.message || json.data || 'SSO signing failed');
    }
    return json.signature;
  }

  // Self-hosted: our server derives a deterministic keypair and signs
  const resp = await fetch('/api/sso/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: dataToSign }),
  });
  const json = await resp.json();
  if (json.status !== 'success' || !json.signature) {
    throw new Error(json.message || 'SSO signing failed');
  }
  return json.signature;
}

/**
 * Sign via SSP wallet.
 * @param {string} dataToSign
 */
export async function signWithSSP(dataToSign) {
  if (!window.ssp) throw new Error('SSP wallet extension not found');
  try {
    const result = await window.ssp.request('sign', { message: dataToSign });
    if (!result?.signature) throw new Error('No signature returned from SSP');
    return result.signature;
  } catch (err) {
    throw new Error(err?.message || 'SSP signing failed');
  }
}

/**
 * Initiate ZelCore signing via deep link + WebSocket.
 * The WS is opened at wss://<stickyBackend>/ws/sign/<zelid><timestamp>
 * Returns a promise that resolves with the signature, or rejects on timeout/error.
 *
 * @param {string} dataToSign
 * @param {{ zelid: string, _stickyBackend: string }} zelidauth
 * @param {number} timestamp - same timestamp used in dataToSign
 */
export function signWithZelCore(dataToSign, zelidauth, timestamp) {
  return new Promise((resolve, reject) => {
    const { zelid, _stickyBackend } = zelidauth;
    if (!_stickyBackend) {
      reject(new Error('No sticky backend available for ZelCore signing'));
      return;
    }

    const wsUrl = _stickyBackend.replace(/^https?/, 'wss');
    const ws = new WebSocket(`${wsUrl}/ws/sign/${zelid}${timestamp}`);
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error('ZelCore sign request timed out'));
      }
    }, 3 * 60 * 1000);

    ws.onopen = () => {
      // Open ZelCore deep link
      const callbackUrl = encodeURIComponent(`${_stickyBackend}/id/providesign`);
      const iconUrl = encodeURIComponent(`${window.location.origin}/orbit-icon.svg`);
      window.location.href = `zel:?action=sign&message=${encodeURIComponent(dataToSign)}&icon=${iconUrl}&callback=${callbackUrl}`;
    };

    ws.onmessage = (event) => {
      if (settled) return;
      try {
        const parsed = new URLSearchParams(event.data);
        const status = parsed.get('status');
        const signature = parsed.get('data[signature]') || parsed.get('signature');
        if (status !== 'success' || !signature) {
          throw new Error('Invalid ZelCore sign response');
        }
        settled = true;
        clearTimeout(timeout);
        ws.close();
        resolve(signature);
      } catch (err) {
        settled = true;
        clearTimeout(timeout);
        ws.close();
        reject(err);
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('ZelCore WebSocket error during signing'));
      }
    };
  });
}

/**
 * Stream test app install logs via NDJSON.
 * Calls onLine(logLine: string) for each log object, onDone() on completion.
 *
 * @param {string} hash - registration txid
 * @param {string} zelidauthStr - qs-encoded zelidauth string
 * @param {object} callbacks - { onLine, onError, onDone }
 * @returns {AbortController} - call .abort() to cancel
 */
export function streamTestInstall(hash, zelidauthStr, { onLine, onError, onDone }) {
  const controller = new AbortController();

  (async () => {
    // Guard so we never fire onError twice (e.g. once from parsed error, once from reader cleanup)
    let errorReported = false;
    const reportError = (err) => {
      if (errorReported) return;
      errorReported = true;
      onError?.(err);
    };

    // Extract the human-readable message from a parsed Flux error object
    const extractMessage = (obj) => {
      const d = obj.data;
      if (d && typeof d === 'object') return d.message || d.data || JSON.stringify(d);
      if (typeof d === 'string') {
        try {
          const inner = JSON.parse(d);
          return inner?.message || inner?.data?.message || d;
        } catch { return d; }
      }
      return 'Test install error';
    };

    try {
      const resp = await fetch(`/api/flux-stream/apps/testappinstall/${encodeURIComponent(hash)}`, {
        headers: { zelidauth: zelidauthStr },
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        try {
          const obj = JSON.parse(text);
          if (obj.status === 'error') { reportError(new Error(extractMessage(obj))); return; }
        } catch { /* fall through */ }
        reportError(new Error(text || 'Test install request failed'));
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Keep all non-JSON lines so we can attempt a full-body parse at end (handles pretty-printed errors)
      const accumulated = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          accumulated.push(trimmed);
          try {
            const obj = JSON.parse(trimmed);
            if (obj.status === 'error') {
              reportError(new Error(extractMessage(obj)));
              return; // stop reading; no reader.cancel() to avoid triggering outer catch
            }
            onLine?.(obj);
          } catch {
            onLine?.({ status: 'info', data: trimmed });
          }
        }
      }

      // Flush remaining buffer content
      const remaining = buffer.trim();
      if (remaining) {
        accumulated.push(remaining);
        try {
          const obj = JSON.parse(remaining);
          if (obj.status === 'error') {
            reportError(new Error(extractMessage(obj)));
            return;
          }
          onLine?.(obj);
        } catch {
          onLine?.({ status: 'info', data: remaining });
        }
      }

      // Last resort: try parsing all accumulated content as one JSON blob
      // (handles pretty-printed multi-line error responses from Flux API)
      if (!errorReported && accumulated.length > 0) {
        try {
          const obj = JSON.parse(accumulated.join('\n'));
          if (obj.status === 'error') {
            reportError(new Error(extractMessage(obj)));
            return;
          }
        } catch { /* not a single JSON blob — that's fine */ }
      }

      onDone?.();
    } catch (err) {
      if (err.name !== 'AbortError') {
        reportError(err);
      }
    }
  })();

  return controller;
}

/**
 * Poll for payment/deployment confirmation.
 * Three phases: blockchain → installing → deployed.
 *
 * Calls onPhase(1|2|3, message) when each phase completes.
 * Calls onSuccess(appName) when fully deployed.
 * Calls onError(err) on timeout or repeated failure.
 * Returns a cleanup function.
 */
export function pollDeployment(appName, registrationHash, callbacks) {
  const { onPhase, onSuccess, onError } = callbacks;
  const POLL_INTERVAL_MS = 10_000;
  const TIMEOUT_MS = 30 * 60 * 1000;
  const startTime = Date.now();
  let phase = 1;
  let timer = null;
  let active = true;

  async function poll() {
    if (!active) return;
    if (Date.now() - startTime > TIMEOUT_MS) {
      onError?.(new Error('Deployment timed out after 30 minutes'));
      return;
    }

    try {
      if (phase === 1) {
        const resp = await fetch(`/api/flux/apps/getappspecifics/${encodeURIComponent(appName)}`);
        const json = await resp.json();
        if (json.status === 'success' && json.data?.hash === registrationHash) {
          phase = 2;
          onPhase?.(1, 'Blockchain confirmed — waiting for installation to begin');
        }
      }

      if (phase === 2) {
        const resp = await fetch(`/api/flux/apps/getappinstallinglocation/${encodeURIComponent(appName)}`);
        const json = await resp.json();
        const locs = json.data || [];
        if (locs.length > 0) {
          phase = 3;
          onPhase?.(2, `Installing on ${locs.length} node(s)…`);
        } else {
          // App may have finished installing already — check phase 3
          const resp3 = await fetch(`/api/flux/apps/getapplocation/${encodeURIComponent(appName)}`);
          const json3 = await resp3.json();
          if ((json3.data || []).length > 0) {
            onSuccess?.(appName);
            return;
          }
        }
      }

      if (phase === 3) {
        const resp = await fetch(`/api/flux/apps/getapplocation/${encodeURIComponent(appName)}`);
        const json = await resp.json();
        if ((json.data || []).length > 0) {
          onPhase?.(3, 'Deployment complete!');
          onSuccess?.(appName);
          return;
        }
      }
    } catch {
      // Network errors during polling are transient — keep polling
    }

    if (active) timer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  poll();

  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}
