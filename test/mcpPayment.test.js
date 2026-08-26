import test from 'node:test';
import assert from 'node:assert/strict';

import { PaymentService } from '../server/orbit/paymentService.js';

const session = {
  firebaseUid: 'firebase-user-1', zelid: 't1Owner', signature: 'flux-auth-signature', loginPhrase: 'flux-login-phrase',
};

function createFixture({ months = 3, price = { usd: 7.47, flux: 15 }, bridgeUrl = 'https://checkout.stripe.com/c/pay_123' } = {}) {
  let bridgeRequest;
  let transactionChecks = 0;
  const deploymentService = {
    async price(spec) {
      assert.equal(spec.name, 'agent-app');
      return price;
    },
  };
  const fetchImpl = async (url, options) => {
    bridgeRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ status: 'success', data: bridgeUrl }));
  };
  return {
    service: new PaymentService({
      fetchImpl,
      paymentBridgeUrl: 'https://payments.test',
      deploymentService,
      flux: {
        async getOwnedSpec(_session, appName) {
          assert.equal(appName, 'agent-app');
          return { name: appName, owner: 't1Owner', compose: [{ repotag: 'runonflux/orbit:latest' }] };
        },
        async assertTransaction(_session, transaction) {
          transactionChecks++;
          assert.deepEqual(transaction, { appName: 'agent-app', txid: 'registration-txid', type: 'fluxappregister' });
          return {
            name: 'agent-app', owner: 't1Owner', expire: months * 88_000,
            compose: [{ cpu: 1.5, ram: 4000, hdd: 15, repotag: 'runonflux/orbit:latest' }],
          };
        },
      },
      appUrl: 'https://orbit.example/path-that-must-not-be-used',
    }),
    request: () => bridgeRequest,
    transactionChecks: () => transactionChecks,
  };
}

test('subscription checkout verifies the Flux transaction and derives price, identity, redirects, and idempotency server-side', async () => {
  const { service, request, transactionChecks } = createFixture();
  const result = await service.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'registration-txid',
  });
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/c/pay_123');
  assert.equal(result.subscription, true);
  const sent = request();
  assert.equal(sent.url, 'https://payments.test/api/v1/stripe/subscription/create');
  assert.equal(sent.body.zelid, 't1Owner');
  assert.equal(sent.body.details.price, 7.47);
  assert.equal(sent.body.details.period, 3);
  assert.equal(sent.body.details.success_url, 'https://orbit.example/successcheckout');
  assert.equal(sent.body.details.cancel_url, 'https://orbit.example');
  assert.equal(sent.options.headers['Idempotency-Key'], 'firebase-user-1:registration:agent-app:registration-txid');
  assert.doesNotMatch(JSON.stringify(result), /flux-auth-signature|flux-login-phrase/);
  assert.equal(transactionChecks(), 1);
});

test('checkout rejects a valid-format foreign or unknown transaction before quoting or contacting Stripe', async () => {
  let quoted = false;
  let bridged = false;
  const service = new PaymentService({
    paymentBridgeUrl: 'https://payments.test',
    appUrl: 'https://orbit.example',
    deploymentService: { async price() { quoted = true; } },
    flux: {
      async getOwnedSpec() { const error = new Error('App not found or not owned'); error.code = 'not_found'; throw error; },
      async assertTransaction() { throw new Error('must not inspect a foreign transaction'); },
    },
    fetchImpl: async () => { bridged = true; throw new Error('must not contact bridge'); },
  });
  await assert.rejects(() => service.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'foreign-valid-txid',
  }), /not found|not owned/);
  assert.equal(quoted, false);
  assert.equal(bridged, false);
});

test('one-time checkout uses the one-time bridge endpoint', async () => {
  const { service, request } = createFixture({ months: 1, price: { usd: 2.49, flux: 5 } });
  await service.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'registration-txid',
  });
  assert.equal(request().url, 'https://payments.test/api/v1/stripe/checkout/create');
  assert.equal('period' in request().body.details, false);
});

test('checkout rejects invalid transactions, zero prices, and unsafe bridge URLs', async () => {
  const normal = createFixture().service;
  await assert.rejects(() => normal.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'short',
  }), /valid Flux registration/);

  const zero = createFixture({ price: { usd: 0, flux: 0 } }).service;
  await assert.rejects(() => zero.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'registration-txid',
  }), /checkout could not|positive|price/i);

  const unsafe = createFixture({ bridgeUrl: 'http://attacker.test/checkout' }).service;
  await assert.rejects(() => unsafe.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'registration-txid',
  }), /unsafe checkout URL/);
});

function createUpdateRecoveryFixture({ extensionBlocks = 0, price = { usd: 2.49, flux: 5 } } = {}) {
  let bridgeRequest;
  let contextChecks = 0;
  const previousHeight = 100_000;
  const targetHeight = 101_000;
  const previousExpire = 200_000;
  const remaining = previousHeight + previousExpire - targetHeight;
  const service = new PaymentService({
    paymentBridgeUrl: 'https://payments.test',
    appUrl: 'https://orbit.example',
    deploymentService: { async price(spec) { assert.equal(spec.name, 'agent-app'); return price; } },
    flux: {
      async assertTransaction() {},
      async assertUpdateTransactionContext(_session, input) {
        contextChecks++;
        assert.deepEqual(input, { appName: 'agent-app', txid: 'update-txid-123' });
        return {
          previousHeight, targetHeight,
          previousSpecification: { name: 'agent-app', owner: 't1Owner', expire: previousExpire },
          specification: { name: 'agent-app', owner: 't1Owner', expire: remaining + extensionBlocks },
        };
      },
    },
    fetchImpl: async (url, options) => {
      bridgeRequest = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ status: 'success', data: 'https://checkout.stripe.com/recovered' }));
    },
  });
  return { service, request: () => bridgeRequest, contextChecks: () => contextChecks };
}

test('standalone checkout recovers an owned paid maintenance update without caller pricing', async () => {
  const fixture = createUpdateRecoveryFixture();
  const result = await fixture.service.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'update-txid-123', operation: 'update', price: { usd: 0.01, flux: 0.01 },
  });
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/recovered');
  assert.equal(fixture.request().body.details.price, 2.49);
  assert.equal(fixture.request().url, 'https://payments.test/api/v1/stripe/checkout/create');
  assert.equal(fixture.request().options.headers['Idempotency-Key'], 'firebase-user-1:update:agent-app:update-txid-123');
  assert.equal(fixture.contextChecks(), 1);
});

test('standalone checkout derives a renewal period from owned transaction history', async () => {
  const fixture = createUpdateRecoveryFixture({ extensionBlocks: 3 * 88_000, price: { usd: 7.47, flux: 15 } });
  await fixture.service.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'update-txid-123', operation: 'renewal', extensionMonths: 1,
  });
  assert.equal(fixture.request().url, 'https://payments.test/api/v1/stripe/subscription/create');
  assert.equal(fixture.request().body.details.period, 3);
  assert.equal(fixture.request().body.details.price, 7.47);
  assert.equal(fixture.request().options.headers['Idempotency-Key'], 'firebase-user-1:renewal:agent-app:update-txid-123');
});

test('standalone update checkout rejects operation mismatch and unavailable ownership history before Stripe', async () => {
  const renewal = createUpdateRecoveryFixture({ extensionBlocks: 3 * 88_000 });
  await assert.rejects(() => renewal.service.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'update-txid-123', operation: 'update',
  }), /renewal, not a maintenance update/);
  assert.equal(renewal.request(), undefined);

  const update = createUpdateRecoveryFixture();
  await assert.rejects(() => update.service.createStripeCheckout(session, {
    appName: 'agent-app', txid: 'update-txid-123', operation: 'renewal',
  }), /renewal period/);
  assert.equal(update.request(), undefined);
});
