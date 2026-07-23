import { useMemo, useState } from 'react';
import { GEO_OPTIONS, labelForGeoCode } from '../../services/geolocationSpec';
import { useDeployCapacity } from '../../hooks/useNetworkStats';

/**
 * Capacity-aware geolocation picker. Mirrors the FluxOS / sibling-site location
 * step: only continents/countries that can actually host THIS app are offered —
 * nodes are filtered by the plan's hardware (after the node OS reserve) and, for
 * enterprise apps, by arcaneVersion support. Locations are annotated with both a
 * node count and a unique public-IP count, and only qualify when they hold enough
 * distinct IPs for the instance count (Flux spreads instances across distinct IPs).
 * Falls back to the static continent list if network data isn't available yet. Each
 * added location can be toggled allowed/forbidden (an Orbit-specific feature).
 *
 * @param {{ cpu?: number, ram?: number, hdd?: number }} [hardware] cores / GB / GB
 */
export default function GeoSelector({ selected, onChange, disabled = false, instances = 1, hardware = null, enterprise = false }) {
  const { geo } = useDeployCapacity({
    cpu: hardware?.cpu,
    ram: hardware?.ram,
    hdd: hardware?.hdd,
    enterprise,
  });

  const [continent, setContinent] = useState('');
  const [country, setCountry] = useState('');

  const selectedCodes = useMemo(() => new Set(selected.map((g) => g.code)), [selected]);
  const wholeContinentAdded = continent && selectedCodes.has(continent);

  // Continents with enough unique IPs for the instance count, not already added.
  const continentOptions = useMemo(() => {
    if (!geo) {
      // Fallback: static continents, no capacity info.
      return GEO_OPTIONS
        .filter((o) => !selectedCodes.has(o.code))
        .map((o) => ({ code: o.code, name: o.label, nodeCount: null, ipCount: null }));
    }
    return geo.continents
      .filter((c) => c.ipCount >= instances && !selectedCodes.has(c.code))
      .map((c) => ({ code: c.code, name: c.name, nodeCount: c.nodeCount, ipCount: c.ipCount }));
  }, [geo, instances, selectedCodes]);

  // Countries in the chosen continent with enough unique IPs, not already added.
  const countryOptions = useMemo(() => {
    if (!geo || !continent || wholeContinentAdded) return [];
    return geo.countries
      .filter((c) => c.continentCode === continent
        && c.ipCount >= instances
        && !selectedCodes.has(`${continent}_${c.code}`))
      .map((c) => ({ code: c.code, name: c.name, nodeCount: c.nodeCount, ipCount: c.ipCount }));
  }, [geo, continent, instances, selectedCodes, wholeContinentAdded]);

  function addLocation() {
    if (!continent) return;
    const code = country ? `${continent}_${country}` : continent;
    if (selectedCodes.has(code)) return;
    onChange([...selected, { code, type: 'allowed' }]);
    setCountry('');
  }

  function removeCode(code) {
    onChange(selected.filter((g) => g.code !== code));
  }

  function toggleType(code) {
    onChange(selected.map((g) => (
      g.code === code ? { ...g, type: g.type === 'allowed' ? 'forbidden' : 'allowed' } : g
    )));
  }

  const selectCls =
    'h-9 w-full border border-border bg-surface text-text text-sm px-3 ' +
    'outline-none focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className={`flex flex-col gap-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <select
          aria-label="Continent"
          value={continent}
          onChange={(e) => { setContinent(e.target.value); setCountry(''); }}
          className={selectCls}
        >
          <option value="">Select continent…</option>
          {continentOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}{c.ipCount != null ? ` · ${c.nodeCount.toLocaleString()} nodes · ${c.ipCount.toLocaleString()} IPs` : ''}
            </option>
          ))}
        </select>

        <select
          aria-label="Country (optional)"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          disabled={!continent || wholeContinentAdded || !geo}
          className={selectCls}
        >
          <option value="">
            {wholeContinentAdded ? 'Whole continent added' : 'Any country'}
          </option>
          {countryOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} · {c.nodeCount.toLocaleString()} nodes · {c.ipCount.toLocaleString()} IPs
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={addLocation}
          disabled={!continent || (Boolean(country) && wholeContinentAdded)}
          className="btn-secondary h-9 px-4 text-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add
        </button>
      </div>

      {/* Tip: multiple locations ⇒ more distinct hosts ⇒ a guaranteed, faster deploy */}
      <p className="text-xs text-text-muted leading-relaxed">
        <span className="text-amber-400 font-medium">Tip:</span> add several locations to give your deployment
        more distinct hosts to land on. Each instance needs its own public IP, so the <span className="font-medium">IP
        count</span>, rather than the node count, is what guarantees the deployment. More choices also make deployment faster.
      </p>

      {/* Selected locations */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((g) => {
            const isForbidden = g.type === 'forbidden';
            return (
              <div
                key={g.code}
                className={`flex items-center overflow-hidden border ${
                  isForbidden ? 'border-red-500/40' : 'border-primary/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleType(g.code)}
                  title={`Currently ${isForbidden ? 'forbidden' : 'allowed'} — click to toggle`}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    isForbidden ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary'
                  }`}
                >
                  {isForbidden ? '✗ ' : '✓ '}{labelForGeoCode(g.code)}
                </button>
                <button
                  type="button"
                  onClick={() => removeCode(g.code)}
                  className="px-2 py-1.5 text-xs border-l border-border text-text-muted hover:text-red-400 hover:bg-red-500/10 "
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-text-muted">No restriction. Deploys globally to any available node.</p>
      )}
    </div>
  );
}
