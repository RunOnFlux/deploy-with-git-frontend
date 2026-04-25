/**
 * Parse environment variables from .env, JSON, or YAML text.
 * Returns an array of { key, value } objects (invalid lines are skipped).
 */

function parseEnvFormat(text) {
  const pairs = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip optional surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) pairs.push({ key, value });
  }
  return pairs;
}

function parseJsonFormat(text) {
  const obj = JSON.parse(text);
  if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) {
    throw new Error('JSON must be a flat object of key-value pairs');
  }
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value ?? '') }));
}

/** Handles simple flat YAML (key: value) without a library. */
function parseYamlFormat(text) {
  const pairs = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    // Strip optional surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) pairs.push({ key, value });
  }
  return pairs;
}

/**
 * Auto-detect format and parse.
 * @param {string} text
 * @returns {{ pairs: Array<{key,value}>, format: string, error: string|null }}
 */
export function parseEnvText(text) {
  const trimmed = text.trim();
  if (!trimmed) return { pairs: [], format: 'empty', error: null };

  // JSON: starts with {
  if (trimmed.startsWith('{')) {
    try {
      return { pairs: parseJsonFormat(trimmed), format: 'json', error: null };
    } catch (e) {
      return { pairs: [], format: 'json', error: e.message };
    }
  }

  // YAML heuristic: has "key: value" lines but no "KEY=value" lines
  const hasEquals = /^[A-Z_][A-Z0-9_]*\s*=/m.test(trimmed);
  const hasColon  = /^[a-zA-Z_][a-zA-Z0-9_]*\s*:/m.test(trimmed);
  if (hasColon && !hasEquals) {
    const pairs = parseYamlFormat(trimmed);
    return { pairs, format: 'yaml', error: pairs.length === 0 ? 'No valid key: value pairs found' : null };
  }

  // Default: .env format
  const pairs = parseEnvFormat(trimmed);
  return { pairs, format: 'env', error: pairs.length === 0 ? 'No valid KEY=value pairs found' : null };
}
