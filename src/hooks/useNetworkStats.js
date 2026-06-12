import { useState, useEffect } from 'react';

/**
 * Live Flux network totals for marketing copy, fetched once from the BFF
 * (`GET /api/network-stats`) and shared across every consumer via a
 * module-level cached promise — so the landing page makes a single request
 * no matter how many components show the node count.
 *
 * @returns {{ stats: { total: number, countryCount: number } | null, loading: boolean }}
 */

let cachedPromise = null;

function loadNetworkStats() {
  if (!cachedPromise) {
    cachedPromise = fetch('/api/network-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('stats unavailable'))))
      .then((d) => ({ total: d.total, countryCount: d.countryCount }))
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
