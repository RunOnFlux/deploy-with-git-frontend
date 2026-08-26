import { DEFAULT_PAYMENT_BRIDGE_URL } from '../../config/defaults.js';
import { FluxSessionService } from '../flux/fluxSession.js';
import { FluxApiService } from '../flux/fluxApi.js';
import { EnterpriseCryptoService } from '../flux/enterpriseCrypto.js';
import { RepositoryService } from './repositoryService.js';
import { DeploymentService } from './deploymentService.js';
import { PaymentService } from './paymentService.js';
import { ManagementService } from './managementService.js';
import { UpdateService } from './updateService.js';

export class OrbitServices {
  constructor({
    fetchImpl = fetch,
    fluxApi = 'https://api.runonflux.io',
    fluxCoreApi = 'https://service.fluxcore.ai/api',
    paymentBridgeUrl = DEFAULT_PAYMENT_BRIDGE_URL,
    networkStatsUrl = 'https://stats.runonflux.io/fluxinfo?projection=geolocation,benchmark,flux',
    appUrl = 'https://orbit.runonflux.com',
  } = {}) {
    this.fetch = fetchImpl;
    this.paymentBridgeUrl = paymentBridgeUrl.replace(/\/$/, '');
    this.networkStatsUrl = networkStatsUrl;
    this.sessions = new FluxSessionService({ fetchImpl, fluxApi, fluxCoreApi });
    this.enterprise = new EnterpriseCryptoService({ fetchImpl, fluxApi });
    this.flux = new FluxApiService({ fetchImpl, fluxApi, enterpriseCrypto: this.enterprise });
    this.repositories = new RepositoryService();
    this.deployments = new DeploymentService({
      fetchImpl, flux: this.flux, sessions: this.sessions, enterprise: this.enterprise,
      repositories: this.repositories, fluxApi,
    });
    this.payments = new PaymentService({
      fetchImpl, paymentBridgeUrl: this.paymentBridgeUrl, deploymentService: this.deployments, flux: this.flux, appUrl,
    });
    this.management = new ManagementService({ fetchImpl, flux: this.flux });
    this.updates = new UpdateService({ fetchImpl, flux: this.flux, sessions: this.sessions, enterprise: this.enterprise, fluxApi });
  }

  async context(authInfo) {
    const firebaseToken = authInfo?.extra?.firebaseToken || authInfo?.token;
    const user = {
      uid: authInfo?.extra?.firebaseUid || authInfo?.clientId,
      email: authInfo?.extra?.email,
    };
    if (!firebaseToken || !user.uid) throw new Error('Authenticated Firebase context is unavailable');
    const session = await this.sessions.create(firebaseToken, user);
    return { authInfo, user, session };
  }

  async hasExistingApp(authInfo) {
    const { session } = await this.context(authInfo);
    const apps = await this.flux.listOwnedApps(session);
    return apps.length > 0;
  }

  analyzeRepository(_authInfo, input) { return this.repositories.analyze(input); }
  async listApps(authInfo) { const { session } = await this.context(authInfo); return this.flux.listOwnedApps(session); }
  async getApp(authInfo, appName) {
    const { session } = await this.context(authInfo);
    return this.flux.getOwnedSpec(session, appName).then((spec) => import('./core.js').then(({ sanitizeSpec }) => sanitizeSpec(spec)));
  }
  async getInstances(authInfo, appName) { const { session } = await this.context(authInfo); return this.flux.getLocations(session, appName); }
  async getDeploymentStatus(authInfo, appName, txid) {
    const { session } = await this.context(authInfo);
    return this.flux.getDeploymentStatus(session, appName, txid);
  }

  async getNetworkCapacity(_authInfo, filter = {}) {
    const response = await this.fetch(this.networkStatsUrl, { signal: AbortSignal.timeout(25_000) });
    const body = await response.json();
    if (!response.ok || body?.status !== 'success' || !Array.isArray(body.data)) throw new Error('Network capacity is unavailable');
    const cpu = Number(filter.cpu || 0);
    const ram = Number(filter.ram || 0);
    const hdd = Number(filter.hdd || 0);
    const enterprise = Boolean(filter.enterprise);
    const nodes = body.data.filter((node) => {
      const bench = node.benchmark?.bench;
      if (!bench) return false;
      if (enterprise && !node.flux?.arcaneVersion) return false;
      return bench.cores - 1 >= cpu && bench.ram - 2 >= ram && bench.ssd - 80 >= hdd;
    });
    const countries = new Set(nodes.map((node) => node.geolocation?.countryCode).filter(Boolean));
    const ips = new Set(nodes.map((node) => String(node.flux?.ip || '').split(':')[0]).filter(Boolean));
    return { matchingNodes: nodes.length, uniqueIps: ips.size, countries: countries.size };
  }

  async validateDeployment(authInfo, input) {
    const { session } = await this.context(authInfo);
    return this.deployments.validate(session, input);
  }

  async deployApp(authInfo, input) {
    const { session } = await this.context(authInfo);
    const deployment = await this.deployments.deploy(session, input);
    if (!input.createCheckout) return deployment;
    if (!deployment.paymentRequired) throw new Error('This deployment does not require payment');
    const planId = typeof input.plan === 'string' ? input.plan : input.plan.id;
    const months = Number(typeof input.billingPeriod === 'object' ? input.billingPeriod.months : input.billingPeriod || 1);
    try {
      const checkout = await this.payments.createRegistrationCheckout(session, { ...deployment, planId, months });
      return { ...deployment, checkout };
    } catch {
      return { ...deployment, checkout: { created: false, error: 'Stripe checkout could not be created; the Flux transaction remains registered' } };
    }
  }

  async createStripeCheckout(authInfo, input) {
    const { session } = await this.context(authInfo);
    return this.payments.createStripeCheckout(session, input);
  }

  async getLogs(authInfo, input) { const { session } = await this.context(authInfo); return this.management.logs(session, input); }
  async triggerBuild(authInfo, input) { const { session } = await this.context(authInfo); return this.management.triggerBuild(session, input); }
  async controlInstance(authInfo, input) { const { session } = await this.context(authInfo); return this.management.control(session, input); }
  async updateApp(authInfo, input) {
    const { session } = await this.context(authInfo);
    const update = await this.updates.update(session, input);
    if (!input.createCheckout) return update;
    if (!update.paymentRequired) throw new Error('This update does not require payment');
    try {
      const checkout = await this.payments.createUpdateCheckout(session, update);
      return { ...update, checkout };
    } catch {
      return { ...update, checkout: { created: false, error: 'Stripe checkout could not be created; the Flux update transaction remains registered' } };
    }
  }
  async renewApp(authInfo, input) {
    const { session } = await this.context(authInfo);
    const renewal = await this.updates.renew(session, input);
    if (!input.createCheckout) return renewal;
    try {
      const checkout = await this.payments.createRenewalCheckout(session, renewal);
      return { ...renewal, checkout };
    } catch {
      return { ...renewal, checkout: { created: false, error: 'Stripe checkout could not be created; the Flux renewal transaction remains registered' } };
    }
  }
}
