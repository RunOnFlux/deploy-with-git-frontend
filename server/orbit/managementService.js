import crypto from 'node:crypto';
import { redactSecrets } from './core.js';
import { qsZelidAuth } from './http.js';

const ACTION_PATHS = Object.freeze({
  redeploy: (app) => `/apps/redeploy/${encodeURIComponent(app)}/false`,
  'hard-redeploy': (app) => `/apps/redeploy/${encodeURIComponent(app)}/true`,
  restart: (app) => `/apps/apprestart/${encodeURIComponent(app)}`,
  start: (app) => `/apps/appstart/${encodeURIComponent(app)}`,
  stop: (app) => `/apps/appstop/${encodeURIComponent(app)}`,
  pause: (app) => `/apps/apppause/${encodeURIComponent(app)}`,
  unpause: (app) => `/apps/appunpause/${encodeURIComponent(app)}`,
  remove: (app) => `/apps/appremove/${encodeURIComponent(app)}`,
});

export const INSTANCE_ACTIONS = Object.freeze(Object.keys(ACTION_PATHS));

function publicIpv4(value) {
  const ip = String(value || '').split(':')[0];
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224) return null;
  if (parts[0] === 169 && parts[1] === 254) return null;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return null;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return null;
  if (parts[0] === 192 && parts[1] === 168) return null;
  if (parts[0] === 192 && parts[1] === 0) return null;
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) return null;
  if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return null;
  return ip;
}

async function readBoundedText(response, maxBytes = 1_000_000) {
  if (!response.body?.getReader) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (text.length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  if (text.length >= maxBytes) await reader.cancel().catch(() => {});
  return text.slice(0, maxBytes);
}

function envMap(spec) {
  const result = {};
  for (const entry of spec?.compose?.[0]?.environmentParameters || []) {
    const index = entry.indexOf('=');
    if (index > 0) result[entry.slice(0, index)] = entry.slice(index + 1);
  }
  return result;
}

function nodeBase(location) {
  const raw = String(location.ip || '');
  const ip = publicIpv4(raw);
  if (!ip) throw new Error('Flux returned an invalid node address');
  const embeddedPort = raw.includes(':') ? Number(raw.split(':').at(-1)) : 16127;
  const port = Number.isInteger(embeddedPort) && embeddedPort > 0 && embeddedPort <= 65535 ? embeddedPort : 16127;
  return { ip, port, url: `https://${ip.replaceAll('.', '-')}-${port}.node.api.runonflux.io` };
}

function parseConcatenatedJson(text) {
  const values = [];
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === '{') { if (depth === 0) start = index; depth++; }
    else if (char === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try { values.push(JSON.parse(text.slice(start, index + 1))); } catch { /* skip malformed frame */ }
        start = -1;
      }
    }
  }
  return values;
}

export class ManagementService {
  constructor({ fetchImpl = fetch, flux }) {
    this.fetch = fetchImpl;
    this.flux = flux;
  }

  async resolve(session, appName, requestedNode) {
    const spec = await this.flux.getOwnedSpec(session, appName);
    const locations = await this.flux.getLocations(session, appName);
    if (locations.length === 0) throw new Error('No app instances are currently available');
    const normalizedRequest = requestedNode ? publicIpv4(requestedNode) : null;
    if (requestedNode && !normalizedRequest) throw new Error('Requested node address is invalid');
    const selected = requestedNode
      ? locations.find((location) => publicIpv4(location.ip) === normalizedRequest)
      : locations[0];
    if (!selected) throw new Error('Requested node is not assigned to this app');
    const node = nodeBase(selected);
    const env = envMap(spec);
    const ports = spec.compose?.[0]?.ports || [];
    const mgmtPort = Number(ports.at(-1));
    return {
      spec, locations, node, env,
      mgmtPort: Number.isInteger(mgmtPort) && mgmtPort > 0 && mgmtPort <= 65535 ? mgmtPort : null,
    };
  }

  async control(session, { appName, action, nodeIp }) {
    if (!ACTION_PATHS[action]) throw new Error('Unsupported instance action');
    const target = await this.resolve(session, appName, nodeIp);
    const response = await this.fetch(`${target.node.url}${ACTION_PATHS[action](appName)}`, {
      method: 'GET',
      headers: { zelidauth: qsZelidAuth(session), Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000),
    });
    const text = await readBoundedText(response);
    if (!response.ok) throw new Error(`Flux node action failed with HTTP ${response.status}`);
    const frames = parseConcatenatedJson(text);
    if (frames.length === 0) throw new Error('Flux node action returned no valid progress');
    const failed = frames.find((frame) => /error|fail/i.test(String(frame.status || '')));
    const completed = frames.some((frame) => /success|complete|done/i.test(String(frame.status || '')));
    return redactSecrets({
      appName, nodeIp: target.node.ip, action,
      success: completed && !failed,
      progress: frames.slice(-50).map((frame) => String(frame.status ?? frame.data ?? '').slice(0, 1000)),
    });
  }

  async triggerBuild(session, { appName, nodeIp, hardRedeploy = false }) {
    const target = await this.resolve(session, appName, nodeIp);
    if (!target.mgmtPort) throw new Error('Orbit management port is unavailable');
    const webhookSecret = target.env.WEBHOOK_SECRET;
    const apiKey = target.env.API_KEY;
    if (!webhookSecret && !apiKey) throw new Error('This app has no configured management credentials');
    const branch = target.env.GIT_BRANCH || target.env.BRANCH || 'main';
    const payload = JSON.stringify({
      ref: `refs/heads/${branch}`,
      forced: Boolean(hardRedeploy),
      head_commit: {
        id: '0000000000000000000000000000000000000000',
        message: hardRedeploy ? 'Hard redeploy from Orbit MCP' : 'Redeploy from Orbit MCP',
      },
    });
    const headers = { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    if (webhookSecret) headers['X-Hub-Signature-256'] = `sha256=${crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex')}`;
    const response = await this.fetch(`http://${target.node.ip}:${target.mgmtPort}/webhook`, {
      method: 'POST', headers, body: payload, signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Orbit build trigger failed');
    return redactSecrets({ appName, nodeIp: target.node.ip, accepted: true, status: body.status || body.message || 'accepted' });
  }

  async logs(session, { appName, nodeIp, type = 'container', lines = 100 }) {
    const target = await this.resolve(session, appName, nodeIp);
    const limit = Math.min(500, Math.max(1, Number(lines) || 100));
    let response;
    if (type === 'container') {
      const container = `cloudgit_${appName}`;
      response = await this.fetch(`${target.node.url}/apps/applog/${encodeURIComponent(container)}/${limit}`, {
        headers: { zelidauth: qsZelidAuth(session), Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } else {
      if (!target.mgmtPort) throw new Error('Orbit management port is unavailable');
      const headers = { Accept: 'application/json, text/plain' };
      if (target.env.API_KEY) headers['X-API-Key'] = target.env.API_KEY;
      const path = type === 'app' ? `/applogs?tail=${limit}&format=json` : '/status';
      response = await this.fetch(`http://${target.node.ip}:${target.mgmtPort}${path}`, {
        headers, signal: AbortSignal.timeout(15_000),
      });
    }
    const text = await readBoundedText(response);
    if (!response.ok) throw new Error('Log request failed');
    let payload = text;
    try { payload = JSON.parse(text); } catch { /* plain log output */ }
    if (type === 'build') {
      const status = typeof payload === 'object' ? payload : {};
      const release = status.current_release || status.last_deployment?.release_id || status.releases?.at?.(-1)?.id;
      if (release) {
        const headers = { Accept: 'text/plain' };
        if (target.env.API_KEY) headers['X-API-Key'] = target.env.API_KEY;
        const buildResponse = await this.fetch(`http://${target.node.ip}:${target.mgmtPort}/logs/${encodeURIComponent(release)}`, {
          headers, signal: AbortSignal.timeout(15_000),
        });
        if (buildResponse.ok) payload = await readBoundedText(buildResponse);
      }
    }
    const rawLogs = Array.isArray(payload) || typeof payload === 'string'
      ? payload
      : payload.logs ?? payload.lines ?? payload.data ?? payload;
    const normalized = Array.isArray(rawLogs)
      ? rawLogs.slice(-limit)
      : typeof rawLogs === 'string'
        ? rawLogs.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '').split('\n').slice(-limit)
        : [JSON.stringify(rawLogs).slice(0, 2000)];
    return redactSecrets({ appName, nodeIp: target.node.ip, type, logs: normalized });
  }
}
