/**
 * Repo Config Import Service
 * Reads flux.json / flux.yaml / vercel.json from a Git repo and returns
 * a wizard-compatible prefill payload.
 */
import { fetchRawFile } from './repoIntelligenceService';

const ORBIT_POLLING_INTERVAL_ALIASES = {
  disabled: 'disabled',
  off: 'disabled',
  '0': 'disabled',
  '1h': '3600',
  '2h': '7200',
  '6h': '21600',
  '12h': '43200',
  '24h': '86400',
  '1hour': '3600',
  '2hours': '7200',
  '6hours': '21600',
  '12hours': '43200',
  '24hours': '86400',
};

const ORBIT_RUNTIME_ALIASES = {
  node: 'node',
  nodejs: 'node',
  'node.js': 'node',
  python: 'python',
  py: 'python',
  python3: 'python',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  java: 'java',
  php: 'php',
  ruby: 'ruby',
  dotnet: 'dotnet',
  '.net': 'dotnet',
};

function normalizePollingInterval(value) {
  if (!value) return '';
  const lower = String(value).toLowerCase().trim();
  return ORBIT_POLLING_INTERVAL_ALIASES[lower] || (Number.isInteger(+value) && +value > 0 ? String(value) : '');
}

function normalizeRuntime(value) {
  if (!value) return '';
  return ORBIT_RUNTIME_ALIASES[value.toLowerCase().trim()] || '';
}

function parseStructuredEnvVars(envVars) {
  if (!Array.isArray(envVars)) return [];
  return envVars
    .filter((e) => e && typeof e === 'object' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key || ''))
    .map((e) => ({ key: String(e.key).trim(), value: String(e.value ?? '').trim() }))
    .filter((e) => e.key && e.value !== '');
}

/**
 * Parse a flux.json / flux.yaml (simple key-value subset) config object
 * into a wizard prefill payload.
 */
function parseFluxConfig(data) {
  if (!data || typeof data !== 'object') return null;

  const payload = {};

  const port = data.appPort || data.port || data.APP_PORT;
  if (port) {
    const p = parseInt(String(port), 10);
    if (p > 0 && p <= 65535) payload.appPort = String(p);
  }

  const polling = data.pollingInterval || data.ORBIT_CHECK_INTERVAL || data.checkInterval;
  const normalizedPolling = normalizePollingInterval(polling);
  if (normalizedPolling) payload.pollingInterval = normalizedPolling;

  const runtime = data.runtime || data.ORBIT_RUNTIME;
  const normalizedRuntime = normalizeRuntime(runtime);
  if (normalizedRuntime) payload.runtime = normalizedRuntime;

  const runtimeVersion = data.runtimeVersion || data.runtime_version || data.ORBIT_RUNTIME_VERSION;
  if (runtimeVersion) payload.runtimeVersion = String(runtimeVersion).trim();

  const framework = data.framework;
  if (framework) payload.framework = String(framework).trim();

  if (data.envVars) {
    const envVars = parseStructuredEnvVars(data.envVars);
    if (envVars.length) payload.envVars = envVars;
  }

  // Dedicated Orbit env commands
  const buildCmd = data.buildCommand || data.BUILD_COMMAND;
  const runCmd = data.runCommand || data.RUN_COMMAND;
  const installCmd = data.installCommand || data.INSTALL_COMMAND;

  const envOverrides = [...(payload.envVars || [])];
  if (buildCmd?.trim()) upsertEnv(envOverrides, 'BUILD_COMMAND', buildCmd.trim());
  if (runCmd?.trim()) upsertEnv(envOverrides, 'RUN_COMMAND', runCmd.trim());
  if (installCmd?.trim()) upsertEnv(envOverrides, 'INSTALL_COMMAND', installCmd.trim());
  if (envOverrides.length) payload.envVars = envOverrides;

  if (Array.isArray(data.allowedGeolocations)) payload.allowedGeolocations = data.allowedGeolocations;
  if (Array.isArray(data.forbiddenGeolocations)) payload.forbiddenGeolocations = data.forbiddenGeolocations;

  const hasContent = Object.keys(payload).length > 0;
  return hasContent ? payload : null;
}

/**
 * Parse a vercel.json config object into a wizard prefill payload.
 */
function parseVercelConfig(data) {
  if (!data || typeof data !== 'object') return null;

  const payload = {};

  // Extract env vars
  const envVars = [];
  const allEnv = { ...(data.env || {}), ...(data.build?.env || {}) };
  for (const [key, value] of Object.entries(allEnv)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string' && value) {
      envVars.push({ key, value });
    }
  }
  if (envVars.length) payload.envVars = envVars;

  const buildCmd = data.buildCommand;
  if (buildCmd?.trim()) {
    upsertEnv(payload.envVars || (payload.envVars = []), 'BUILD_COMMAND', buildCmd.trim());
  }

  const framework = data.framework;
  if (framework) payload.framework = String(framework).trim();

  const hasContent = Object.keys(payload).length > 0;
  return hasContent ? payload : null;
}

function upsertEnv(list, key, value) {
  const existing = list.find((e) => e.key === key);
  if (existing) existing.value = value;
  else list.push({ key, value });
}

/**
 * Try to load a deployment config from the repo.
 * Tries flux.json → flux.yaml → flux.yml → vercel.json in project dir then root.
 * Returns {payload, filePath} | null
 */
export async function loadRepoDeploymentConfig(parsed, branch, projectPath, authHeaders = {}, signal) {
  const basePath = buildBasePath(projectPath);
  const tryPaths = [];

  // flux config candidates (project dir first, then root)
  for (const name of ['flux.json', 'flux.yaml', 'flux.yml']) {
    if (basePath) tryPaths.push({ path: `${basePath}${name}`, type: 'flux' });
    tryPaths.push({ path: name, type: 'flux' });
  }

  // vercel.json fallback
  if (basePath) tryPaths.push({ path: `${basePath}vercel.json`, type: 'vercel' });
  tryPaths.push({ path: 'vercel.json', type: 'vercel' });

  for (const { path, type } of tryPaths) {
    if (signal?.aborted) return null;
    const content = await fetchRawFile(parsed, branch, path, authHeaders, signal);
    if (!content) continue;

    try {
      let data;
      if (path.endsWith('.json')) {
        data = JSON.parse(content);
      } else {
        // Simple YAML → object for our subset (no external dep)
        data = parseSimpleYaml(content);
      }

      const payload = type === 'vercel' ? parseVercelConfig(data) : parseFluxConfig(data);
      if (payload) return { payload, filePath: path };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Minimal YAML parser for simple key: value maps (supports string, number, boolean).
 * Not a full YAML parser — only handles what flux.yaml typically contains.
 */
function parseSimpleYaml(content) {
  const result = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!key) continue;
    // Coerce types
    if (rawVal === 'true') result[key] = true;
    else if (rawVal === 'false') result[key] = false;
    else if (/^\d+$/.test(rawVal)) result[key] = parseInt(rawVal, 10);
    else result[key] = rawVal;
  }
  return result;
}

function buildBasePath(projectPath) {
  if (!projectPath || projectPath === '/') return '';
  return projectPath.replace(/^\//, '').replace(/\/$/, '') + '/';
}
