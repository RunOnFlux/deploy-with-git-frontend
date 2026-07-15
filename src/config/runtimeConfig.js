import {
  DEFAULT_APP_URL,
  DEFAULT_PAYMENT_BRIDGE_URL,
  DEFAULT_FIREBASE,
  DEFAULT_GA_MEASUREMENT_ID,
} from '../../config/defaults.js';

/**
 * @typedef {Object} RuntimeConfig
 * @property {string} appUrl
 * @property {string} paymentBridgeUrl
 * @property {typeof DEFAULT_FIREBASE} firebase
 * @property {{ enabled: boolean, measurementId: string }} analytics
 */

/** @type {RuntimeConfig | null} */
let _config = null;

function envFlag(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1';
}

/** Fallback config when /api/config is unreachable (BFF down in dev, or a transient
 *  failure in prod). Resolves to config/defaults.js when the VITE_* vars are absent. */
function configFromImportMetaEnv() {
  return {
    appUrl: import.meta.env.VITE_APP_URL || DEFAULT_APP_URL,
    paymentBridgeUrl: import.meta.env.VITE_PAYMENT_BRIDGE_URL || DEFAULT_PAYMENT_BRIDGE_URL,
    firebase: {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE.apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE.authDomain,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE.projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE.appId,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE.measurementId,
    },
    analytics: {
      enabled: envFlag(import.meta.env.VITE_ENABLE_ANALYTICS, true),
      measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID || DEFAULT_GA_MEASUREMENT_ID,
    },
  };
}

/**
 * Fetch public runtime config from the BFF. Cached for the page lifetime.
 * @returns {Promise<RuntimeConfig>}
 */
export async function loadRuntimeConfig() {
  if (_config) return _config;

  try {
    const resp = await fetch('/api/config');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    _config = await resp.json();
    return _config;
  } catch (err) {
    // NEVER throw here. A transient /api/config failure (a 429, a 502, a briefly
    // overloaded BFF) must not abort bootstrap — that would blank a page the server
    // already rendered in full. The built-in defaults (config/defaults.js) are the
    // real production values (app URL, prod Firebase, GA id), so falling back keeps
    // the app fully functional. import.meta.env.VITE_* are inlined at build time and
    // simply resolve to those same defaults when absent.
    console.warn('[runtimeConfig] /api/config unavailable, using built-in defaults:', err.message);
    _config = configFromImportMetaEnv();
    return _config;
  }
}

/**
 * Return cached runtime config. Call loadRuntimeConfig() first during bootstrap.
 * @returns {RuntimeConfig}
 */
export function getRuntimeConfig() {
  if (!_config) {
    throw new Error('Runtime config not loaded — call loadRuntimeConfig() before using the app');
  }
  return _config;
}
