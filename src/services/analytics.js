/** @typedef {{ enabled: boolean, measurementId: string }} AnalyticsConfig */

const CONSENT_KEY = 'orbit_analytics_consent';
const CONSENT_EVENT = 'orbit:analytics-consent';

let scriptLoaded = false;
let scriptLoading = null;

function isDev() {
  return import.meta.env.DEV;
}

export function getAnalyticsConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent() {
  return getAnalyticsConsent() === 'granted';
}

export function setAnalyticsConsent(granted) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { granted } }));
}

function canTrack() {
  if (isDev()) return true;
  return hasAnalyticsConsent() && scriptLoaded && typeof window.gtag === 'function';
}

function loadGtagScript(measurementId) {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;

    const timeoutId = setTimeout(() => {
      reject(new Error('Google Analytics script load timed out'));
    }, 10000);

    script.onload = () => {
      clearTimeout(timeoutId);
      scriptLoaded = true;

      window.gtag('js', new Date());
      window.gtag('config', measurementId, {
        send_page_view: false,
        anonymize_ip: true,
      });
      window.gtag('consent', 'update', { analytics_storage: 'granted' });

      trackPageView(`${window.location.pathname}${window.location.search}`);

      resolve();
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Failed to load Google Analytics script'));
    };

    document.head.appendChild(script);
  }).finally(() => {
    scriptLoading = null;
  });

  return scriptLoading;
}

/**
 * Initialize analytics from runtime config (`GET /api/config`).
 * @param {AnalyticsConfig} analytics
 * @returns {{ enabled: boolean, awaitingConsent?: boolean }}
 */
export function initAnalytics(analytics) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  const { enabled, measurementId } = analytics || {};

  if (!enabled || !measurementId) {
    window.gtag = () => {};
    return { enabled: false };
  }

  if (isDev()) {
    window.gtag = (...args) => {
      console.log('[analytics]', ...args);
    };
    return { enabled: true };
  }

  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
  });

  const onConsent = (event) => {
    if (event.detail?.granted) {
      loadGtagScript(measurementId).catch((err) => {
        console.warn('[analytics] Failed to load after consent:', err.message);
      });
    }
  };

  window.addEventListener(CONSENT_EVENT, onConsent);

  if (hasAnalyticsConsent()) {
    loadGtagScript(measurementId).catch((err) => {
      console.warn('[analytics] Failed to load:', err.message);
    });
    return { enabled: true };
  }

  if (getAnalyticsConsent() === 'denied') {
    return { enabled: true };
  }

  return { enabled: true, awaitingConsent: true };
}

export function shouldShowAnalyticsConsent(analytics) {
  if (isDev()) return false;
  if (!analytics?.enabled || !analytics?.measurementId) return false;
  return getAnalyticsConsent() == null;
}

/**
 * @param {string} path
 * @param {string} [title]
 */
export function trackPageView(path, title = document.title) {
  if (!canTrack()) return;

  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title,
  });
}

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [params]
 */
export function trackEvent(eventName, params = {}) {
  if (!canTrack()) return;

  window.gtag('event', eventName, {
    ...params,
    timestamp: new Date().toISOString(),
  });
}
