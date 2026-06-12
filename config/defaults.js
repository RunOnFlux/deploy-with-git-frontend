/** Shared default values for public client config (safe to expose via /api/config). */

export const DEFAULT_APP_URL = 'https://orbit.runonflux.com';
export const DEFAULT_PAYMENT_BRIDGE_URL = 'https://fiatpaymentsbridge.runonflux.io';

/** GA4 property for the Orbit site. Overridable via VITE_GA_MEASUREMENT_ID. */
export const DEFAULT_GA_MEASUREMENT_ID = 'G-TLJ33FR9XM';

export const DEFAULT_FIREBASE = {
  apiKey: 'AIzaSyAtMsozWwJhhPIOd9BGkZxk5D6Wr8jVGVM',
  authDomain: 'fluxcore-prod.firebaseapp.com',
  projectId: 'fluxcore-prod',
  storageBucket: 'fluxcore-prod.appspot.com',
  messagingSenderId: '468366888401',
  appId: '1:468366888401:web:56eb34ebe93751527ea4f0',
  measurementId: 'G-SEGT3X2737',
};
