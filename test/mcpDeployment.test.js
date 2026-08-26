import test from 'node:test';
import assert from 'node:assert/strict';

import { DeploymentService } from '../server/orbit/deploymentService.js';

const session = {
  zelid: 't1Owner', signature: 'auth-signature', loginPhrase: 'login-phrase',
  firebaseToken: 'firebase-token', stickyBackend: 'https://1-2-3-4-16127.node.api.runonflux.io',
};

const input = {
  appName: 'agent-app',
  repository: { url: 'https://github.com/runonflux/sample', branch: 'main' },
  plan: 'standard',
  port: 3000,
  contactEmail: 'user@example.com',
  billingPeriod: 3,
};

function fixture({ testFailure = false, verifyFailure = false, testBody = null, testReadError = null, testStream = null } = {}) {
  const fluxCalls = [];
  const fetchCalls = [];
  let signedMessage = null;
  const flux = {
    async request(path, options = {}) {
      fluxCalls.push({ path, options });
      if (path.startsWith('/apps/appspecifications/')) return { status: 'error', data: null };
      if (path.startsWith('/apps/permanentmessages')) return { status: 'success', data: [] };
      if (path === '/apps/verifyappregistrationspecifications') {
        if (verifyFailure) throw new Error('verification unavailable');
        const spec = JSON.parse(options.body);
        return { status: 'success', data: { ...spec, normalizedByFlux: true } };
      }
      if (path === '/apps/calculatefiatandfluxprice') {
        const pricedSpec = JSON.parse(options.body);
        assert.equal(pricedSpec.owner, 't1Owner');
        return { status: 'success', data: { usd: 7.47, flux: 15 } };
      }
      throw new Error(`Unexpected Flux call ${path}`);
    },
  };
  const fetchImpl = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url).includes('storage.runonflux.io')) return new Response('{}', { status: 200 });
    if (String(url).endsWith('/apps/appregister')) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.signature, 'firebase-message-signature');
      assert.equal(payload.timestamp, Number(signedMessage.slice(-13)));
      return new Response(JSON.stringify({ status: 'success', data: 'registration-txid' }));
    }
    if (String(url).endsWith('/apps/testappinstall/registration-txid')) {
      if (testStream) return new Response(testStream, { status: 200 });
      if (testReadError) {
        return new Response(new ReadableStream({ pull(controller) { controller.error(testReadError); } }), { status: 200 });
      }
      const lines = testBody ?? (testFailure
        ? '{"status":"building","data":"installing"}\n{"status":"error","data":"build failed token=not-a-secret"}\n'
        : '{"status":"building","data":"installing"}\n{"status":"success","data":"ready"}\n');
      return new Response(lines, { status: 200 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const sessions = {
    async signMessage(_session, message) {
      signedMessage = message;
      return 'firebase-message-signature';
    },
  };
  const repositories = {
    async analyze(repository) {
      assert.equal(repository.url, input.repository.url);
      return {
        access: 'public',
        compatibility: { status: 'compatible', framework: 'Node.js', markerFile: 'package.json' },
      };
    },
  };
  const enterprise = { async encrypt(spec) { return spec; } };
  return {
    service: new DeploymentService({ fetchImpl, flux, sessions, repositories, enterprise, fluxApi: 'https://flux.test' }),
    fluxCalls, fetchCalls,
    getSignedMessage: () => signedMessage,
  };
}

test('deployment validation uses Flux normalization and authoritative pricing', async () => {
  const { service, fluxCalls } = fixture();
  const result = await service.validate(session, input);
  assert.equal(result.free, false);
  assert.deepEqual(result.price, { usd: 7.47, flux: 15 });
  assert.equal(result.specification.normalizedByFlux, true);
  assert.equal(result.canonicalRequest.billingPeriod.months, 3);
  assert.equal(result.specification.owner, 't1Owner');
  assert.ok(fluxCalls.some(({ path }) => path === '/apps/calculatefiatandfluxprice'));
});

test('caller-controlled custom-plan pricing cannot bypass authoritative payment', async () => {
  const { service, fluxCalls } = fixture();
  const result = await service.validate(session, {
    ...input,
    plan: {
      id: 'custom', cpu: 3, ram: 8000, hdd: 40, instances: 3,
      priceMonthly: 0,
    },
    billingPeriod: 3,
  });
  assert.equal(result.free, false);
  assert.deepEqual(result.price, { usd: 7.47, flux: 15 });
  assert.equal(result.canonicalRequest.plan.priceMonthly, null);
  assert.ok(fluxCalls.some(({ path }) => path === '/apps/calculatefiatandfluxprice'));
});

test('deployment validation rejects a caller-selected occupied app name before signing', async () => {
  const { service } = fixture();
  service.flux.request = async (path) => {
    if (path.startsWith('/apps/appspecifications/')) return { status: 'success', data: { name: 'agent-app' } };
    throw new Error('should not continue');
  };
  await assert.rejects(() => service.validate(session, input), /already registered/);
});

test('deployment requires explicit terms and performs exactly one signed registration', async () => {
  const { service, fetchCalls, getSignedMessage } = fixture();
  await assert.rejects(() => service.deploy(session, input), /Terms must be explicitly accepted/);
  assert.equal(fetchCalls.length, 0);

  const result = await service.deploy(session, { ...input, termsAccepted: true });
  assert.equal(result.txid, 'registration-txid');
  assert.equal(result.paymentRequired, true);
  assert.equal(result.testInstall.passed, true);
  assert.match(getSignedMessage(), /^fluxappregister1/);
  assert.equal(fetchCalls.filter(({ url }) => url.endsWith('/apps/appregister')).length, 1);
});

test('a failed test installation returns the registration handle and failure logs', async () => {
  const { service } = fixture({ testFailure: true });
  const result = await service.deploy(session, { ...input, termsAccepted: true });
  assert.equal(result.txid, 'registration-txid');
  assert.equal(result.testInstall.passed, false);
  assert.ok(result.testInstall.logs.some((line) => line.includes('build failed')));
});

test('empty, malformed, incomplete, and thrown test-install streams fail while preserving the registration txid', async () => {
  for (const options of [
    { testBody: '' },
    { testBody: 'not-json' },
    { testBody: '{"status":"building","data":"still building"}\n' },
    { testBody: '{"status":"success","data":"ready"}\n{"status":"building","data":"unexpected continuation"}\n' },
    { testBody: 'not-json\n{"status":"success","data":"ready"}\n' },
    { testReadError: new Error('simulated stream failure') },
  ]) {
    const { service } = fixture(options);
    const result = await service.deploy(session, { ...input, termsAccepted: true });
    assert.equal(result.txid, 'registration-txid');
    assert.equal(result.testInstall.passed, false);
  }
});

test('test-install byte and frame bounds fail safely, cancel oversized streams, and preserve the txid', async () => {
  let cancelled = false;
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(1_000_001)));
    },
    cancel() { cancelled = true; },
  });
  const oversizedResult = await fixture({ testStream: oversized }).service.deploy(session, { ...input, termsAccepted: true });
  assert.equal(oversizedResult.txid, 'registration-txid');
  assert.equal(oversizedResult.testInstall.passed, false);
  assert.equal(cancelled, true);
  assert.match(oversizedResult.testInstall.logs.at(-1), /byte limit/);

  const tooManyFrames = `${Array.from(
    { length: 2_001 },
    (_, index) => JSON.stringify({ status: 'building', data: `frame-${index}` }),
  ).join('\n')}\n{"status":"success","data":"ready"}\n`;
  const frameResult = await fixture({ testBody: tooManyFrames }).service.deploy(session, { ...input, termsAccepted: true });
  assert.equal(frameResult.txid, 'registration-txid');
  assert.equal(frameResult.testInstall.passed, false);
  assert.match(frameResult.testInstall.logs.at(-1), /frame limit/);
});

test('deploy follows the UI verification fallback but validation fails closed', async () => {
  const validating = fixture({ verifyFailure: true });
  await assert.rejects(() => validating.service.validate(session, input), /verification unavailable/);

  const deploying = fixture({ verifyFailure: true });
  const result = await deploying.service.deploy(session, { ...input, billingPeriod: 1, termsAccepted: true });
  assert.equal(result.txid, 'registration-txid');
  assert.equal(result.free, true);
});

test('private repository credentials are used for the spec but absent from validation output', async () => {
  const { service } = fixture();
  service.repositories.analyze = async () => ({
    access: 'private', compatibility: { status: 'compatible', markerFile: 'package.json' },
  });
  const result = await service.validate(session, {
    ...input,
    repository: { ...input.repository, private: true, username: 'git-user', token: 'private-git-token' },
    enterprise: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /private-git-token/);
  assert.equal(result.canonicalRequest.repository.token, undefined);
});
