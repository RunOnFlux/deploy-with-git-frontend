import axiosInstance from './axiosInstance';
import { fetchCurrentBlock } from './appsService';
import { decryptEnterpriseSpec } from './enterpriseCrypto';

/**
 * Standard Flux daemon API port. All Flux nodes expose their API on this port.
 */
export const FLUX_NODE_PORT = 16127;

/**
 * Build the per-node API base URL from a node's IP.
 * Format: https://<ip-dashed>-<port>.node.api.runonflux.io
 * If `ip` contains an embedded port (e.g. "1.2.3.4:16157"), that port is used.
 * Otherwise falls back to the explicit `port` param (default 16127).
 */
export function nodeBaseUrl(ip, port = FLUX_NODE_PORT) {
  const colonIdx = ip.lastIndexOf(':');
  const cleanIp = colonIdx !== -1 ? ip.slice(0, colonIdx) : ip;
  const resolvedPort = colonIdx !== -1 ? ip.slice(colonIdx + 1) : port;
  return `https://${cleanIp.replace(/\./g, '-')}-${resolvedPort}.node.api.runonflux.io`;
}

/**
 * Container name for Orbit apps (v4+ composite spec).
 * Component name is always "cloudgit" for Orbit.
 */
export function containerName(appName) {
  return `cloudgit_${appName}`;
}

/**
 * Fetch the full on-chain spec for an app.
 * Correct endpoint: GET /apps/appspecifications/:name
 */
export async function fetchAppSpec(appName) {
  const resp = await axiosInstance.get(
    `/flux/apps/appspecifications/${encodeURIComponent(appName)}`,
    { headers: { 'x-apicache-bypass': true } },
  );
  if (resp.data?.status !== 'success') {
    throw new Error(resp.data?.data?.message || resp.data?.data || 'Failed to fetch spec');
  }
  return resp.data.data;
}

/** Shown when a renewal for this app is still confirming. Exported so callers can match on it. */
export const PENDING_UPDATE_ERROR = 'This app has a renewal still being confirmed on-chain. Please wait a couple of minutes and try again — saving now would wipe out the time you just bought.';

/** The network holds a temporary message for a full hour; nothing this old is still live. */
const MAX_PENDING_AGE_MS = 15 * 60 * 1000;

/**
 * An update message for this app that is broadcast but NOT yet confirmed on-chain,
 * and still young enough that it plausibly will be.
 *
 * `/apps/appspecifications` reports confirmed state only, so for the minute or two a
 * renewal spends waiting for its payment to confirm, the extension it bought is invisible
 * there — even a cache-busted read returns the pre-renewal expiry. This is the only
 * endpoint that shows the in-flight message.
 *
 * The age cut-off matters: a paid update confirms in about a minute and a free one in
 * about five, so anything older has almost certainly been abandoned — a cancelled
 * checkout, say — and treating it as live would lock the customer out of their own app
 * for the rest of the hour.
 */
export async function fetchPendingAppUpdate(appName) {
  try {
    const resp = await axiosInstance.get('/flux/apps/temporarymessages', {
      headers: { 'x-apicache-bypass': true },
    });
    const list = resp.data?.data;
    if (resp.data?.status !== 'success' || !Array.isArray(list)) return null;
    const match = list.find((m) => {
      const spec = m.appSpecifications || m.zelAppSpecifications;
      return spec && spec.name === appName;
    });
    if (!match) return null;
    const receivedAt = new Date(match.receivedAt).getTime();
    // Unparseable timestamp → treat as live. Erring towards blocking costs a retry;
    // erring the other way is what loses a paid month.
    if (Number.isNaN(receivedAt)) return match;
    return (Date.now() - receivedAt) < MAX_PENDING_AGE_MS ? match : null;
  } catch {
    // Deliberately non-fatal. Losing this check costs the in-flight guard, but the caller
    // still writes against a freshly fetched spec — blocking every save on a transient
    // failure of this endpoint would be the worse trade.
    return null;
  }
}

/**
 * The app's spec read immediately before an appupdate is built from it, decrypted when
 * enterprise, and refused outright while a renewal is still confirming.
 *
 * MUST be used by every path that writes a spec. An appupdate re-registers the WHOLE
 * spec, and `expire` is recomputed from whatever copy the caller holds — so building on
 * the copy AppDetail loaded when the page mounted writes that copy's expiry back on
 * chain, silently reverting any extension bought since. AppDetail does not poll the
 * spec, and renewals happen on a different page, so a tab left open on an app can carry
 * a pre-renewal copy for as long as it stays open.
 *
 * Freshness needs both halves, and neither is sufficient alone:
 *  - the confirmed spec re-read now rather than at mount, which closes the stale-tab case;
 *  - a check for an update still awaiting confirmation, because the confirmed spec cannot
 *    show one, which closes the in-flight case.
 *
 * Only a pending update that EXTENDS past the confirmed expiry blocks the save. A pending
 * settings change carries the same expiry, so superseding it costs the customer nothing —
 * that is the ordinary last-write-wins of saving twice, and refusing it would mean a typo
 * could not be corrected for minutes.
 *
 * @param {string} appName
 * @param {object} [zelidauth] required to decrypt an enterprise spec
 * @returns {Promise<object>} the spec, with compose/contacts decrypted for enterprise apps
 * @throws {Error} if a renewal is in flight, or the spec cannot be read
 */
export async function fetchLatestAppSpec(appName, zelidauth) {
  // Read BEFORE the spec, so a message that confirms between the two calls is picked up by
  // the spec read rather than missed by both.
  const pending = await fetchPendingAppUpdate(appName);

  let spec = await fetchAppSpec(appName);
  if (!spec?.name) throw new Error('Could not load the current app spec. Please try again in a moment.');

  if (pending) {
    const pendingSpec = pending.appSpecifications || pending.zelAppSpecifications || {};
    const currentBlock = await fetchCurrentBlock().catch(() => null);
    const confirmedExpiryBlock = (Number(spec.height) || 0) + (Number(spec.expire) || 0);
    // A pending message has no height yet — it re-registers wherever it lands, which is
    // within a few blocks of now. The tolerance mirrors the 11 blocks FluxOS itself allows
    // a free update to drift, so ordinary rounding never reads as an extension.
    const pendingExpiryBlock = (Number(currentBlock) || 0) + (Number(pendingSpec.expire) || 0);
    if (currentBlock && confirmedExpiryBlock && pendingExpiryBlock > confirmedExpiryBlock + 11) {
      throw new Error(PENDING_UPDATE_ERROR);
    }
  }

  // Enterprise apps come back with compose: [] — decrypt to restore compose/contacts, the
  // same step AppDetail does on load, so the caller gets the shape it already works with.
  if (spec.enterprise && zelidauth) {
    spec = await decryptEnterpriseSpec(spec, zelidauth);
  }
  return spec;
}

/**
 * Fetch nodes currently running an app via GET /apps/location/:name.
 * Returns array of { ip, name, runningSince, broadcastedAt, expireAt, hash, staticIp }
 * All nodes returned by this endpoint are actively running the app.
 */
export async function fetchNodeStatuses(appName) {
  const resp = await axiosInstance.get(
    `/flux/apps/location/${encodeURIComponent(appName)}`,
    { headers: { 'x-apicache-bypass': true } },
  );
  if (resp.data?.status !== 'success') return [];
  // Normalise: add runningstatus so InstanceCard StatusBadge works
  return (resp.data.data ?? []).map((n) => ({
    ...n,
    port: FLUX_NODE_PORT,
    runningstatus: n.runningSince ? 'RUNNING' : 'STOPPED',
  }));
}

/**
 * Proxy a request to a specific Flux node through the BFF (avoids CORS).
 * Used for read-only calls (logs, status queries) — axios buffers the streamed response.
 */
async function nodeRequest(nodeBase, path, method = 'GET', zelidauth = '') {
  const resp = await axiosInstance.post('/node-proxy', { nodeBase, path, method, zelidauth }, { timeout: 90_000 });
  return resp.data;
}

/**
 * Parse concatenated JSON objects from a text buffer.
 * Returns [ parsedObjects[], remainingBuffer ] — remainder holds any incomplete object.
 */
function extractJsonObjects(buffer) {
  const messages = [];
  let depth = 0, objStart = -1, lastEnd = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === '{') { if (depth === 0) objStart = i; depth++; }
    else if (buffer[i] === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { messages.push(JSON.parse(buffer.slice(objStart, i + 1))); } catch {}
        lastEnd = i + 1;
        objStart = -1;
      }
    }
  }
  return [messages, buffer.slice(lastEnd)];
}

/**
 * Per-node action paths — all are GET requests on the node's Flux daemon API.
 */
export const NODE_ACTIONS = {
  redeploy:        (app) => `/apps/redeploy/${encodeURIComponent(app)}/false`,
  'hard-redeploy': (app) => `/apps/redeploy/${encodeURIComponent(app)}/true`,
  restart:  (app) => `/apps/apprestart/${encodeURIComponent(app)}`,
  start:    (app) => `/apps/appstart/${encodeURIComponent(app)}`,
  stop:     (app) => `/apps/appstop/${encodeURIComponent(app)}`,
  remove:   (app) => `/apps/appremove/${encodeURIComponent(app)}`,
};

/**
 * Perform an action on a specific node.
 * Uses native fetch with a streaming reader so the caller receives live progress
 * messages via `onProgress(statusText)` as Flux sends them.
 * Never retried — a timed-out mutation may have already executed on the node.
 */
export async function performNodeAction(nodeBase, action, appName, zelidauth, onProgress) {
  const path = NODE_ACTIONS[action]?.(appName);
  if (!path) throw new Error(`Unknown action: ${action}`);

  const resp = await fetch('/api/node-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeBase, path, method: 'GET', zelidauth }),
    signal: AbortSignal.timeout(90_000),
  });

  if (resp.status >= 400 && resp.status < 500) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const messages = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const [newMsgs, remainder] = extractJsonObjects(buffer);
    buffer = remainder;
    for (const msg of newMsgs) {
      messages.push(msg);
      const text = msg.status ?? msg.data;
      if (text) onProgress?.(text);
    }
  }

  if (messages.length === 0) return { status: 'error', data: 'No response from node' };
  const errMsg = messages.find(m => /error|fail/i.test(m.status ?? ''));
  if (errMsg) return { status: 'error', data: errMsg.status };
  const last = messages[messages.length - 1];
  return { status: 'success', data: last?.status ?? 'Operation completed', messages };
}

/**
 * Fetch app logs via applogpolling (correct endpoint; returns { logs: string[], sinceTimestamp, status }).
 * Container name for composite apps: <componentName>_<appName> e.g. cloudgit_myapp
 */
export async function fetchAppLogPolling(nodeBase, container, zelidauth, lines = 100, since = 0) {
  return nodeRequest(
    nodeBase,
    `/apps/applogpolling/${encodeURIComponent(container)}/${lines}/${since}`,
    'GET',
    zelidauth,
  );
}

/**
 * Fetch the last N log lines from a container on a specific node.
 * Endpoint: GET /apps/applog/:container/:lines
 * Response: { status: 'success', data: "<log string>" }
 */
export async function fetchNodeLogs(nodeBase, container, zelidauth, lines = 100) {
  return nodeRequest(nodeBase, `/apps/applog/${encodeURIComponent(container)}/${lines}`, 'GET', zelidauth);
}

/**
 * Extract the management (webhook) server external port from an app spec.
 * Orbit exposes the webhook server as the last port in the compose ports array.
 */
export function getMgmtPort(spec) {
  const compose = spec?.compose?.[0] ?? {};
  const ports = compose.ports ?? [];
  return ports.length ? ports[ports.length - 1] : null;
}

/**
 * Fetch Orbit status from the load-balanced CDN domain.
 * URL: https://<appName>_<mgmtPort>.app.runonflux.io/status
 * Returns: { status, current_release, last_deployment, releases }
 */
export async function fetchOrbitStatus(appName, port) {
  const url = `https://${appName}_${port}.app.runonflux.io/status`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

/** Strip any trailing ":port" from an IP string (e.g. "1.2.3.4:16157" → "1.2.3.4"). */
function stripPort(ip) {
  if (!ip) return ip;
  const idx = ip.lastIndexOf(':');
  return idx !== -1 ? ip.slice(0, idx) : ip;
}

/**
 * Fetch Orbit status for a specific node via BFF proxy.
 * Bypasses CORS — goes to http://<nodeIp>:<mgmtPort>/status
 */
export async function fetchNodeOrbitStatus(nodeIp, mgmtPort, apiKey) {
  const resp = await axiosInstance.post('/orbit-node-status', {
    nodeIp: stripPort(nodeIp),
    mgmtPort,
    path: '/status',
    ...(apiKey ? { apiKey } : {}),
  });
  return resp.data;
}

/**
 * Fetch build logs for a specific release from a node via BFF proxy.
 * Returns plain-text log output.
 */
export async function fetchNodeOrbitLogs(nodeIp, mgmtPort, releaseId, apiKey) {
  const resp = await axiosInstance.post('/orbit-node-status', {
    nodeIp: stripPort(nodeIp),
    mgmtPort,
    path: `/logs/${encodeURIComponent(releaseId)}`,
    ...(apiKey ? { apiKey } : {}),
  });
  // axios response: if text/plain BFF sends it as a string in resp.data
  return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
}

/**
 * Fetch Orbit app logs (/applogs) for a specific node via BFF proxy.
 * Returns an array of log line strings.
 */
export async function fetchNodeOrbitAppLogs(nodeIp, mgmtPort, apiKey) {
  const resp = await axiosInstance.post('/orbit-node-status', {
    nodeIp: stripPort(nodeIp),
    mgmtPort,
    path: '/applogs',
    query: 'tail=100&format=json',
    ...(apiKey ? { apiKey } : {}),
  });
  const data = resp.data;
  return Array.isArray(data) ? data : (data?.lines ?? data?.logs ?? []);
}

/**
 * Extract a value from a spec's environmentParameters by trying multiple key names.
 * Returns the first match found, or '' if none.
 */
export function getSpecEnvValue(spec, ...keys) {
  const params = spec?.compose?.[0]?.environmentParameters ?? [];
  for (const entry of params) {
    const idx = entry.indexOf('=');
    if (idx < 0) continue;
    const k = entry.slice(0, idx);
    if (keys.includes(k)) return entry.slice(idx + 1);
  }
  return '';
}

/**
 * Trigger an Orbit redeploy on a specific node via the BFF.
 * Posts a synthetic push payload to that node's webhook server.
 */
export async function triggerOrbitDeploy(nodeIp, mgmtPort, webhookSecret, branch, hardRedeploy = false, apiKey = null) {
  const resp = await axiosInstance.post('/orbit-deploy', {
    nodeIp: stripPort(nodeIp),
    mgmtPort,
    webhookSecret,
    branch: branch || 'main',
    hardRedeploy,
    ...(apiKey ? { apiKey } : {}),
  });
  return resp.data;
}

/**
 * Trigger a Flux soft-redeploy on all running instances of an app.
 * This tells each node's Flux daemon to pull the updated spec and redeploy.
 * Errors per-node are collected and returned; we never throw globally.
 *
 * @param {string} appName
 * @param {Array<{ ip: string }>} nodeStatuses
 * @param {string} zelidauth  - raw zelidauth query-string from useAuth
 * @returns {Promise<{ ok: number, failed: number }>}
 */
export async function redeployAllInstances(appName, nodeStatuses, zelidauth) {
  const results = await Promise.allSettled(
    nodeStatuses.map((node) => {
      const base = nodeBaseUrl(node.ip);
      return performNodeAction(base, 'redeploy', appName, zelidauth, () => {});
    }),
  );
  const ok     = results.filter((r) => r.status === 'fulfilled' && r.value?.status !== 'error').length;
  const failed = results.length - ok;
  return { ok, failed };
}
