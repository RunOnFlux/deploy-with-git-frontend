import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { INSTANCE_ACTIONS, ManagementService } from '../server/orbit/managementService.js';
import { OwnershipError } from '../server/flux/fluxApi.js';

const session = { zelid: 't1Owner', signature: 'auth-signature', loginPhrase: 'login-phrase' };
const webhookSecret = 'webhook-super-secret';
const apiKey = 'management-api-secret';

function ownedFlux({ locationIp = '8.8.8.8:16127' } = {}) {
  return {
    async getOwnedSpec(_session, appName) {
      assert.equal(appName, 'agent-app');
      return {
        name: appName, owner: 't1Owner',
        compose: [{
          ports: [31000, 32000],
          environmentParameters: [
            'GIT_BRANCH=main', `WEBHOOK_SECRET=${webhookSecret}`, `API_KEY=${apiKey}`,
          ],
        }],
      };
    },
    async getLocations() { return [{ ip: locationIp, runningSince: 1 }]; },
  };
}

test('every instance action is allowlisted and sent only to the owned Flux node', async () => {
  const requests = [];
  const service = new ManagementService({
    flux: ownedFlux(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response('{"status":"working","data":"step {one}"}{"status":"success","data":"done"}');
    },
  });
  for (const action of INSTANCE_ACTIONS) {
    const result = await service.control(session, { appName: 'agent-app', action, nodeIp: '8.8.8.8' });
    assert.equal(result.success, true);
    assert.equal(result.nodeIp, '8.8.8.8');
  }
  assert.equal(requests.length, INSTANCE_ACTIONS.length);
  assert.ok(requests.every(({ url }) => url.startsWith('https://8-8-8-8-16127.node.api.runonflux.io/apps/')));
  assert.ok(requests.every(({ options }) => options.headers.zelidauth.includes('zelid=t1Owner')));

  const exactLocationService = new ManagementService({
    flux: ownedFlux(), fetchImpl: async () => new Response('{"status":"success","data":"done"}'),
  });
  const exact = await exactLocationService.control(session, { appName: 'agent-app', action: 'restart', nodeIp: '8.8.8.8:16127' });
  assert.equal(exact.nodeIp, '8.8.8.8');
});

test('management rejects unsupported actions, unassigned nodes, and private network targets before fetch', async () => {
  let fetched = false;
  const service = new ManagementService({
    flux: ownedFlux(), fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); },
  });
  await assert.rejects(() => service.control(session, { appName: 'agent-app', action: 'shell' }), /Unsupported/);
  await assert.rejects(() => service.control(session, { appName: 'agent-app', action: 'restart', nodeIp: '9.9.9.9' }), /not assigned/);
  assert.equal(fetched, false);

  for (const reserved of ['100.64.0.1:16127', '198.18.0.1:16127', '203.0.113.1:16127']) {
    const reservedTarget = new ManagementService({ flux: ownedFlux({ locationIp: reserved }), fetchImpl: async () => { fetched = true; } });
    await assert.rejects(() => reservedTarget.control(session, { appName: 'agent-app', action: 'restart' }), /invalid node address/);
  }

  const privateTarget = new ManagementService({
    flux: ownedFlux({ locationIp: '127.0.0.1:16127' }),
    fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); },
  });
  await assert.rejects(() => privateTarget.control(session, { appName: 'agent-app', action: 'restart' }), /invalid node address/);
  assert.equal(fetched, false);
});

test('ownership failure prevents any node contact', async () => {
  let fetched = false;
  const flux = {
    async getOwnedSpec() { throw new OwnershipError(); },
    async getLocations() { throw new Error('locations must not be loaded'); },
  };
  const service = new ManagementService({ flux, fetchImpl: async () => { fetched = true; } });
  await assert.rejects(() => service.logs(session, { appName: 'foreign-app' }), OwnershipError);
  assert.equal(fetched, false);
});

test('build trigger signs the exact payload with stored credentials without returning them', async () => {
  let captured;
  const service = new ManagementService({
    flux: ownedFlux(),
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ status: 'ok' }));
    },
  });
  const result = await service.triggerBuild(session, { appName: 'agent-app', nodeIp: '8.8.8.8', hardRedeploy: true });
  assert.equal(captured.url, 'http://8.8.8.8:32000/webhook');
  assert.equal(captured.options.headers['X-API-Key'], apiKey);
  const expected = `sha256=${crypto.createHmac('sha256', webhookSecret).update(captured.options.body).digest('hex')}`;
  assert.equal(captured.options.headers['X-Hub-Signature-256'], expected);
  assert.equal(JSON.parse(captured.options.body).forced, true);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${webhookSecret}|${apiKey}`));
});

test('log results are bounded, strip ANSI codes, and redact secrets', async () => {
  const raw = ['old', '\u001b[31merror\u001b[0m', `API_KEY=${apiKey}`, 'new'].join('\n');
  const service = new ManagementService({
    flux: ownedFlux(),
    fetchImpl: async () => new Response(JSON.stringify({ status: 'success', data: raw })),
  });
  const result = await service.logs(session, { appName: 'agent-app', type: 'container', lines: 3 });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('\u001b'), false);
  assert.doesNotMatch(serialized, /management-api-secret/);
  assert.match(serialized, /\[REDACTED\]/);
});

test('log redaction covers database-specific password and token names', async () => {
  const raw = 'POSTGRES_PASSWORD=db-password\nMONGO_KEYFILE_PASSPHRASE=mongo-passphrase\nDB_INIT_PASS=init-pass\nSSL_PASSPHRASE=ssl-passphrase\nNPM_TOKEN=npm-token';
  const service = new ManagementService({
    flux: ownedFlux(), fetchImpl: async () => new Response(JSON.stringify({ status: 'success', data: raw })),
  });
  const result = await service.logs(session, { appName: 'agent-app', type: 'container', lines: 10 });
  assert.doesNotMatch(JSON.stringify(result), /db-password|mongo-passphrase|init-pass|ssl-passphrase|npm-token/);
  assert.equal(result.logs.filter((line) => line.includes('[REDACTED]')).length, 5);
});

test('object log arrays are line-bounded and malformed action streams are not reported successful', async () => {
  const logs = new ManagementService({
    flux: ownedFlux(), fetchImpl: async () => new Response(JSON.stringify({ logs: ['one', 'two', 'three', 'four'] })),
  });
  const result = await logs.logs(session, { appName: 'agent-app', type: 'container', lines: 2 });
  assert.deepEqual(result.logs, ['three', 'four']);

  for (const body of ['', 'not-json', '{"status":"working"}']) {
    const control = new ManagementService({ flux: ownedFlux(), fetchImpl: async () => new Response(body) });
    if (body.includes('working')) {
      const incomplete = await control.control(session, { appName: 'agent-app', action: 'restart' });
      assert.equal(incomplete.success, false);
    } else {
      await assert.rejects(() => control.control(session, { appName: 'agent-app', action: 'restart' }), /no valid progress/);
    }
  }
});

test('app and build log paths use the owned management port, API key, and bounded release lookup', async () => {
  const requests = [];
  const service = new ManagementService({
    flux: ownedFlux(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (String(url).endsWith('/status')) return new Response(JSON.stringify({ current_release: 'release-42' }));
      if (String(url).endsWith('/logs/release-42')) return new Response('old\nbuild-one\nbuild-two');
      if (String(url).includes('/applogs?')) return new Response(JSON.stringify({ logs: ['old', 'app-one', 'app-two'] }));
      throw new Error(`Unexpected log URL ${url}`);
    },
  });
  const app = await service.logs(session, { appName: 'agent-app', type: 'app', lines: 2 });
  const build = await service.logs(session, { appName: 'agent-app', type: 'build', lines: 2 });
  assert.deepEqual(app.logs, ['app-one', 'app-two']);
  assert.deepEqual(build.logs, ['build-one', 'build-two']);
  assert.ok(requests.every(({ url }) => String(url).startsWith('http://8.8.8.8:32000/')));
  assert.ok(requests.every(({ options }) => options.headers['X-API-Key'] === apiKey));
});
