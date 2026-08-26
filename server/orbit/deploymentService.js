import {
  buildDataToSign,
  buildPrivateRepoUrl,
  generatePort,
  validatePaidPrice,
} from '../../src/services/deployService.js';
import {
  buildServerSpec,
  normalizeBillingPeriod,
  redactSecrets,
  resolvePlan,
  sanitizeSpec,
  validateDeploymentInput,
} from './core.js';
import { qsZelidAuth } from './http.js';

function collectPorts(input) {
  const ports = [];
  const add = () => { const value = generatePort(ports); ports.push(value); return value; };
  add();
  if (input.additionalPort != null && input.additionalPort !== '') add();
  add();
  return ports;
}

function freeForRegistration(eligible, plan, period) {
  return eligible && (
    plan.priceMonthly === 0 || plan.id === 'free' || period.months === 1
  );
}

export class DeploymentService {
  constructor({ fetchImpl = fetch, flux, sessions, enterprise, repositories, fluxApi = 'https://api.runonflux.io' }) {
    this.fetch = fetchImpl;
    this.flux = flux;
    this.sessions = sessions;
    this.enterprise = enterprise;
    this.repositories = repositories;
    this.fluxApi = fluxApi.replace(/\/$/, '');
  }

  async eligibility(session) {
    const body = await this.flux.request(`/apps/permanentmessages?owner=${encodeURIComponent(session.zelid)}`, {
      session,
      headers: { 'x-apicache-bypass': 'true' },
    });
    if (body?.status !== 'success' || !Array.isArray(body.data)) throw new Error('Free-plan eligibility could not be verified');
    const registrations = body.data.filter((message) => message.type === 'fluxappregister');
    return { eligible: registrations.length === 0, hasExistingApp: registrations.length > 0 };
  }

  async assertNameAvailable(appName) {
    const body = await this.flux.request(`/apps/appspecifications/${encodeURIComponent(appName)}`);
    if (body?.status === 'success' && body.data?.name) throw new Error('App name is already registered');
  }

  async verifySpec(spec, { allowFallback = false } = {}) {
    try {
      const body = await this.flux.request('/apps/verifyappregistrationspecifications', {
        method: 'POST',
        body: JSON.stringify(spec),
        contentType: 'application/x-www-form-urlencoded',
        timeout: 60_000,
      });
      if (body?.status !== 'success' || !body.data) throw new Error(body?.data?.message || body?.data || 'Specification verification failed');
      return body.data;
    } catch (error) {
      if (allowFallback) return spec;
      throw error;
    }
  }

  async price(spec) {
    const body = await this.flux.request('/apps/calculatefiatandfluxprice', {
      method: 'POST',
      body: JSON.stringify(spec),
      timeout: 30_000,
    });
    if (body?.status !== 'success') throw new Error('Pricing could not be verified');
    return validatePaidPrice(body.data);
  }

  async prepare(session, input, { allowVerifyFallback = false, contactsRef = null, skipNameCheck = false } = {}) {
    validateDeploymentInput(input);
    const repository = await this.repositories.analyze(input.repository);
    if (repository.access === 'credentials_required') throw new Error('Private repository credentials are required');
    if (repository.compatibility?.status !== 'compatible') {
      throw new Error(repository.compatibility?.message || 'Repository is not compatible with Orbit');
    }
    if (!skipNameCheck) await this.assertNameAvailable(input.appName);
    const eligibility = await this.eligibility(session);
    const plan = resolvePlan(input.plan, eligibility);
    const period = normalizeBillingPeriod(input.billingPeriod);
    const ports = collectPorts(input);
    let repoUrl = input.repository.url;
    const isPrivate = repository.access === 'private' || Boolean(input.repository.private);
    if (isPrivate) {
      if (!input.repository.token) throw new Error('Private repository token is required');
      repoUrl = buildPrivateRepoUrl(repoUrl, input.repository.username || '', input.repository.token);
    }
    const specInput = {
      ...input,
      plan,
      billingPeriod: period,
      contactsRef,
      enterprise: Boolean(input.enterprise || isPrivate || input.database?.enabled || input.redis?.enabled),
      repository: { ...input.repository, url: input.repository.url, private: isPrivate },
    };
    let spec = buildServerSpec({ input: specInput, owner: session.zelid, ports, hasExistingApp: eligibility.hasExistingApp });
    if (isPrivate) {
      spec.compose[0].environmentParameters = spec.compose[0].environmentParameters.map((entry) =>
        entry.startsWith('GIT_REPO_URL=') ? `GIT_REPO_URL=${repoUrl}` : entry,
      );
    }
    spec = await this.verifySpec(spec, { allowFallback: allowVerifyFallback });
    if (specInput.enterprise) spec = await this.enterprise.encrypt(spec, session);
    const isFree = freeForRegistration(eligibility.eligible, plan, period);
    const price = isFree ? null : await this.price(sanitizeSpec(spec));
    return { repository, eligibility, plan, period, ports, spec, isFree, price };
  }

  async quoteForCheckout(session, input) {
    const prepared = await this.prepare(session, input, { skipNameCheck: true });
    if (prepared.isFree) throw new Error('This deployment does not require payment');
    return { price: prepared.price, plan: prepared.plan, period: prepared.period };
  }

  async validate(session, input) {
    const prepared = await this.prepare(session, input);
    const { token: _repositoryToken, ...publicRepository } = input.repository;
    return redactSecrets({
      canonicalRequest: {
        ...input,
        plan: prepared.plan,
        billingPeriod: prepared.period,
        repository: publicRepository,
      },
      repository: prepared.repository,
      eligibleForFree: prepared.eligibility.eligible,
      free: prepared.isFree,
      price: prepared.price,
      generatedPorts: prepared.ports,
      specification: sanitizeSpec(prepared.spec),
    });
  }

  async uploadContact(email) {
    const contactsId = crypto.randomUUID().replaceAll('-', '');
    const response = await this.fetch('https://storage.runonflux.io/v1/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactsid: contactsId, contacts: [email] }),
    });
    if (!response.ok) throw new Error('Contact upload failed');
    return `F_S_CONTACTS=https://storage.runonflux.io/v1/contacts/${contactsId}`;
  }

  async register(session, spec) {
    const timestamp = Date.now();
    const message = buildDataToSign(spec, timestamp);
    const signature = await this.sessions.signMessage(session, message);
    const payload = JSON.stringify({
      type: 'fluxappregister', version: 1, appSpecification: spec, timestamp, signature,
    });
    const response = await this.fetch(`${this.fluxApi}/apps/appregister`, {
      method: 'POST',
      headers: { zelidauth: qsZelidAuth(session) },
      body: payload,
    });
    const body = await response.json();
    if (!response.ok || body?.status !== 'success' || !body.data) throw new Error(body?.data?.message || body?.data || 'Registration failed');
    return { txid: body.data, timestamp, message };
  }

  async testInstall(session, txid, { maxLines = 200, maxBytes = 1_000_000, maxFrames = 2_000 } = {}) {
    const response = await this.fetch(`${this.fluxApi}/apps/testappinstall/${encodeURIComponent(txid)}`, {
      headers: { zelidauth: qsZelidAuth(session) },
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok || !response.body) return { passed: false, logs: [`Test installation failed: HTTP ${response.status}`] };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let bytesRead = 0;
    let framesRead = 0;
    const logs = [];
    let failed = false;
    let malformed = false;
    let limitExceeded = false;
    let lastStatus = '';

    const appendLog = (value) => {
      logs.push(String(value).slice(0, 2000));
      if (logs.length > maxLines) logs.shift();
    };
    const processFrame = (rawFrame) => {
      const frame = rawFrame.trim();
      if (!frame) return;
      framesRead++;
      if (framesRead > maxFrames) {
        limitExceeded = true;
        appendLog('Test installation output exceeded the frame limit');
        return;
      }
      let entry;
      try { entry = JSON.parse(frame); } catch {
        malformed = true;
        appendLog('Test installation returned a malformed protocol frame');
        return;
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.status !== 'string' || !entry.status.trim()) {
        malformed = true;
        appendLog('Test installation returned an invalid protocol frame');
        return;
      }
      lastStatus = entry.status.trim().toLowerCase();
      if (/error|fail/i.test(entry.status)) failed = true;
      appendLog(entry.data ?? entry.status);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        limitExceeded = true;
        appendLog('Test installation output exceeded the byte limit');
        await reader.cancel().catch(() => {});
        break;
      }
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      for (const line of lines) {
        processFrame(line);
        if (limitExceeded) break;
      }
      if (limitExceeded) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    if (!limitExceeded) {
      pending += decoder.decode();
      processFrame(pending);
    }
    const completed = /^(success|complete|completed|done)$/.test(lastStatus);
    return redactSecrets({
      passed: completed && !failed && !malformed && !limitExceeded,
      logs: logs.slice(-maxLines),
    });
  }

  async deploy(session, input) {
    if (input?.termsAccepted !== true) throw new Error('Terms must be explicitly accepted before deployment');
    let contactsRef = null;
    try { contactsRef = await this.uploadContact(input.contactEmail); } catch { contactsRef = null; }
    const prepared = await this.prepare(session, input, { allowVerifyFallback: true, contactsRef });
    const registration = await this.register(session, prepared.spec);
    let testResult;
    try { testResult = await this.testInstall(session, registration.txid); }
    catch { testResult = { passed: false, logs: [], error: 'Test installation did not complete' }; }
    return redactSecrets({
      appName: input.appName,
      txid: registration.txid,
      free: prepared.isFree,
      paymentRequired: !prepared.isFree,
      price: prepared.price,
      testInstall: testResult,
    });
  }
}
