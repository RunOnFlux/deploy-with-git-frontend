import {
  ADDITIONAL_APP_PLAN,
  BILLING_PERIODS,
  PLANS,
  buildSpec,
  isValidPort,
  normalizeCustomPlan,
  redactSpecCredentials,
  supportsAdditionalAppPort,
  validateAppName,
} from '../../src/services/deployService.js';

const SECRET_KEY_PATTERN = /(token|password|secret|api[_-]?key|signature|loginphrase|authorization|credential|private[_-]?key)/i;
const SECRET_ENV_PATTERN = /(PASSWORD|PASSWD|PASSPHRASE|(?:^|_)PASS(?:_|$)|TOKEN|SECRET|API_?KEY|PRIVATE_?KEY|DATABASE_URL|MONGO_URL|REDIS_URL|CREDENTIAL)/i;

export const SERVER_PLANS = Object.freeze(PLANS.map((plan) => Object.freeze({ ...plan })));

export function resolvePlan(planInput, { hasExistingApp = false } = {}) {
  const id = typeof planInput === 'string' ? planInput : planInput?.id;
  const base = PLANS.find((plan) => plan.id === id);
  if (!base) throw new Error(`Unknown plan: ${id || 'missing'}`);
  if (id === 'free' && hasExistingApp) return { ...ADDITIONAL_APP_PLAN };
  if (id !== 'custom') return { ...base };
  // Pricing and descriptive metadata are server-owned. Only accept the custom
  // resource dimensions from callers so fields such as priceMonthly cannot
  // turn a paid registration into a free one.
  const custom = typeof planInput === 'object' && planInput ? planInput : {};
  return normalizeCustomPlan({
    ...base,
    cpu: custom.cpu,
    ram: custom.ram,
    hdd: custom.hdd,
    instances: custom.instances,
  });
}

export function normalizeBillingPeriod(input) {
  const months = Number(typeof input === 'object' ? input?.months : input ?? 1);
  const period = BILLING_PERIODS.find((candidate) => candidate.months === months);
  if (!period) throw new Error('Billing period must be 1, 3, 6, or 12 months');
  return { ...period };
}

export function validateDeploymentInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Deployment input is required');
  const nameError = validateAppName(input.appName);
  if (nameError) throw new Error(nameError);
  if (!/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//i.test(String(input.repository?.url || ''))) {
    throw new Error('Repository must be an HTTPS GitHub, GitLab, or Bitbucket URL');
  }
  if (!isValidPort(input.port)) throw new Error('A valid application port is required');
  if (input.additionalPort != null && input.additionalPort !== '') {
    if (!isValidPort(input.additionalPort)) throw new Error('Additional port is invalid');
    if (Number(input.additionalPort) === Number(input.port) || Number(input.additionalPort) === 9001) {
      throw new Error('Additional port must differ from the primary port and port 9001');
    }
  }
  if (!String(input.contactEmail || '').includes('@')) throw new Error('A valid contact email is required');
}

export function buildServerSpec({ input, owner, ports, hasExistingApp = false }) {
  validateDeploymentInput(input);
  const plan = resolvePlan(input.plan, { hasExistingApp });
  if (input.additionalPort && !supportsAdditionalAppPort(plan)) {
    throw new Error('The selected plan does not support a second application port');
  }
  const repo = {
    url: input.repository.url,
    branch: input.repository.branch || 'main',
    subdirectory: input.repository.subdirectory || '',
  };
  const config = {
    appName: input.appName,
    port: String(input.port),
    additionalPort: input.additionalPort == null ? '' : String(input.additionalPort),
    contactEmail: input.contactEmail,
    customDomain: input.customDomain || '',
    billingPeriod: normalizeBillingPeriod(input.billingPeriod),
    geolocation: input.geolocation || [],
    extraEnvVars: input.environment || [],
    persistentFolders: input.persistentFolders || [],
    pollingInterval: input.pollingInterval ?? '86400',
    runtime: input.runtime || '',
    runtimeVersion: input.runtimeVersion || '',
    buildCommand: input.buildCommand || '',
    runCommand: input.runCommand || '',
    installCommand: input.installCommand || '',
    prPreviewEnabled: Boolean(input.prPreviewEnabled),
    enterprise: Boolean(input.enterprise || input.repository.private),
    webhookSecret: input.webhookSecret || '',
    apiKey: input.apiKey || '',
    database: input.database,
    redis: input.redis,
  };
  return buildSpec({ owner, zelid: owner, contactsRef: input.contactsRef || null, plan, repo, config, ports });
}

export function redactSecrets(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return value
      .replace(/(https?:\/\/)([^/@:\s]+):([^/@\s]+)@/gi, '$1***:***@')
      .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
      .replace(/\b([A-Z][A-Z0-9_]*)=([^\s"']+)/gi, (match, key) =>
        SECRET_ENV_PATTERN.test(key) ? `${key}=[REDACTED]` : match)
      .replace(/([?&](?:access_?token|token|api_?key|key|signature|password)=)[^&#\s]+/gi, '$1[REDACTED]');
  }
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') {
        const equals = entry.indexOf('=');
        if (equals > 0 && SECRET_ENV_PATTERN.test(entry.slice(0, equals))) {
          return `${entry.slice(0, equals)}=[REDACTED]`;
        }
      }
      return redactSecrets(entry, seen);
    });
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSecrets(entry, seen),
  ]));
}

export function sanitizeSpec(spec) {
  const redacted = redactSpecCredentials(spec);
  return redactSecrets(redacted);
}

export function publicPlanList({ hasExistingApp = false } = {}) {
  return PLANS.map((plan) => {
    const resolved = plan.id === 'free' && hasExistingApp ? ADDITIONAL_APP_PLAN : plan;
    return {
      id: resolved.id,
      label: resolved.label,
      cpu: resolved.cpu,
      ramMb: resolved.ram,
      ramGb: resolved.ram == null ? null : resolved.ram / 1000,
      hdd: resolved.hdd,
      instances: resolved.instances,
      priceMonthly: resolved.priceMonthly,
      ...(resolved.isAdditionalApp ? { additionalApp: true } : {}),
    };
  });
}
