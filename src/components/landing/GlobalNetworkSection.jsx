import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Globe } from 'lucide-react';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const DEFAULT_CENTER = [10, 20];
const DEFAULT_SCALE = 150;

// Orbit palette (indigo primary / violet accent / amber highlight)
const COUNTRY_COLOR = '#6366f1';
const CITY_COLOR = '#a78bfa';
const HOVER_COLOR = '#fbbf24';

// Inject the marquee keyframes once for the country carousel.
if (typeof document !== 'undefined' && !document.getElementById('orbit-marquee-keyframes')) {
  const style = document.createElement('style');
  style.id = 'orbit-marquee-keyframes';
  style.textContent = '@keyframes orbit-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }';
  document.head.appendChild(style);
}

function markerSize(count) {
  if (count >= 500) return 7;
  if (count >= 100) return 5;
  if (count >= 30) return 3.5;
  return 2;
}

/** Count-up animation for the headline stats. */
const AnimatedNumber = ({ value }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!value) return;
    const duration = 1200;
    const start = performance.now();
    let id;
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <>{display.toLocaleString()}</>;
};

/** Infinite-scrolling flag carousel of countries, sorted by node count. */
const CountryCarousel = memo(({ countries, onHoverCountry }) => {
  const [paused, setPaused] = useState(false);
  const sorted = useMemo(
    () => countries.filter((c) => c.country !== 'Unknown' && c.countryCode),
    [countries],
  );
  if (sorted.length === 0) return null;

  return (
    <div className="relative overflow-hidden">
      <div className="absolute left-0 inset-y-0 w-10 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent" />
      <div className="absolute right-0 inset-y-0 w-10 z-10 pointer-events-none bg-gradient-to-l from-background to-transparent" />
      <div
        className="flex gap-2.5 w-max"
        style={{
          animation: `orbit-marquee ${Math.max(sorted.length * 2.5, 30)}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      >
        {[...sorted, ...sorted].map((c, idx) => (
          <div
            key={`${c.country}-${idx}`}
            className="flex-shrink-0 inline-flex items-center gap-2 rounded-full pl-2 pr-3.5 py-1.5 bg-surface/70 border border-border/40 hover:border-primary/40 transition-colors cursor-default"
            onMouseEnter={() => { onHoverCountry(c.country); setPaused(true); }}
            onMouseLeave={() => { onHoverCountry(null); setPaused(false); }}
          >
            <img
              src={`https://flagcdn.com/w40/${c.countryCode}.png`}
              alt=""
              className="w-5 h-3.5 rounded-[2px] object-cover"
              loading="lazy"
            />
            <span className="text-xs font-medium text-text whitespace-nowrap">{c.country}</span>
            <span className="text-xs font-bold text-primary">{c.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
CountryCarousel.displayName = 'CountryCarousel';

function GlobalNetworkSection() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [highlightedCountry, setHighlightedCountry] = useState(null);
  const [zoomedCountry, setZoomedCountry] = useState(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [scale, setScale] = useState(DEFAULT_SCALE);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/network-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('stats unavailable'))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const resetZoom = useCallback(() => {
    setZoomedCountry(null);
    setCenter(DEFAULT_CENTER);
    setScale(DEFAULT_SCALE);
  }, []);

  // Country dots by default; when a country is zoomed, swap its dot for its city dots.
  const visibleClusters = useMemo(() => {
    const countryDots = (data?.countries || []).filter((c) => c.country !== 'Unknown');
    if (!zoomedCountry) return countryDots;
    const cities = (data?.cityClusters || [])
      .filter((c) => c.country === zoomedCountry)
      .map((c) => ({ ...c, isCity: true }));
    return [...countryDots.filter((c) => c.country !== zoomedCountry), ...cities];
  }, [data, zoomedCountry]);

  const handleDotClick = useCallback((cluster) => {
    setHovered(null);
    if (cluster.isCity || zoomedCountry === cluster.country) {
      resetZoom();
      return;
    }
    const cities = (data?.cityClusters || []).filter((c) => c.country === cluster.country);
    if (cities.length > 1) {
      const lats = cities.map((c) => c.lat);
      const lons = cities.map((c) => c.lon);
      const spread = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
      const autoScale = spread > 20 ? 380 : spread > 10 ? 520 : spread > 5 ? 680 : 880;
      setCenter([(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]);
      setScale(Math.round(autoScale * (window.innerWidth < 768 ? 1.3 : 1)));
    } else {
      setCenter([cluster.lon, cluster.lat]);
      setScale(window.innerWidth < 768 ? 600 : 400);
    }
    setZoomedCountry(cluster.country);
  }, [data, zoomedCountry, resetZoom]);

  // Don't render the section if stats are unavailable, which keeps the page clean.
  if (failed) return null;

  return (
    <section id="network" className="relative py-20 border-t border-border/50 bg-background-alt/40 overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <Globe className="w-3.5 h-3.5" />
            Global Network
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text mb-3">
            Deployed across a worldwide network
          </h2>
          <p className="text-text-secondary max-w-2xl mx-auto">
            {data ? (
              <>
                Your apps run on a decentralized network of{' '}
                <span className="text-primary font-semibold">{data.total.toLocaleString()}</span> Flux nodes
                across <span className="text-accent font-semibold">{data.countryCount}</span> countries.
                Choose the region closest to your users.
              </>
            ) : (
              'Loading live node distribution from the Flux network…'
            )}
          </p>
          <p className="text-text-secondary/80 text-sm sm:text-base leading-relaxed max-w-3xl mx-auto mt-6 text-left sm:text-center">
            Most modern hosting concentrates your app inside one company&apos;s data centers, leaving you with
            one provider&apos;s pricing, one provider&apos;s policies, and one single point of failure. Orbit
            takes a different path. Your app runs on the Flux network: thousands of independently
            operated nodes across dozens of countries, run by thousands of separate operators.
            Because no single party owns the infrastructure, there is no gatekeeper who can
            deplatform you, no vendor able to lock in your data, and no lone data center whose
            outage takes you offline.
          </p>
          <p className="text-text-secondary/80 text-sm sm:text-base leading-relaxed max-w-3xl mx-auto mt-4 text-left sm:text-center">
            Your container also runs on real, dedicated hardware rather than a metered slice of a
            shared server, and it runs on several nodes at once, so the network absorbs the failures
            that would mean downtime on a single-server setup. For dApp front-ends, indie projects
            and teams that want genuine redundancy and censorship resistance, decentralized hosting
            delivers the reliability of a top-tier cloud without handing control to one corporation.
          </p>
        </motion.div>

        {/* Stats bar */}
        {data && (
          <motion.div
            className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-10"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            {[
              { value: data.total, label: 'Live nodes', color: 'text-primary' },
              { value: data.countryCount, label: 'Countries', color: 'text-accent' },
              { value: 99.9, label: 'Uptime %', color: 'text-warning', raw: true },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className={`text-2xl sm:text-3xl font-bold font-heading ${stat.color}`}>
                  {stat.raw ? `${stat.value}%` : <AnimatedNumber value={stat.value} />}
                </div>
                <div className="text-[11px] text-text-muted uppercase tracking-widest mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Map */}
      <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6">
        <motion.div
          className="relative overflow-hidden rounded-2xl border border-primary/15 bg-surface/20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
        >
          {zoomedCountry && (
            <button
              type="button"
              onClick={resetZoom}
              className="absolute top-3 right-3 z-20 text-xs px-3 py-1.5 rounded-lg bg-surface/90 border border-border text-text-secondary hover:text-text transition-colors"
            >
              ← Reset view
            </button>
          )}

          {!data ? (
            <div className="flex items-center justify-center h-[360px] sm:h-[520px] text-text-muted text-sm">
              Loading map…
            </div>
          ) : (
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale, center }}
              style={{ width: '100%', height: 'auto', transition: 'all 0.5s ease-in-out' }}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const name = geo.properties.name || '';
                    const isZoomed = zoomedCountry && (name === zoomedCountry || name.includes(zoomedCountry) || zoomedCountry.includes(name));
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={isZoomed ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.07)'}
                        stroke={isZoomed ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.14)'}
                        strokeWidth={isZoomed ? 0.8 : 0.4}
                        style={{
                          default: { outline: 'none', transition: 'fill 0.4s, stroke 0.4s' },
                          hover: { outline: 'none', fill: 'rgba(99,102,241,0.14)' },
                          pressed: { outline: 'none' },
                        }}
                      />
                    );
                  })
                }
              </Geographies>

              {visibleClusters.map((cluster, i) => {
                const isCity = cluster.isCity;
                const size = isCity ? Math.max(markerSize(cluster.count) * 0.7, 2) : markerSize(cluster.count);
                const isHovered =
                  (hovered?.lat === cluster.lat && hovered?.lon === cluster.lon) ||
                  (!isCity && highlightedCountry === cluster.country);
                const dimmed = zoomedCountry && !isCity && cluster.country !== zoomedCountry;
                const base = isCity ? CITY_COLOR : COUNTRY_COLOR;
                const color = isHovered ? HOVER_COLOR : dimmed ? '#3b3b52' : base;

                return (
                  <Marker
                    key={`${cluster.country}-${i}`}
                    coordinates={[cluster.lon, cluster.lat]}
                    onMouseEnter={() => setHovered(cluster)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleDotClick(cluster)}
                    style={{ default: { cursor: 'pointer' } }}
                  >
                    <circle r={size * 3} fill={color} opacity={isHovered ? 0.22 : 0.07} style={{ transition: 'all 0.3s' }} />
                    <circle r={isHovered ? size + 1 : size} fill={color} opacity={dimmed ? 0.35 : isHovered ? 1 : 0.85} style={{ transition: 'all 0.3s' }} />
                    {cluster.count >= 100 && !dimmed && (
                      <circle r={size} fill="none" stroke={color} strokeWidth={0.8}>
                        <animate attributeName="r" from={size} to={size + 9} dur="2.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.5" to="0" dur="2.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </Marker>
                );
              })}
            </ComposableMap>
          )}

          {/* Tooltip */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                className="fixed z-50 pointer-events-none"
                style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 14 }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.12 }}
              >
                <div className="rounded-xl px-4 py-2.5 bg-surface/95 border border-primary/30 backdrop-blur-md shadow-xl">
                  <div className="text-text font-semibold text-sm">
                    {hovered.region ? `${hovered.region}, ${hovered.country}` : hovered.country}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${hovered.isCity ? 'bg-accent' : 'bg-primary'}`} />
                    <span className={`text-xs font-medium ${hovered.isCity ? 'text-accent' : 'text-primary'}`}>
                      {hovered.count.toLocaleString()} {hovered.count === 1 ? 'node' : 'nodes'}
                    </span>
                  </div>
                  {!hovered.isCity && (
                    <div className="text-[10px] text-text-muted mt-1">Click to zoom in</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Country carousel pinned to map bottom */}
          {data && (
            <div className="absolute bottom-0 inset-x-0 z-10 pb-3 px-2">
              <CountryCarousel countries={data.countries} onHoverCountry={setHighlightedCountry} />
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export default memo(GlobalNetworkSection);
