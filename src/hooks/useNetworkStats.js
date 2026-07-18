import { useState, useEffect } from 'react';
import { registerGeoLabels } from '../services/geolocationSpec';

/**
 * Live Flux network data from the BFF (`GET /api/network-stats`), fetched once
 * and shared across every consumer via a module-level cached promise — so the
 * landing page + deploy wizard make a single request no matter how many
 * components read the node count or location availability.
 *
 * @returns {{ stats: { total: number, countryCount: number, geo?: object } | null, loading: boolean }}
 */

let cachedPromise = null;

function loadNetworkStats() {
  if (!cachedPromise) {
    cachedPromise = fetch('/api/network-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('stats unavailable'))))
      .then((d) => {
        registerGeoLabels(d.geo); // teach geolocationSpec the code → name labels
        return d;
      })
      .catch((err) => {
        cachedPromise = null; // allow a retry on the next mount
        throw err;
      });
  }
  return cachedPromise;
}

export function useNetworkStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadNetworkStats()
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { /* keep stats null — consumers fall back to neutral copy */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { stats, loading };
}

/**
 * Capacity-filtered geo breakdown for the deploy location picker. Unlike
 * useNetworkStats (one shared cached call feeding the whole app), this refetches
 * whenever the app's hardware or enterprise flag changes, so the offered locations
 * reflect only nodes that can actually host THIS app. Returns per-location node
 * AND unique-IP counts.
 *
 * @param {{ cpu?: number, ram?: number, hdd?: number, enterprise?: boolean }} req
 *        cpu in cores, ram/hdd in GB.
 * @returns {{ geo: { continents: Array, countries: Array } | null, loading: boolean }}
 */
export function useDeployCapacity({ cpu, ram, hdd, enterprise } = {}) {
  const [geo, setGeo] = useState(null);
  const [loading, setLoading] = useState(true);
  const key = `${cpu || 0}|${ram || 0}|${hdd || 0}|${enterprise ? 1 : 0}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      cpu: String(cpu || 0),
      ram: String(ram || 0),
      hdd: String(hdd || 0),
      enterprise: enterprise ? '1' : '0',
    });
    fetch(`/api/network-stats?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('stats unavailable'))))
      .then((d) => {
        if (cancelled) return;
        registerGeoLabels(d.geo); // teach geolocationSpec the code → name labels
        setGeo(d.geo || null);
      })
      .catch(() => { if (!cancelled) setGeo(null); }) // consumers fall back to static list
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // key encodes every input the request depends on
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { geo, loading };
}

/** Round to the nearest thousand for a clean marketing figure, e.g. 6973 → "7,000+". */
export function formatNodeCount(stats) {
  if (!stats?.total) return 'thousands of';
  const rounded = Math.round(stats.total / 1000) * 1000;
  return `${rounded.toLocaleString()}+`;
}

/** Country count with a sensible neutral fallback while loading. */
export function formatCountryCount(stats) {
  if (!stats?.countryCount) return 'dozens of';
  return `${stats.countryCount}+`;
}
