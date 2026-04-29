import axiosInstance from './axiosInstance';

/**
 * Parse an array of env strings ["KEY=value", ...] into an object.
 * Handles values that themselves contain `=`.
 */
function parseEnvs(envs = []) {
  const result = {};
  for (const env of envs) {
    const idx = env.indexOf('=');
    if (idx > 0) {
      result[env.slice(0, idx)] = env.slice(idx + 1);
    }
  }
  return result;
}

/**
 * Extract and sanitize git info from a compose service's envs.
 * Supports: GIT_REPO, GIT_REPO_URL, REPO_URL (and GIT_BRANCH, BRANCH, APP_PORT, PORT).
 * Strips any embedded credentials from the URL before returning.
 */
export function extractGitInfo(compose = []) {
  // The Flux API stores env vars under `environmentParameters` in the app spec.
  // `envs` is an older/alternative field — try both.
  const envs = parseEnvs(compose[0]?.environmentParameters ?? compose[0]?.envs ?? []);
  const rawUrl = envs.GIT_REPO || envs.GIT_REPO_URL || envs.REPO_URL || '';
  const gitBranch = envs.GIT_BRANCH || envs.BRANCH || 'main';
  const appPort = envs.APP_PORT || envs.PORT || null;

  let gitRepo = '';
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.username = '';
      url.password = '';
      gitRepo = url.toString();
    } catch {
      // Not a valid URL — use raw but strip anything that looks like user:pass@
      gitRepo = rawUrl.replace(/^(https?:\/\/)[^@]*@/, '$1');
    }
  }

  return { gitRepo, gitBranch, appPort };
}

/**
 * Normalize a raw permanentmessage into a clean app object.
 */
export function parseAppData(msg) {
  const compose = msg.compose ?? [];
  const first = compose[0] ?? {};
  const { gitRepo, gitBranch, appPort } = extractGitInfo(compose);

  return {
    name: msg.name,
    description: msg.description ?? '',
    owner: msg.owner,
    hash: msg.hash,
    height: msg.height ?? 0,
    expire: msg.expire ?? 0,
    instances: msg.instances ?? first.instances ?? 1,
    repotag: first.repotag ?? '',
    gitRepo,
    gitBranch,
    appPort,
    cpu: first.cpu ?? 0,
    ram: first.ram ?? 0,      // MB
    hdd: first.hdd ?? 0,      // GB
    ports: first.ports ?? [],
    compose,
  };
}


/**
 * Fetch all Orbit apps registered to a zelid.
 *
 * Uses /apps/globalappsspecifications (already deduplicated, owner-keyed)
 * instead of /apps/permanentmessages which is unreliable and often returns [].
 * Filters to apps owned by the current zelid that use the Orbit image.
 *
 * @param {string} zelid
 * @returns {Promise<import('./appsService').App[]>}
 */
export async function fetchApps(zelid) {
  const resp = await axiosInstance.get(`/flux/apps/globalappsspecifications?owner=${zelid}`, {
    headers: { 'x-apicache-bypass': true },
  });
  const messages = resp.data?.data ?? [];

  const orbitApps = messages.filter((msg) =>
    msg.compose?.some((s) => s.repotag?.includes('runonflux/orbit')),
  );

  return orbitApps.map(parseAppData);
}

/**
 * Fetch the global node running status for a single app.
 * Uses /apps/location (same source as AppDetail) and checks runningSince.
 *
 * Returns:
 *   'running'    — all nodes reporting running
 *   'partial'    — some but not all nodes running
 *   'stopped'    — nodes exist but none are running
 *   'unknown'    — no node data available (installing or not yet propagated)
 */
export async function fetchAppStatus(appName) {
  try {
    const resp = await axiosInstance.get(
      `/flux/apps/location/${encodeURIComponent(appName)}`,
      { headers: { 'x-apicache-bypass': true } },
    );
    if (resp.data?.status !== 'success') return 'unknown';

    const nodes = resp.data?.data ?? [];
    if (nodes.length === 0) return 'unknown';

    const running = nodes.filter((n) => Boolean(n.runningSince)).length;
    if (running === 0) return 'stopped';
    if (running < nodes.length) return 'partial';
    return 'running';
  } catch {
    return 'unknown';
  }
}

/**
 * Fetch the current Flux blockchain block height.
 * Returns null on error.
 */
export async function fetchCurrentBlock() {
  try {
    const resp = await axiosInstance.get('/flux/daemon/getinfo');
    return resp.data?.data?.blocks ?? null;
  } catch {
    return null;
  }
}
