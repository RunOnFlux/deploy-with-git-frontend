/**
 * Repo Config Import Service
 * Reads flux.json / flux.yaml / vercel.json from a Git repo and returns
 * a wizard-compatible prefill payload.
 */
import { fetchRawFile } from './repoIntelligenceService';
import { PLANS, normalizeCustomPlan } from './deployService';
import {
  DB_MIN_INSTANCES,
  databaseConfigFromFluxSchema,
} from './databaseSpec';

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
  bun: 'bun',
};

const FLUX_PLAN_IDS = new Set(['free', 'standard', 'pro', 'custom']);

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

function coerceYamlScalar(raw) {
  const val = raw.replace(/^['"]|['"]$/g, '');
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if (/^\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}

/**
 * Parse flux.deploy.schema YAML (flat keys + one nested level, e.g. database).
 */
function parseFluxYaml(content) {
  const result = {};
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const topMatch = trimmed.match(/^([^:#]+):\s*(.*)$/);
    if (!topMatch) {
      i++;
      continue;
    }

    const key = topMatch[1].trim();
    const inlineVal = topMatch[2].trim();

    if (inlineVal === '') {
      const nested = {};
      i++;
      while (i < lines.length) {
        const subRaw = lines[i];
        const subTrimmed = subRaw.trim();
        if (!subTrimmed || subTrimmed.startsWith('#')) {
          i++;
          continue;
        }
        if (!/^\s+/.test(subRaw)) break;
        const subMatch = subTrimmed.match(/^([^:#]+):\s*(.+)$/);
        if (!subMatch) break;
        nested[subMatch[1].trim()] = coerceYamlScalar(subMatch[2].trim());
        i++;
      }
      result[key] = nested;
      continue;
    }

    result[key] = coerceYamlScalar(inlineVal);
    i++;
  }

  return result;
}

function parsePositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parsePositiveInt(value) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Parse a flux.json / flux.yaml (simple key-value subset) config object
 * into a wizard prefill payload.
 */
export function parseFluxConfig(data) {
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

  const appName = data.appName || data.name;
  if (appName) payload.appName = String(appName).trim();

  if (data.prPreviewEnabled != null) payload.prPreviewEnabled = Boolean(data.prPreviewEnabled);
  if (data.autoDeploy != null) payload.autoDeploy = Boolean(data.autoDeploy);

  const plan = data.plan ? String(data.plan).toLowerCase().trim() : '';
  if (FLUX_PLAN_IDS.has(plan)) payload.planId = plan;

  const cpu = parsePositiveNumber(data.cpu);
  const ram = parsePositiveInt(data.ram);
  const hdd = parsePositiveInt(data.hdd);
  const instances = parsePositiveInt(data.instances);
  if (cpu != null) payload.cpu = cpu;
  if (ram != null) payload.ram = ram;
  if (hdd != null) payload.hdd = hdd;
  if (instances != null) payload.instances = instances;

  if (data.database && typeof data.database === 'object') {
    const database = databaseConfigFromFluxSchema(data.database);
    if (database) {
      payload.database = database;
      payload.planId = 'custom';
      payload.instances = Math.max(payload.instances ?? DB_MIN_INSTANCES, DB_MIN_INSTANCES);
    }
  }

  if (data.envVars) {
    const envVars = parseStructuredEnvVars(data.envVars);
    if (envVars.length) payload.envVars = envVars;
  }

  const buildCmd = data.buildCommand || data.BUILD_COMMAND;
  const runCmd = data.runCommand || data.RUN_COMMAND;
  const installCmd = data.installCommand || data.INSTALL_COMMAND;

  const envOverrides = [...(payload.envVars || [])];
  if (buildCmd?.trim()) upsertEnv(envOverrides, 'BUILD_COMMAND', buildCmd.trim());
  if (runCmd?.trim()) upsertEnv(envOverrides, 'RUN_COMMAND', runCmd.trim());
  if (installCmd?.trim()) upsertEnv(envOverrides, 'INSTALL_COMMAND', installCmd.trim());
  if (envOverrides.length) payload.envVars = envOverrides;

  const allowed = data.allowedLocations || data.allowedGeolocations;
  const forbidden = data.forbiddenLocations || data.forbiddenGeolocations;
  if (Array.isArray(allowed)) payload.allowedGeolocations = allowed;
  if (Array.isArray(forbidden)) payload.forbiddenGeolocations = forbidden;

  const hasContent = Object.keys(payload).length > 0;
  return hasContent ? payload : null;
}

/**
 * Map an imported flux.deploy payload to a wizard plan object.
 */
export function resolvePlanFromImport(payload) {
  if (!payload) return null;

  const planId = payload.database?.enabled ? 'custom' : payload.planId;
  if (!planId || !FLUX_PLAN_IDS.has(planId)) return null;

  const template = PLANS.find((p) => p.id === planId);
  if (!template) return null;

  if (planId === 'custom') {
    return normalizeCustomPlan({
      ...template,
      cpu: payload.cpu,
      ram: payload.ram,
      hdd: payload.hdd,
      instances: payload.database?.enabled
        ? Math.max(payload.instances ?? DB_MIN_INSTANCES, DB_MIN_INSTANCES)
        : payload.instances,
    });
  }

  return { ...template };
}

/**
 * Parse a vercel.json config object into a wizard prefill payload.
 */
function parseVercelConfig(data) {
  if (!data || typeof data !== 'object') return null;

  const payload = {};

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

  for (const name of ['flux.json', 'flux.yaml', 'flux.yml']) {
    if (basePath) tryPaths.push({ path: `${basePath}${name}`, type: 'flux' });
    tryPaths.push({ path: name, type: 'flux' });
  }

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
        data = parseFluxYaml(content);
      }

      const payload = type === 'vercel' ? parseVercelConfig(data) : parseFluxConfig(data);
      if (payload) return { payload, filePath: path };
    } catch {
      continue;
    }
  }

  return null;
}

function buildBasePath(projectPath) {
  if (!projectPath || projectPath === '/') return '';
  return projectPath.replace(/^\//, '').replace(/\/$/, '') + '/';
}
