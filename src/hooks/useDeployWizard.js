import { useReducer, useCallback } from 'react';
import { generatePortPair } from '../services/deployService';

const INITIAL_STATE = {
  step: 1,

  // Step 1 — plan
  plan: null, // PLANS item or custom shape

  // Step 2 — repo
  repo: {
    url: '',
    branch: 'main',
    branchTouched: false, // user manually selected a branch
    isPrivate: false,
    username: '',
    token: '',
    subdirectory: '',
    // Detection results (populated by Step2Repo intelligence)
    repoStatus: 'idle', // idle | checking | public | inaccessible | unknown | error
    authTestStatus: 'idle', // idle | testing | success | error
    portAutoDetected: false,
    portSource: null, // null | 'auto' | 'config' | 'manual'
    detectedFramework: null,
    monorepo: null, // null | {type, projects: [{name, path}]}
    compatibilityStatus: 'idle', // idle | checking | compatible | warning | incompatible
    compatibilityMessage: '',
    configImportSource: '', // file path that was imported (e.g. 'flux.json')
    requiresRunCommand: false,
  },

  // Step 3 — config
  config: {
    appName: '',
    port: '3000',
    portTouched: false, // user manually edited the port
    billingPeriod: { months: 1, label: '1 month', discount: 0 },
    geolocation: [],
    extraEnvVars: [], // [{ key, value }]
    // New fields
    contactEmail: '',
    customDomain: '',
    pollingInterval: '86400', // default: 24 hours; 'disabled' to skip
    runtime: '',
    runtimeVersion: '',
    buildCommand: '',
    runCommand: '',
    installCommand: '',
    webhookSecret: '',
    apiKey: '',
    prPreviewEnabled: false,
    enterprise: false, // true = encrypt contacts+compose with RSA/AES
  },

  // Terms acceptance (required before Step 5)
  termsAccepted: false,

  // Generated once per wizard session
  ports: null, // [extPort, mgmtPort]

  // Step 4/5 — registration
  verifiedSpec: null,
  registration: {
    timestamp: null,
    signature: null,
    txid: null,
  },
  installLogs: [],
  installStatus: 'idle', // idle | running | success | error

  // Step 6 — payment
  payment: {
    method: null,   // 'stripe' | 'zelcore' | 'ssp'
    status: 'idle', // idle | pending | confirming | success | error
    priceUsd: null,
    priceFlux: null,
    paymentAddress: null,
    txid: null,
  },

  // Per-step errors
  errors: {},
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };

    case 'SET_PLAN':
      return { ...state, plan: action.payload };

    case 'SET_REPO':
      return {
        ...state,
        repo: { ...state.repo, ...action.payload },
      };

    case 'SET_CONFIG':
      return {
        ...state,
        config: { ...state.config, ...action.payload },
      };

    case 'SET_PORTS':
      return { ...state, ports: action.payload };

    case 'SET_VERIFIED_SPEC':
      return { ...state, verifiedSpec: action.payload };

    case 'SET_REGISTRATION':
      return {
        ...state,
        registration: { ...state.registration, ...action.payload },
      };

    case 'ADD_INSTALL_LOG':
      return { ...state, installLogs: [...state.installLogs, action.payload] };

    case 'SET_INSTALL_STATUS':
      return { ...state, installStatus: action.payload };

    case 'SET_PAYMENT':
      return {
        ...state,
        payment: { ...state.payment, ...action.payload },
      };

    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.step]: action.message },
      };

    case 'CLEAR_ERROR':
      // eslint-disable-next-line no-case-declarations
      const { [action.step]: _removed, ...rest } = state.errors;
      return { ...state, errors: rest };

    case 'SET_TERMS':
      return { ...state, termsAccepted: action.payload };

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

export function useDeployWizard() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goTo = useCallback((step) => dispatch({ type: 'SET_STEP', payload: step }), []);
  const next = useCallback(() => dispatch({ type: 'SET_STEP', payload: state.step + 1 }), [state.step]);
  const back = useCallback(() => dispatch({ type: 'SET_STEP', payload: state.step - 1 }), [state.step]);

  // ── Setters ─────────────────────────────────────────────────────────────────
  const setPlan = useCallback((plan) => dispatch({ type: 'SET_PLAN', payload: plan }), []);
  const setRepo = useCallback((data) => dispatch({ type: 'SET_REPO', payload: data }), []);
  const setConfig = useCallback((data) => dispatch({ type: 'SET_CONFIG', payload: data }), []);
  const setVerifiedSpec = useCallback((spec) => dispatch({ type: 'SET_VERIFIED_SPEC', payload: spec }), []);
  const setRegistration = useCallback((data) => dispatch({ type: 'SET_REGISTRATION', payload: data }), []);
  const addInstallLog = useCallback((log) => dispatch({ type: 'ADD_INSTALL_LOG', payload: log }), []);
  const setInstallStatus = useCallback((s) => dispatch({ type: 'SET_INSTALL_STATUS', payload: s }), []);
  const setPayment = useCallback((data) => dispatch({ type: 'SET_PAYMENT', payload: data }), []);
  const setError = useCallback((step, message) => dispatch({ type: 'SET_ERROR', step, message }), []);
  const clearError = useCallback((step) => dispatch({ type: 'CLEAR_ERROR', step }), []);
  const setTerms = useCallback((v) => dispatch({ type: 'SET_TERMS', payload: v }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  // ── Ensure ports are generated once ─────────────────────────────────────────
  const ensurePorts = useCallback(() => {
    if (!state.ports) {
      const ports = generatePortPair();
      dispatch({ type: 'SET_PORTS', payload: ports });
      return ports;
    }
    return state.ports;
  }, [state.ports]);

  return {
    state,
    dispatch,
    goTo,
    next,
    back,
    setPlan,
    setRepo,
    setConfig,
    setVerifiedSpec,
    setRegistration,
    addInstallLog,
    setInstallStatus,
    setPayment,
    setError,
    clearError,
    setTerms,
    reset,
    ensurePorts,
  };
}
