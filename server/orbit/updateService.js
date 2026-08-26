import { PLANS, buildDataToSign, getBlocksRemaining, validatePaidPrice, BLOCKS_PER_MONTH, MAX_SUBSCRIPTION_BLOCKS } from '../../src/services/deployService.js';
import { buildGeoSpec } from '../../src/services/geolocationSpec.js';
import { redactSecrets, sanitizeSpec } from './core.js';
import { qsZelidAuth } from './http.js';

const ORBIT_KEYS = new Set([
  'GIT_BRANCH', 'BRANCH', 'APP_PORT', 'PORT', 'POLLING_INTERVAL', 'ORBIT_CHECK_INTERVAL',
  'ORBIT_RUNTIME', 'ORBIT_RUNTIME_VERSION', 'BUILD_COMMAND', 'RUN_COMMAND', 'INSTALL_COMMAND', 'PR_PREVIEW_ENABLED',
]);
const HIDDEN_KEYS = new Set(['GIT_REPO_URL', 'WEBHOOK_SECRET', 'API_KEY', 'DATABASE_URL', 'MONGO_URL', 'REDIS_URL']);

function parseEnv(entries = []) {
  return entries.map((entry) => {
    const index = entry.indexOf('=');
    return { key: index < 0 ? entry : entry.slice(0, index), value: index < 0 ? '' : entry.slice(index + 1) };
  });
}

function fixedPlan(spec) {
  const app = spec.compose?.[0];
  return PLANS.find((plan) => plan.id !== 'custom' && plan.cpu === Number(app?.cpu) && plan.ram === Number(app?.ram) &&
    plan.hdd === Number(app?.hdd));
}

function clampResources(value, minInstances) {
  return {
    cpu: Math.min(15, Math.max(0.1, Number(value.cpu))),
    ram: Math.min(59000, Math.max(100, Math.round(Number(value.ram)))),
    hdd: Math.min(820, Math.max(1, Math.round(Number(value.hdd)))),
    instances: Math.min(3, Math.max(minInstances, Math.round(Number(value.instances)))),
  };
}

export class UpdateService {
  constructor({ fetchImpl = fetch, flux, sessions, enterprise, fluxApi = 'https://api.runonflux.io' }) {
    this.fetch = fetchImpl;
    this.flux = flux;
    this.sessions = sessions;
    this.enterprise = enterprise;
    this.fluxApi = fluxApi.replace(/\/$/, '');
  }

  async currentBlock() {
    const body = await this.flux.request('/daemon/getinfo');
    const block = Number(body?.data?.blocks);
    if (!Number.isFinite(block)) throw new Error('Current Flux block height is unavailable');
    return block;
  }

  async verify(spec) {
    const body = await this.flux.request('/apps/verifyappupdatespecifications', {
      method: 'POST', body: JSON.stringify(spec), timeout: 120_000,
    });
    if (body?.status !== 'success' || !body.data) throw new Error('Update specification verification failed');
    return body.data;
  }

  async price(spec) {
    const body = await this.flux.request('/apps/calculatefiatandfluxprice', { method: 'POST', body: JSON.stringify(sanitizeSpec(spec)) });
    if (body?.status !== 'success') throw new Error('Update price is unavailable');
    const usd = Number(body.data?.usd);
    const flux = Number(body.data?.flux);
    if (usd === 0 && flux === 0) return { usd: 0, flux: 0 };
    if (!(usd > 0) || !(flux > 0)) throw new Error('Update price is invalid');
    return validatePaidPrice(body.data);
  }

  async submit(session, spec) {
    const timestamp = Date.now();
    const message = buildDataToSign(spec, timestamp, true);
    const signature = await this.sessions.signMessage(session, message);
    const response = await this.fetch(`${this.fluxApi}/apps/appupdate`, {
      method: 'POST', headers: { zelidauth: qsZelidAuth(session) },
      body: JSON.stringify({ type: 'fluxappupdate', version: 1, appSpecification: spec, timestamp, signature }),
    });
    const body = await response.json();
    if (!response.ok || body?.status !== 'success' || !body.data) throw new Error('Flux app update failed');
    return body.data;
  }

  async update(session, { appName, changes }) {
    const spec = await this.flux.getOwnedSpec(session, appName);
    const block = await this.currentBlock();
    const remaining = getBlocksRemaining(spec.height, spec.expire, block);
    if (!(remaining > 0)) throw new Error('Subscription expiry could not be preserved');
    const app = spec.compose[0];
    const originalEnv = parseEnv(app.environmentParameters);
    const hidden = originalEnv.filter(({ key }) => HIDDEN_KEYS.has(key));
    const orbit = new Map(originalEnv.filter(({ key }) => ORBIT_KEYS.has(key)).map(({ key, value }) => [key, value]));
    for (const [key, value] of Object.entries(changes.orbitSettings || {})) {
      if (!ORBIT_KEYS.has(key)) throw new Error(`Unsupported Orbit setting: ${key}`);
      orbit.set(key, String(value));
    }
    const userEnv = (changes.environment || originalEnv.filter(({ key }) => !HIDDEN_KEYS.has(key) && !ORBIT_KEYS.has(key)))
      .filter(({ key }) => key && !HIDDEN_KEYS.has(key) && !ORBIT_KEYS.has(key));
    let resources = null;
    if (changes.resources) {
      // Add-ons raise the top-level instance count and append compose entries,
      // but they do not turn the primary component into a custom plan.
      if (fixedPlan(spec)) throw new Error('Fixed-plan resources cannot be modified');
      resources = clampResources(changes.resources, spec.compose.length > 1 ? 3 : 1);
    }
    let updated = {
      ...spec,
      expire: remaining,
      geolocation: changes.geolocation ? buildGeoSpec(changes.geolocation) : spec.geolocation,
      ...(resources ? { instances: resources.instances } : {}),
      compose: spec.compose.map((component, index) => index === 0 ? {
        ...component,
        ...(resources ? { cpu: resources.cpu, ram: resources.ram, hdd: resources.hdd } : {}),
        domains: changes.customDomain == null
          ? component.domains
          : [changes.customDomain, ...(component.domains || []).slice(1)],
        environmentParameters: [
          ...hidden, ...[...orbit].map(([key, value]) => ({ key, value })), ...userEnv,
        ].map(({ key, value }) => `${key}=${value}`),
      } : component),
    };
    if (spec._wasEnterprise || spec.enterprise) updated = await this.enterprise.encrypt(updated, session);
    let verified = await this.verify(updated);
    verified.expire = remaining;
    const price = await this.price(verified);
    const txid = await this.submit(session, verified);
    return redactSecrets({ appName, txid, price, paymentRequired: price.flux > 0, remainingBlocks: remaining });
  }

  async renew(session, { appName, extensionMonths }) {
    if (![1, 2, 3, 6, 12].includes(extensionMonths)) throw new Error('Unsupported renewal period');
    const spec = await this.flux.getOwnedSpec(session, appName);
    const block = await this.currentBlock();
    const remaining = Math.max(0, getBlocksRemaining(spec.height, spec.expire, block));
    const extension = extensionMonths * BLOCKS_PER_MONTH;
    if (remaining + extension > MAX_SUBSCRIPTION_BLOCKS) throw new Error('Renewal would exceed the one-year subscription cap');
    let renewal = {
      version: spec.version, name: spec.name, description: spec.description ?? '', owner: spec.owner,
      compose: spec.compose ?? [], instances: spec.instances, contacts: spec.contacts ?? [],
      geolocation: spec.geolocation ?? [], expire: remaining + extension, nodes: spec.nodes ?? [],
      staticip: spec.staticip ?? false, enterprise: spec.enterprise ?? '',
    };
    if (spec._wasEnterprise) renewal = await this.enterprise.encrypt(renewal, session);
    const verified = await this.verify(renewal);
    verified.expire = remaining + extension;
    const price = await this.price(verified);
    if (!(price.flux > 0)) throw new Error('Renewal returned an invalid zero price');
    const txid = await this.submit(session, verified);
    return redactSecrets({ appName, txid, price, paymentRequired: true, extensionMonths, expireBlocks: verified.expire });
  }
}
