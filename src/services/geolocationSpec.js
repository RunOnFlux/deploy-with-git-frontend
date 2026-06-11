/** Continent codes used by the simplified Orbit geo picker. */
export const GEO_OPTIONS = [
  { code: 'EU', label: 'Europe' },
  { code: 'NA', label: 'North America' },
  { code: 'AS', label: 'Asia' },
  { code: 'OC', label: 'Oceania' },
  { code: 'SA', label: 'South America' },
  { code: 'AF', label: 'Africa' },
];

const CONTINENT_CODES = new Set(GEO_OPTIONS.map((o) => o.code));

function parseGeoToken(token) {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Legacy orbit-ui bug: a=EU / f=NA
  const eq = trimmed.indexOf('=');
  if (eq > 0 && (trimmed[0] === 'a' || trimmed[0] === 'f')) {
    const code = trimmed.slice(eq + 1).split('_')[0];
    return code ? { code, type: trimmed[0] === 'f' ? 'forbidden' : 'allowed' } : null;
  }

  if (trimmed.startsWith('a!c')) {
    const code = trimmed.slice(3).split('_')[0];
    return code ? { code, type: 'forbidden' } : null;
  }

  if (trimmed.startsWith('ac')) {
    const code = trimmed.slice(2).split('_')[0];
    return code ? { code, type: 'allowed' } : null;
  }

  // Very old Flux format: aEU / bDE (continent / country)
  if (trimmed.startsWith('a') && trimmed.length >= 3) {
    const code = trimmed.slice(1).split('_')[0];
    return code ? { code, type: 'allowed' } : null;
  }

  // Bare continent code from flux.json helpers
  if (CONTINENT_CODES.has(trimmed)) {
    return { code: trimmed, type: 'allowed' };
  }

  return null;
}

/**
 * Parse Flux spec geolocation strings into UI rows.
 * Flux format: acEU, acEU_DE, a!cNA, …
 */
export function parseGeoSpec(arr = []) {
  const map = new Map();
  for (const token of arr) {
    const row = parseGeoToken(token);
    if (!row?.code) continue;
    const existing = map.get(row.code);
    if (!existing || row.type === 'forbidden') {
      map.set(row.code, row);
    }
  }
  return [...map.values()];
}

/**
 * Build Flux spec geolocation strings from UI rows.
 */
export function buildGeoSpec(rows = []) {
  return rows
    .filter((g) => g.code)
    .map((g) => `${g.type === 'forbidden' ? 'a!c' : 'ac'}${g.code}`);
}

export function formatGeoRows(rows = []) {
  if (!rows.length) return 'No restriction (global)';
  return rows
    .map((g) => {
      const label = GEO_OPTIONS.find((o) => o.code === g.code)?.label ?? g.code;
      return `${g.type === 'forbidden' ? '✗ ' : '✓ '}${label}`;
    })
    .join(', ');
}

export function formatGeoSpecArray(arr = []) {
  return formatGeoRows(parseGeoSpec(arr));
}

/** Map flux.json import fields to wizard geolocation rows. */
export function geolocationFromImport(payload = {}) {
  if (Array.isArray(payload.geolocation) && payload.geolocation.length) {
    return parseGeoSpec(payload.geolocation);
  }
  const tokens = [
    ...(payload.allowedGeolocations || []),
    ...(payload.forbiddenGeolocations || []),
  ];
  return parseGeoSpec(tokens);
}
