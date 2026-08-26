import axiosInstance from './axiosInstance';
import { parseAppData } from './appSpecParser.js';
export { extractGitInfo, parseAppData } from './appSpecParser.js';


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
    msg.compose?.some((s) => s.repotag?.includes('runonflux/orbit'))
    // Enterprise apps have compose: [] — include them if enterprise blob is present
    || (msg.version >= 8 && msg.enterprise),
  );

  return orbitApps.map(parseAppData);
}

/**
 * Fetch raw on-chain specs for a zelid without running parseAppData.
 * Used by the hook when it needs to decrypt enterprise apps before parsing.
 */
export async function fetchAppsRaw(zelid) {
  const resp = await axiosInstance.get(`/flux/apps/globalappsspecifications?owner=${zelid}`, {
    headers: { 'x-apicache-bypass': true },
  });
  const messages = resp.data?.data ?? [];

  return messages.filter((msg) =>
    msg.compose?.some((s) => s.repotag?.includes('runonflux/orbit'))
    || (msg.version >= 8 && msg.enterprise),
  );
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
