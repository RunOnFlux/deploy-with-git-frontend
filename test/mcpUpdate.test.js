import test from 'node:test';
import assert from 'node:assert/strict';

import { BLOCKS_PER_MONTH, MAX_SUBSCRIPTION_BLOCKS } from '../src/services/deployService.js';
import { PaymentService } from '../server/orbit/paymentService.js';
import { OrbitServices } from '../server/orbit/services.js';
import { UpdateService } from '../server/orbit/updateService.js';

const session = {
  firebaseUid: 'firebase-user', zelid: 't1Owner', signature: 'auth-signature', loginPhrase: 'login-phrase',
};

function baseSpec(overrides = {}) {
  return {
    version: 8,
    name: 'agent-app',
    owner: 't1Owner',
    height: 1_000,
    expire: 200_000,
    instances: 1,
    contacts: [],
    geolocation: [],
    nodes: [],
    staticip: false,
    enterprise: '',
    compose: [{
      name: 'agent-app',
      repotag: 'runonflux/orbit:latest',
      cpu: 0.5,
      ram: 1000,
      hdd: 5,
      domains: ['old.example'],
      environmentParameters: [
        'GIT_REPO_URL=https://token:secret@example.test/repo.git',
        'WEBHOOK_SECRET=webhook-secret',
        'API_KEY=api-secret',
        'GIT_BRANCH=main',
        'USER_VALUE=before',
      ],
    }],
    ...overrides,
  };
}

function fixture({ spec = baseSpec(), currentBlock = 51_000, price = { usd: 0, flux: 0 }, signError = null } = {}) {
  let submitted;
  let verified;
  const flux = {
    async getOwnedSpec(_session, appName) {
      assert.equal(appName, 'agent-app');
      return structuredClone(spec);
    },
    async request(path, options = {}) {
      if (path === '/daemon/getinfo') return { data: { blocks: currentBlock } };
      if (path === '/apps/verifyappupdatespecifications') {
        verified = JSON.parse(options.body);
        return { status: 'success', data: structuredClone(verified) };
      }
      if (path === '/apps/calculatefiatandfluxprice') return { status: 'success', data: price };
      throw new Error(`Unexpected Flux path: ${path}`);
    },
  };
  const sessions = {
    async signMessage(_session, message) {
      if (signError) throw signError;
      return `signed:${message}`;
    },
  };
  const service = new UpdateService({
    flux,
    sessions,
    enterprise: { async encrypt(value) { return { ...value, enterprise: 'encrypted', compose: [], contacts: [] }; } },
    fluxApi: 'https://flux.test',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://flux.test/apps/appupdate');
      submitted = JSON.parse(options.body);
      return new Response(JSON.stringify({ status: 'success', data: 'update-txid-123' }));
    },
  });
  return { service, submitted: () => submitted, verified: () => verified };
}

test('maintenance update preserves remaining expiry, hidden settings, and add-on components without disclosure', async () => {
  const addon = { name: 'db', cpu: 1, ram: 2000, hdd: 5, environmentParameters: ['MONGO_PASSWORD=db-secret'] };
  const spec = baseSpec({
    instances: 3,
    compose: [{ ...baseSpec().compose[0], cpu: 1.1, ram: 2200, hdd: 12 }, addon],
  });
  const { service, submitted } = fixture({ spec });
  const result = await service.update(session, {
    appName: 'agent-app',
    changes: {
      customDomain: 'new.example',
      orbitSettings: { GIT_BRANCH: 'release' },
      environment: [{ key: 'USER_VALUE', value: 'after' }],
      geolocation: [{ code: 'EU_DE', type: 'allowed' }],
      resources: { cpu: 2, ram: 4000, hdd: 20, instances: 1 },
    },
  });
  const sent = submitted().appSpecification;
  assert.equal(sent.expire, 150_000, 'maintenance must retain only the blocks remaining at update time');
  assert.equal(sent.instances, 3, 'an add-on app must retain the three-instance minimum');
  assert.deepEqual(sent.geolocation, ['acEU_DE']);
  assert.equal(sent.compose.length, 2);
  assert.deepEqual(sent.compose[1], addon);
  assert.ok(sent.compose[0].environmentParameters.includes('WEBHOOK_SECRET=webhook-secret'));
  assert.ok(sent.compose[0].environmentParameters.includes('API_KEY=api-secret'));
  assert.ok(sent.compose[0].environmentParameters.includes('GIT_BRANCH=release'));
  assert.ok(sent.compose[0].environmentParameters.includes('USER_VALUE=after'));
  assert.doesNotMatch(JSON.stringify(result), /webhook-secret|api-secret|token:secret|MONGO_PASSWORD/);
  assert.equal(result.txid, 'update-txid-123');
  assert.equal(result.paymentRequired, false);
});

test('fixed-plan resources cannot be modified and rejection happens before signing/submission', async () => {
  let fetched = false;
  const { service } = fixture();
  service.fetch = async () => { fetched = true; throw new Error('must not submit'); };
  await assert.rejects(() => service.update(session, {
    appName: 'agent-app', changes: { resources: { cpu: 2, ram: 4000, hdd: 20, instances: 2 } },
  }), /Fixed-plan resources/);
  assert.equal(fetched, false);
});

test('fixed-plan resources remain immutable when database or Redis add-ons changed top-level instances', async () => {
  const addon = { name: 'database', cpu: 1, ram: 2000, hdd: 5, environmentParameters: ['POSTGRES_PASSWORD=secret'] };
  const standardWithAddon = baseSpec({
    instances: 3,
    compose: [{ ...baseSpec().compose[0], cpu: 1.5, ram: 4000, hdd: 15 }, addon],
  });
  const guarded = fixture({ spec: standardWithAddon });
  await assert.rejects(() => guarded.service.update(session, {
    appName: 'agent-app', changes: { resources: { cpu: 3, ram: 8000, hdd: 30, instances: 3 } },
  }), /Fixed-plan resources/);
  assert.equal(guarded.submitted(), undefined);
});

test('paid update uses authoritative price and signing failure prevents submission', async () => {
  const paid = fixture({ spec: baseSpec({ compose: [{ ...baseSpec().compose[0], cpu: 1.1 }] }), price: { usd: 1.25, flux: 2.5 } });
  const result = await paid.service.update(session, { appName: 'agent-app', changes: { customDomain: 'paid.example' } });
  assert.deepEqual(result.price, { usd: 1.25, flux: 2.5 });
  assert.equal(result.paymentRequired, true);

  const failed = fixture({ spec: baseSpec({ compose: [{ ...baseSpec().compose[0], cpu: 1.1 }] }), signError: new Error('simulated signer failure') });
  await assert.rejects(() => failed.service.update(session, { appName: 'agent-app', changes: {} }), /simulated signer failure/);
  assert.equal(failed.submitted(), undefined);
});

test('update pricing rejects negative, mixed, missing, and non-finite upstream values', async () => {
  for (const price of [
    { usd: -1, flux: -1 }, { usd: 0, flux: 1 }, { usd: 1, flux: 0 }, {}, { usd: 'NaN', flux: 2 },
  ]) {
    const invalid = fixture({ spec: baseSpec({ compose: [{ ...baseSpec().compose[0], cpu: 1.1 }] }), price });
    await assert.rejects(() => invalid.service.update(session, { appName: 'agent-app', changes: {} }), /price/i);
    assert.equal(invalid.submitted(), undefined);
  }
});

test('renewal extends remaining blocks, rejects the one-year cap, and never accepts a caller price', async () => {
  const currentBlock = 51_000;
  const { service, submitted } = fixture({ currentBlock, price: { usd: 2.49, flux: 5 } });
  const result = await service.renew(session, { appName: 'agent-app', extensionMonths: 2, price: { usd: 0.01, flux: 0.01 } });
  const expected = 150_000 + (2 * BLOCKS_PER_MONTH);
  assert.equal(submitted().appSpecification.expire, expected);
  assert.equal(result.expireBlocks, expected);
  assert.deepEqual(result.price, { usd: 2.49, flux: 5 });

  const capped = fixture({ spec: baseSpec({ height: currentBlock, expire: MAX_SUBSCRIPTION_BLOCKS }) });
  await assert.rejects(() => capped.service.renew(session, { appName: 'agent-app', extensionMonths: 1 }), /one-year/);
  assert.equal(capped.submitted(), undefined);
});

test('renewal checkout is created only from the server-side renewal result', async () => {
  let bridge;
  const payment = new PaymentService({
    paymentBridgeUrl: 'https://payments.test',
    deploymentService: {},
    appUrl: 'https://orbit.example',
    fetchImpl: async (url, options) => {
      bridge = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ status: 'success', data: 'https://checkout.stripe.com/renewal' }));
    },
  });
  const services = Object.create(OrbitServices.prototype);
  services.context = async () => ({ session });
  services.updates = {
    async renew() {
      return { appName: 'agent-app', txid: 'renewal-txid-123', extensionMonths: 3, price: { usd: 7.47, flux: 15 }, paymentRequired: true };
    },
  };
  services.payments = payment;
  const result = await services.renewApp({ token: 'firebase' }, {
    appName: 'agent-app', extensionMonths: 3, createCheckout: true, price: { usd: 0.01, flux: 0.01 },
  });
  assert.equal(result.checkout.checkoutUrl, 'https://checkout.stripe.com/renewal');
  assert.equal(bridge.body.details.price, 7.47);
  assert.equal(bridge.body.details.period, 3);
  assert.equal(bridge.options.headers['Idempotency-Key'], 'firebase-user:renewal:agent-app:renewal-txid-123');
  assert.equal(bridge.url, 'https://payments.test/api/v1/stripe/subscription/create');
  assert.doesNotMatch(JSON.stringify(result), /auth-signature|login-phrase/);
});

test('checkout failure after an update preserves the irreversible transaction handle', async () => {
  const services = Object.create(OrbitServices.prototype);
  services.context = async () => ({ session });
  services.updates = { async update() { return { appName: 'agent-app', txid: 'update-txid-123', price: { usd: 2, flux: 4 }, paymentRequired: true }; } };
  services.payments = { async createUpdateCheckout() { throw new Error('bridge timeout with API_KEY=secret'); } };
  const result = await services.updateApp({}, { appName: 'agent-app', changes: {}, createCheckout: true });
  assert.equal(result.txid, 'update-txid-123');
  assert.equal(result.checkout.created, false);
  assert.doesNotMatch(JSON.stringify(result), /API_KEY|secret|bridge timeout/);
});

test('Enterprise maintenance updates preserve plaintext only until re-encryption and submit only ciphertext', async () => {
  const addon = { name: 'mongo', repotag: 'mongo:8', environmentParameters: ['MONGO_INITDB_ROOT_PASSWORD=db-secret'] };
  const enterpriseSpec = baseSpec({
    _wasEnterprise: true, enterprise: null, instances: 3,
    compose: [{ ...baseSpec().compose[0], cpu: 1.1 }, addon],
  });
  const enterpriseFixture = fixture({ spec: enterpriseSpec });
  let plaintext;
  enterpriseFixture.service.enterprise.encrypt = async (spec) => {
    plaintext = structuredClone(spec);
    return { ...spec, compose: [], contacts: [], enterprise: 'ciphertext-only' };
  };
  const result = await enterpriseFixture.service.update(session, { appName: 'agent-app', changes: { customDomain: 'enterprise.example' } });
  assert.equal(plaintext.compose.length, 2);
  assert.ok(plaintext.compose[0].environmentParameters.includes('WEBHOOK_SECRET=webhook-secret'));
  assert.ok(plaintext.compose[1].environmentParameters.includes('MONGO_INITDB_ROOT_PASSWORD=db-secret'));
  assert.equal(enterpriseFixture.submitted().appSpecification.enterprise, 'ciphertext-only');
  assert.deepEqual(enterpriseFixture.submitted().appSpecification.compose, []);
  assert.doesNotMatch(JSON.stringify(result), /webhook-secret|db-secret|ciphertext-only/);
});
