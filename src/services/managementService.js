import axiosInstance from './axiosInstance';

/**
 * Standard Flux daemon API port. All Flux nodes expose their API on this port.
 */
export const FLUX_NODE_PORT = 16127;

/**
 * Build the per-node API base URL from a node's IP.
 * Format: https://<ip-dashed>-<port>.node.api.runonflux.io
 */
export function nodeBaseUrl(ip, port = FLUX_NODE_PORT) {
  return `https://${ip.replace(/\./g, '-')}-${port}.node.api.runonflux.io`;
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
 */
async function nodeRequest(nodeBase, path, method = 'GET', zelidauth = '') {
  const resp = await axiosInstance.post('/node-proxy', {
    nodeBase,
    path,
    method,
    zelidauth,
  });
  return resp.data;
}

/**
 * Per-node action paths — all are GET requests on the node's Flux daemon API.
 */
export const NODE_ACTIONS = {
  redeploy:       (app) => `/apps/redeploy/${encodeURIComponent(app)}/false`,
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
 */
export async function performNodeAction(nodeBase, action, appName, zelidauth) {
  const path = NODE_ACTIONS[action]?.(appName);
  if (!path) throw new Error(`Unknown action: ${action}`);
  return nodeRequest(nodeBase, path, 'GET', zelidauth);
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

/**
 * Fetch Orbit status for a specific node via BFF proxy.
 * Bypasses CORS — goes to http://<nodeIp>:<mgmtPort>/status
 */
export async function fetchNodeOrbitStatus(nodeIp, mgmtPort) {
  const resp = await axiosInstance.post('/orbit-node-status', {
    nodeIp,
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
    nodeIp,
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
    nodeIp,
    mgmtPort,
    webhookSecret,
    branch: branch || 'main',
    hardRedeploy,
  });
  return resp.data;
}
