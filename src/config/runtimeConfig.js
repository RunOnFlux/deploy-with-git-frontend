import {
  DEFAULT_APP_URL,
  DEFAULT_PAYMENT_BRIDGE_URL,
  DEFAULT_FIREBASE,
} from '../../config/defaults.js';

/**
 * @typedef {Object} RuntimeConfig
 * @property {'self' | 'fluxcore'} ssoProvider
 * @property {string} appUrl
 * @property {string} paymentBridgeUrl
 * @property {string} stripePublishableKey
 * @property {typeof DEFAULT_FIREBASE} firebase
 * @property {{ enabled: boolean, measurementId: string }} analytics
 */

/** @type {RuntimeConfig | null} */
let _config = null;

function envFlag(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1';
}

/** Dev-only fallback when the BFF is not running. */
function configFromImportMetaEnv() {
  return {
    ssoProvider: 'self',
    appUrl: import.meta.env.VITE_APP_URL || DEFAULT_APP_URL,
    paymentBridgeUrl: import.meta.env.VITE_PAYMENT_BRIDGE_URL || DEFAULT_PAYMENT_BRIDGE_URL,
    stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
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
      enabled: envFlag(import.meta.env.VITE_ENABLE_ANALYTICS, false),
      measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID || '',
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
    if (import.meta.env.DEV) {
      console.warn('[runtimeConfig] /api/config unavailable, using import.meta.env fallback:', err.message);
      _config = configFromImportMetaEnv();
      return _config;
    }
    throw new Error(`Failed to load runtime config: ${err.message}`);
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
