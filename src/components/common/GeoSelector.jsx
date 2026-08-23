import { useEffect, useMemo, useState } from 'react';
import { GEO_OPTIONS, labelForGeoCode, buildGeoSpec } from '../../services/geolocationSpec';
import { useDeployCapacity, fetchDeployCapacity } from '../../hooks/useNetworkStats';

// Countries where a region can be picked. The US on purpose and only the US:
// it is where distance inside one country actually costs the player latency
// (coast to coast is ~60-80ms). Elsewhere the country is a precise enough choice.
const REGION_PICKER_COUNTRIES = new Set(['US']);
// Pinning to one region shrinks the host pool hard, so a region only qualifies
// if it keeps spare IPs for a failed placement or a later relocation — and the
// country needs several such regions before the extra picker is worth showing.
const REGION_IP_HEADROOM = 2;
const MIN_REGIONS_TO_OFFER = 2;

/**
 * Capacity-aware geolocation picker. Mirrors the FluxOS / sibling-site location
 * step: nodes are filtered by the plan's hardware (after the node OS reserve) and,
 * for enterprise apps, by arcaneVersion support, and every location that keeps at
 * least one such node is offered.
 *
 * Every location, deliberately. A per-location gate on the instance count asks the
 * wrong question and used to live here: Flux places into the POOL of allowed
 * locations, so Portugal's 2 IPs and Spain's 20 are 22 candidates and a 3-instance
 * app places fine across them. Judging each option alone hid selections that work
 * and made "prefer Iberia" impossible to express. The rule that replaced it: hide
 * what can never work (too small for the plan), show what is merely full, and judge
 * the SELECTION as a whole — the line below the pickers, and again on the way to
 * committing, where it is confirmed against the nodes themselves.
 *
 * Each option carries how many of its host servers have room right NOW, which is the
 * number that decides anything; the total it is out of says how deep the location is.
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
  const [region, setRegion] = useState('');

  const selectedCodes = useMemo(() => new Set(selected.map((g) => g.code)), [selected]);
  const wholeContinentAdded = continent && selectedCodes.has(continent);

  // Every continent with a node that fits the plan, not already added.
  const continentOptions = useMemo(() => {
    if (!geo) {
      // Fallback: static continents, no capacity info.
      return GEO_OPTIONS
        .filter((o) => !selectedCodes.has(o.code))
        .map((o) => ({ code: o.code, name: o.label, nodeCount: null, ipCount: null }));
    }
    return geo.continents
      .filter((c) => !selectedCodes.has(c.code))
      .map((c) => ({ code: c.code, name: c.name, nodeCount: c.nodeCount, ipCount: c.ipCount, freeIpCount: c.freeIpCount }));
  }, [geo, selectedCodes]);

  // Every country in the chosen continent with a node that fits, not already added.
  const countryOptions = useMemo(() => {
    if (!geo || !continent || wholeContinentAdded) return [];
    return geo.countries
      .filter((c) => c.continentCode === continent
        && !selectedCodes.has(`${continent}_${c.code}`))
      .map((c) => ({ code: c.code, name: c.name, nodeCount: c.nodeCount, ipCount: c.ipCount, freeIpCount: c.freeIpCount }));
  }, [geo, continent, selectedCodes, wholeContinentAdded]);

  const wholeCountryAdded = Boolean(country) && selectedCodes.has(`${continent}_${country}`);

  // Regions inside the chosen country — US only (see REGION_PICKER_COUNTRIES),
  // and even there only when it splits into several regions that each keep spare
  // IPs beyond the instance count.
  const regionOptions = useMemo(() => {
    if (!geo?.regions || !continent || !REGION_PICKER_COUNTRIES.has(country)
      || wholeContinentAdded || wholeCountryAdded) return [];
    const opts = geo.regions
      .filter((r) => r.continentCode === continent
        && r.countryCode === country
        && r.ipCount >= instances + REGION_IP_HEADROOM
        && !selectedCodes.has(`${continent}_${country}_${r.code}`))
      .map((r) => ({ code: r.code, name: r.name, nodeCount: r.nodeCount, ipCount: r.ipCount, freeIpCount: r.freeIpCount }));
    return opts.length >= MIN_REGIONS_TO_OFFER ? opts : [];
  }, [geo, continent, country, instances, selectedCodes, wholeContinentAdded, wholeCountryAdded]);

  /**
   * Capacity of the SELECTION, refreshed as it is edited.
   *
   * `probe: false`: a round of requests to the nodes on every edit would be absurd,
   * and the cached aggregate is exactly what that is for. The commit points — the
   * wizard's Next and the spec editor's Save — ask with probing on, which is where
   * being half an hour behind would actually cost someone something.
   */
  const [selectionCapacity, setSelectionCapacity] = useState(null);
  const geoTokens = useMemo(() => buildGeoSpec(selected), [selected]);
  const geoKey = geoTokens.join('|');
  useEffect(() => {
    if (!geoTokens.length) { setSelectionCapacity(null); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchDeployCapacity({
        geolocation: geoTokens,
        cpu: hardware?.cpu,
        ram: hardware?.ram,
        hdd: hardware?.hdd,
        enterprise,
        instances,
        probe: false,
      }, controller.signal).then((c) => { if (!controller.signal.aborted) setSelectionCapacity(c); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  // geoKey stands in for geoTokens, which is a fresh array on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, hardware?.cpu, hardware?.ram, hardware?.hdd, enterprise, instances]);

  function addLocation() {
    if (!continent) return;
    let code = continent;
    if (country) {
      code = `${continent}_${country}`;
      if (region) code += `_${region}`;
    }
    if (selectedCodes.has(code)) return;
    onChange([...selected, { code, type: 'allowed' }]);
    setCountry('');
    setRegion('');
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
          onChange={(e) => { setContinent(e.target.value); setCountry(''); setRegion(''); }}
          className={selectCls}
        >
          <option value="">Select continent…</option>
          {continentOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}{c.ipCount != null ? ` · ${c.freeIpCount.toLocaleString()} of ${c.ipCount.toLocaleString()} hosts free` : ''}
            </option>
          ))}
        </select>

        <select
          aria-label="Country (optional)"
          value={country}
          onChange={(e) => { setCountry(e.target.value); setRegion(''); }}
          disabled={!continent || wholeContinentAdded || !geo}
          className={selectCls}
        >
          <option value="">
            {wholeContinentAdded ? 'Whole continent added' : 'Any country'}
          </option>
          {countryOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} · {c.freeIpCount.toLocaleString()} of {c.ipCount.toLocaleString()} hosts free
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

      {/* Region — only rendered for countries whose nodes genuinely spread out */}
      {regionOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <select
            aria-label="Region (optional)"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={selectCls}
          >
            <option value="">Any region</option>
            {regionOptions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} · {r.freeIpCount.toLocaleString()} of {r.ipCount.toLocaleString()} hosts free
              </option>
            ))}
          </select>
          <p className="text-xs text-text-muted leading-relaxed">
            This country has hosts in several regions. Narrowing to one cuts latency for nearby
            users, but leaves fewer hosts to deploy on — leave it on <span className="font-medium">Any
            region</span> if you are not sure.
          </p>
        </div>
      )}

      {/* Tip: multiple locations ⇒ more distinct hosts ⇒ a guaranteed, faster deploy */}
      <p className="text-xs text-text-muted leading-relaxed">
        <span className="text-amber-400 font-medium">Tip:</span> add several locations to give your deployment
        more distinct hosts to land on. Flux never puts two copies on the same host, so what decides a
        deployment is how many hosts are <span className="font-medium">free</span> across everything you
        pick, not how many exist. More choices also make deployment faster.
      </p>

      {/* Capacity of the whole selection — the only level at which the question means
          anything, since Flux places into the pool of everything picked. */}
      {selectionCapacity && (
        selectionCapacity.verdict === 'short' ? (
          <p className="text-xs text-amber-400 leading-relaxed">
            These locations cover {selectionCapacity.ipCount} host{selectionCapacity.ipCount === 1 ? '' : 's'} able
            to run this app, and it runs on {selectionCapacity.instances} copies. At
            least {selectionCapacity.instances - selectionCapacity.ipCount}{' '}
            {selectionCapacity.instances - selectionCapacity.ipCount === 1 ? 'copy' : 'copies'} will have
            nowhere to go for as long as this selection stands, and that does not resolve itself with time.
          </p>
        ) : selectionCapacity.verdict === 'full' ? (
          <p className="text-xs text-amber-400 leading-relaxed">
            {selectionCapacity.freeIpCount === 0
              ? `None of the ${selectionCapacity.ipCount} hosts in your locations has room for this app right now.`
              : `Only ${selectionCapacity.freeIpCount} of the ${selectionCapacity.ipCount} hosts in your locations has room right now, and this app runs on ${selectionCapacity.instances} copies.`}{' '}
            Add another location so every copy has somewhere to go.
          </p>
        ) : selectionCapacity.freeIpCount <= selectionCapacity.instances ? (
          <p className="text-xs text-amber-400 leading-relaxed">
            {selectionCapacity.freeIpCount} of the {selectionCapacity.ipCount} hosts in your
            locations {selectionCapacity.freeIpCount === 1 ? 'has' : 'have'} room, which is exactly what
            this app needs and nothing spare. If one fills up before you deploy, a copy has nowhere to go.
          </p>
        ) : (
          <p className="text-xs text-text-muted leading-relaxed">
            {selectionCapacity.freeIpCount} of {selectionCapacity.ipCount} hosts in your locations have
            room for this app right now.
          </p>
        )
      )}

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
