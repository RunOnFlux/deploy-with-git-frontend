// API Configuration for Orbit Deployment UI

export const apiConfig = {
  // Primary Flux Network API
  fluxApi: {
    baseUrl: 'https://api.runonflux.io',
    endpoints: {
      loginPhrase: '/id/loginphrase',
      verifyLogin: '/id/verifylogin',
      zelid: '/zelid/zelid',
      // App management
      permanentMessages: '/apps/permanentmessages',
      appSpecifics: '/apps/appspecifications',
      appLocation: '/apps/getapplocation',
      appInstallingLocation: '/apps/getappinstallinglocation',
      appHashes: '/apps/getapphashes',
      appGlobalStatuses: '/apps/appglobalnodesstatuses',
      installedApps: '/apps/installedapps',
      registerApp: '/apps/registerapplication',
      registrationVerification: '/apps/appregistrationverification',
      testAppInstall: '/apps/testappinstall',
      deploymentInformation: '/apps/deploymentinformation',
      calculatePrice: '/apps/calculatefiatandfluxprice',
      getAppPublicKey: '/apps/getpublickey',
      // Log polling
      appLogPolling: '/apps/applogpolling',
    },
  },

  // FluxCore SSO service
  fluxCore: {
    baseUrl: 'https://service.fluxcore.ai',
    endpoints: {
      signInOrUp: '/api/signInOrUp',
      sign: '/api/sign',
    },
  },

  // Payment Bridge (Stripe + Flux payments)
  paymentBridge: {
    get baseUrl() {
      return import.meta.env.VITE_PAYMENT_BRIDGE_URL || 'https://jetpackbridge.runonflux.io';
    },
    endpoints: {
      stripeCheckout: '/api/v1/stripe/checkout/create',
      stripeSubscription: '/api/v1/stripe/subscription/create',
    },
  },

  // Stripe
  stripe: {
    get publishableKey() {
      return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    },
  },

  settings: {
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
};

/**
 * Build a Flux node URL from an IP address and port.
 * e.g. buildNodeUrl('65.109.86.26', 16127)
 *   → 'https://65-109-86-26-16127.node.api.runonflux.io'
 */
export const buildNodeUrl = (ip, port) => {
  const dashedIp = ip.replace(/\./g, '-');
  return `https://${dashedIp}-${port}.node.api.runonflux.io`;
};

/**
 * Build a sticky backend URL from a fluxnode header value.
 * fluxnode header format: 'server78_65.109.86.26' or just the IP
 */
export const buildStickyBackendUrl = (fluxnodeHeader) => {
  // Extract IP (after underscore if present)
  const ip = fluxnodeHeader.includes('_')
    ? fluxnodeHeader.split('_')[1]
    : fluxnodeHeader;
  const dashedIp = ip.replace(/\./g, '-');
  return `https://${dashedIp}-16127.node.api.runonflux.io`;
};

/**
 * Build full API URL for a Flux endpoint.
 */
export const buildFluxUrl = (endpoint, ...pathParts) => {
  const base = apiConfig.fluxApi.baseUrl + endpoint;
  if (pathParts.length === 0) return base;
  return `${base}/${pathParts.map(encodeURIComponent).join('/')}`;
};

export default apiConfig;
