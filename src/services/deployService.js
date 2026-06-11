/**
 * Orbit Deployment Service
 * Pure/async functions for the deployment wizard.
 */
import qs from 'qs';
import {
  buildDatabaseCompose,
  generateDbPorts,
  getDatabaseEnvVar,
} from './databaseSpec';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { buildGeoSpec, GEO_OPTIONS } from './geolocationSpec.js';

export { GEO_OPTIONS };

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
    description: 'Perfect for side projects and learning',
    badge: null,
  },
  {
    id: 'standard',
    label: 'Standard',
    cpu: 1.5,
    ram: 4000,
    hdd: 15,
    instances: 2,
    priceMonthly: 2.49,
    description: 'For growing projects and small apps',
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
    description: 'For active development and production apps',
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
    description: 'Configure your own resources and pricing',
    badge: null,
  },
];

export const CUSTOM_PLAN_DEFAULTS = { cpu: 1, ram: 2000, hdd: 10, instances: 1, priceMonthly: null };

/** Fill in null resource fields on custom plans (deep-link / DB addon may skip step 1 config). */
export function normalizeCustomPlan(plan) {
  if (!plan || plan.id !== 'custom') return plan;
  const base = PLANS.find((p) => p.id === 'custom');
  return {
    ...base,
    ...CUSTOM_PLAN_DEFAULTS,
    ...plan,
    cpu: plan.cpu ?? CUSTOM_PLAN_DEFAULTS.cpu,
    ram: plan.ram ?? CUSTOM_PLAN_DEFAULTS.ram,
    hdd: plan.hdd ?? CUSTOM_PLAN_DEFAULTS.hdd,
    instances: plan.instances ?? CUSTOM_PLAN_DEFAULTS.instances,
    priceMonthly: plan.priceMonthly ?? CUSTOM_PLAN_DEFAULTS.priceMonthly,
  };
}

// ─── Billing periods ─────────────────────────────────────────────────────────
export const BILLING_PERIODS = [
  { months: 1, label: '1 month', discount: 0 },
  { months: 3, label: '3 months', discount: 5 },
  { months: 6, label: '6 months', discount: 10 },
  { months: 12, label: '12 months', discount: 15 },
];

export const BLOCKS_PER_MONTH = 88000;
export const MAX_SUBSCRIPTION_BLOCKS = 12 * BLOCKS_PER_MONTH;
/** Post-halving: ~0.5 min/block → 2880 blocks/day */
export const BLOCKS_PER_DAY = 2880;
const MS_PER_BLOCK = (24 * 60 * 60 * 1000) / BLOCKS_PER_DAY;

export function calcExpire(months) {
  return months * BLOCKS_PER_MONTH;
}

/** Base renewal extension periods (blocks added on top of remaining time). */
export const RENEWAL_PERIODS = [
  { label: '1 month', blocks: BLOCKS_PER_MONTH },
  { label: '2 months', blocks: 2 * BLOCKS_PER_MONTH },
  { label: '3 months', blocks: 3 * BLOCKS_PER_MONTH },
  { label: '6 months', blocks: 6 * BLOCKS_PER_MONTH },
  { label: '1 year', blocks: MAX_SUBSCRIPTION_BLOCKS },
];

/** Blocks remaining until expiry (naive: registration height + expire − current block). */
export function getBlocksRemaining(height, expire, currentBlock) {
  if (currentBlock == null || height == null || expire == null) return null;
  return (height + expire) - currentBlock;
}

/**
 * Renewal options capped at 1 year total subscription.
 * Each option includes expireBlocks = remaining + extension (value sent in app spec).
 */
export function getAvailableExtensionBlocks(blocksRemaining) {
  const remaining = Math.max(0, blocksRemaining ?? 0);
  return Math.max(0, MAX_SUBSCRIPTION_BLOCKS - remaining);
}

export function formatDurationFromBlocks(blocks) {
  const days = Math.max(0, Math.floor(blocks / BLOCKS_PER_DAY));
  if (days === 0) return 'less than a day';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  if (remDays === 0) return months === 1 ? '1 month' : `${months} months`;
  const monthPart = months === 1 ? '1 month' : `${months} months`;
  const dayPart = remDays === 1 ? '1 day' : `${remDays} days`;
  return `${monthPart} ${dayPart}`;
}

export function expiryDateFromBlocks(blocksFromNow) {
  return new Date(Date.now() + Math.max(0, blocksFromNow) * MS_PER_BLOCK);
}

export function formatExpiryDate(date) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getRenewalOptions(blocksRemaining) {
  const remaining = Math.max(0, blocksRemaining ?? 0);
  const available = getAvailableExtensionBlocks(remaining);

  const options = RENEWAL_PERIODS
    .filter((period) => period.blocks <= available)
    .map((period) => ({
      ...period,
      expireBlocks: remaining + period.blocks,
      newExpiryDate: expiryDateFromBlocks(remaining + period.blocks),
    }));

  const maxStandardBlocks = RENEWAL_PERIODS[RENEWAL_PERIODS.length - 1].blocks;
  const lastStandardExtension = options.length > 0 ? options[options.length - 1].blocks : 0;

  // Add a custom option for the remaining headroom when it doesn't match a standard period
  // (e.g. "11 months 16 days" instead of hiding 1 year behind a warning).
  if (available > 0 && available < maxStandardBlocks && available > lastStandardExtension) {
    options.push({
      label: formatDurationFromBlocks(available),
      blocks: available,
      expireBlocks: MAX_SUBSCRIPTION_BLOCKS,
      newExpiryDate: expiryDateFromBlocks(MAX_SUBSCRIPTION_BLOCKS),
      isCustomMax: true,
    });
  }

  return options;
}

/** Stripe subscriptions only support standard whole-month periods. */
export function usesStripeSubscription(period) {
  if (!period || period.isCustomMax) return false;
  const months = period.blocks / BLOCKS_PER_MONTH;
  return months > 1 && Number.isInteger(months);
}

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
    const resp = await fetch(`/api/flux/apps/appspecifications/${encodeURIComponent(name)}`);
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
export function buildSpec({ zelid, contactsRef, plan: rawPlan, repo, config, ports }) {
  const plan = normalizeCustomPlan(rawPlan);
  const [extPort, mgmtPort] = ports;
  const {
    appName, port, billingPeriod, geolocation = [], extraEnvVars = [],
    pollingInterval, runtime, runtimeVersion,
    buildCommand, runCommand, installCommand, prPreviewEnabled,
    webhookSecret, apiKey,
  } = config;

  // Core env vars
  const envParams = [
    `GIT_REPO_URL=${repo.url}`,
    `APP_PORT=${port}`,
  ];
  const branch = repo.branch || 'main';
  envParams.push(`GIT_BRANCH=${branch}`);
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

  // Build/run/install command overrides
  if (buildCommand?.trim()) envParams.push(`BUILD_COMMAND=${buildCommand.trim()}`);
  if (runCommand?.trim()) envParams.push(`RUN_COMMAND=${runCommand.trim()}`);
  if (installCommand?.trim()) envParams.push(`INSTALL_COMMAND=${installCommand.trim()}`);

  // Security secrets (always present when set — Enterprise encrypts them)
  if (webhookSecret?.trim()) envParams.push(`WEBHOOK_SECRET=${webhookSecret.trim()}`);
  if (apiKey?.trim()) envParams.push(`API_KEY=${apiKey.trim()}`);

  // PR preview (static sites only)
  if (prPreviewEnabled) envParams.push('PR_PREVIEW_ENABLED=true');

  // Extra user-defined env vars (reserved keys are filtered out at the UI layer)
  const RESERVED = new Set(['BUILD_COMMAND', 'RUN_COMMAND', 'INSTALL_COMMAND', 'GIT_REPO_URL', 'APP_PORT', 'ORBIT_CHECK_INTERVAL', 'PR_PREVIEW_ENABLED', 'WEBHOOK_SECRET', 'API_KEY', 'DATABASE_URL', 'MONGO_URL']);
  for (const { key, value } of extraEnvVars) {
    if (key?.trim() && !RESERVED.has(key.trim().toUpperCase())) {
      envParams.push(`${key.trim()}=${value || ''}`);
    }
  }

  const database = config.database;
  const dbEnabled = plan?.id === 'custom' && database?.enabled;
  let dbPorts = database?.ports;

  if (dbEnabled) {
    if (!dbPorts?.length) {
      dbPorts = generateDbPorts(database.type, ports);
    }
    const dbEnv = getDatabaseEnvVar({
      type: database.type,
      componentName: database.componentName,
      password: database.password,
      dbName: database.dbName,
    });
    if (!envParams.some((p) => p.startsWith(`${dbEnv.key}=`))) {
      envParams.push(`${dbEnv.key}=${dbEnv.value}`);
    }
  }

  // Geolocation: Flux format acEU / a!cNA
  const geoArray = buildGeoSpec(geolocation);

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
      ...(dbEnabled
        ? [buildDatabaseCompose({ ...database, ports: dbPorts }, appName)].filter(Boolean)
        : []),
    ],
    instances: dbEnabled ? Math.max(plan.instances, 3) : plan.instances,
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

const FLUX_API = 'https://api.runonflux.io';

/**
 * POST /apps/appregister  (called directly — api.runonflux.io has CORS *)
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
  const resp = await fetch(`${FLUX_API}/apps/appregister`, {
    method: 'POST',
    headers: { zelidauth: zelidauthHeader(zelidauth) },
    body: payload,
  });
  const json = await resp.json();
  if (json.status !== 'success') {
    throw new Error(json.data?.message || json.data || 'Registration failed');
  }
  return json.data; // txid / registration hash
}

/**
 * POST /apps/verifyappupdatespecifications  (called directly — CORS *)
 * Validates an update spec. Returns the normalised spec on success.
 * Can be slow (Docker image check) so we give it 2 minutes.
 */
export async function verifyUpdateSpec(spec) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const resp = await fetch(`${FLUX_API}/apps/verifyappupdatespecifications`, {
      method: 'POST',
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
 * POST /apps/appupdate  (called directly — CORS *)
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
  const resp = await fetch(`${FLUX_API}/apps/appupdate`, {
    method: 'POST',
    headers: { zelidauth: zelidauthHeader(zelidauth) },
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
 * POST /apps/calculatefiatandfluxprice  (direct — CORS *)
 * Returns { usd, flux }.
 */
export async function calculatePrice(spec, zelidauth) {
  const resp = await fetch(`${FLUX_API}/apps/calculatefiatandfluxprice`, {
    method: 'POST',
    body: JSON.stringify(spec),
  });
  const json = await resp.json();
  if (json.status !== 'success') {
    throw new Error(json.data || 'Failed to calculate price');
  }
  return json.data; // { usd, flux, fluxDiscount }
}

/**
 * Build the string to sign for a registration or update transaction.
 *
 * Format: type + version + JSON.stringify(verifiedSpec) + timestamp
 *   register: "fluxappregister1" + ...
 *   update:   "fluxappupdate1"   + ...
 */
export function buildDataToSign(verifiedSpec, timestamp, isUpdate = false) {
  const prefix = isUpdate ? 'fluxappupdate1' : 'fluxappregister1';
  return `${prefix}${JSON.stringify(verifiedSpec)}${timestamp}`;
}

/**
 * Sign via Firebase SSO.
 * @param {string} dataToSign
 * @param {import('firebase/auth').User} firebaseUser
 */
export async function signWithSSO(dataToSign, firebaseUser) {
  const token = await firebaseUser.getIdToken();

  // Read SSO provider from server config (cached after first call)
  const { ssoProvider } = getRuntimeConfig();

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
  let phase = 1; // 1 = waiting for blockchain, 2 = waiting for deployment
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
        const resp = await fetch(`/api/flux/apps/appspecifications/${encodeURIComponent(appName)}`);
        const json = await resp.json();
        if (json.status === 'success' && json.data?.hash === registrationHash) {
          phase = 2;
          onPhase?.(1, 'Blockchain confirmed — waiting for nodes to deploy');
        }
      }

      if (phase === 2) {
        // /apps/location returns running instances once deployment is complete
        const resp = await fetch(`/api/flux/apps/location/${encodeURIComponent(appName)}`);
        const json = await resp.json();
        if ((json.data || []).length > 0) {
          onPhase?.(2, 'Deployment complete!');
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

/**
 * Poll the blockchain until an app update is confirmed (hash changes).
 * Unlike pollDeployment there's no node-deployment phase — instances are already
 * running and will pick up the new spec automatically.
 *
 * @param {string} appName
 * @param {string} updateHash  - the txid / hash returned by updateApp
 * @param {{ onSuccess: () => void, onError: (err: Error) => void }} callbacks
 * @returns {() => void}  cancel function
 */
export function pollUpdate(appName, updateHash, callbacks) {
  const { onSuccess, onError } = callbacks;
  const POLL_INTERVAL_MS = 10_000;
  const TIMEOUT_MS = 20 * 60 * 1000; // 20 min
  const startTime = Date.now();
  let timer = null;
  let active = true;

  async function poll() {
    if (!active) return;
    if (Date.now() - startTime > TIMEOUT_MS) {
      onError?.(new Error('Update confirmation timed out after 20 minutes'));
      return;
    }
    try {
      const resp = await fetch(`/api/flux/apps/appspecifications/${encodeURIComponent(appName)}`);
      const json = await resp.json();
      if (json.status === 'success' && json.data?.hash === updateHash) {
        onSuccess?.();
        return;
      }
    } catch {
      // transient — keep polling
    }
    if (active) timer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  poll();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}
