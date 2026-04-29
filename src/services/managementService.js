import axiosInstance from './axiosInstance';

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
  pause:    (app) => `/apps/apppause/${encodeURIComponent(app)}`,
  unpause:  (app) => `/apps/appunpause/${encodeURIComponent(app)}`,
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
 * Orbit always exposes the webhook server as the second port in the compose ports array.
 */
export function getMgmtPort(spec) {
  const compose = spec?.compose?.[0] ?? {};
  return compose.ports?.[1] ?? null;
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
export async function fetchNodeOrbitStatus(nodeIp, mgmtPort) {
  const resp = await axiosInstance.post('/orbit-node-status', {
    nodeIp: stripPort(nodeIp),
    mgmtPort,
    path: '/status',
  });
  return resp.data;
}

/**
 * Fetch build logs for a specific release from a node via BFF proxy.
 * Returns plain-text log output.
 */
export async function fetchNodeOrbitLogs(nodeIp, mgmtPort, releaseId) {
  const resp = await axiosInstance.post('/orbit-node-status', {
    nodeIp: stripPort(nodeIp),
    mgmtPort,
    path: `/logs/${encodeURIComponent(releaseId)}`,
  });
  // axios response: if text/plain BFF sends it as a string in resp.data
  return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
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
export async function triggerOrbitDeploy(nodeIp, mgmtPort, webhookSecret, branch, hardRedeploy = false) {
  const resp = await axiosInstance.post('/orbit-deploy', {
    nodeIp: stripPort(nodeIp),
    mgmtPort,
    webhookSecret,
    branch: branch || 'main',
    hardRedeploy,
  });
  return resp.data;
}
