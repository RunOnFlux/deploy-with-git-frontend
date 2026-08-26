import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

import { FluxApiService, OwnershipError } from '../server/flux/fluxApi.js';
import { EnterpriseCryptoService } from '../server/flux/enterpriseCrypto.js';
import { RepositoryService } from '../server/orbit/repositoryService.js';

const session = {
  zelid: 't1Owner', signature: 'session-signature', loginPhrase: 'session-phrase',
};

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

test('Flux read service returns only owned Orbit apps and redacts repository credentials', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /owner=t1Owner/);
    return jsonResponse({ status: 'success', data: [
      {
        name: 'owned-orbit', owner: 't1Owner', version: 8, compose: [{
          name: 'cloudgit', repotag: 'runonflux/orbit:latest', cpu: 1, ram: 1000, hdd: 5,
          environmentParameters: ['GIT_REPO_URL=https://user:secret@github.com/org/repo', 'APP_PORT=3000'],
        }],
      },
      { name: 'foreign-orbit', owner: 't1Other', version: 8, compose: [{ repotag: 'runonflux/orbit:latest' }] },
      { name: 'owned-other-image', owner: 't1Owner', version: 8, compose: [{ repotag: 'nginx:latest' }] },
    ] });
  };
  const service = new FluxApiService({ fetchImpl, fluxApi: 'https://flux.test' });
  const apps = await service.listOwnedApps(session);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].name, 'owned-orbit');
  assert.doesNotMatch(JSON.stringify(apps), /user:secret/);
});

test('ownership is enforced before app locations are returned', async () => {
  let locationCalled = false;
  const fetchImpl = async (url) => {
    if (url.includes('/appspecifications/')) {
      return jsonResponse({ status: 'success', data: { name: 'foreign', owner: 't1Other', compose: [] } });
    }
    locationCalled = true;
    return jsonResponse({ status: 'success', data: [{ ip: '1.2.3.4' }] });
  };
  const service = new FluxApiService({ fetchImpl, fluxApi: 'https://flux.test' });
  await assert.rejects(() => service.getLocations(session, 'foreign'), OwnershipError);
  assert.equal(locationCalled, false);
});

test('owned non-Orbit apps are excluded and cannot expose locations or destructive targets', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes('globalappsspecifications')) {
      return jsonResponse({ status: 'success', data: [{
        name: 'foreign-stack', owner: 't1Owner', version: 8,
        compose: [{ repotag: 'postgres:17', environmentParameters: ['POSTGRES_PASSWORD=secret'] }],
      }] });
    }
    if (String(url).endsWith('/apps/appspecifications/foreign-stack')) {
      return jsonResponse({ status: 'success', data: {
        name: 'foreign-stack', owner: 't1Owner', version: 8,
        compose: [{ repotag: 'postgres:17', environmentParameters: ['POSTGRES_PASSWORD=secret'] }],
      } });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const service = new FluxApiService({ fetchImpl, fluxApi: 'https://flux.test' });
  assert.deepEqual(await service.listOwnedApps(session), []);
  await assert.rejects(() => service.getLocations(session, 'foreign-stack'), /not found|not owned/i);
  assert.equal(requests.some((url) => url.includes('/apps/location/')), false);
});

test('deployment status is derived from owned specification and live locations', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/appspecifications/agent-app')) {
      return jsonResponse({ status: 'success', data: { name: 'agent-app', owner: 't1Owner', hash: 'registration-txid', compose: [{ repotag: 'runonflux/orbit:latest' }] } });
    }
    if (url.includes('/apps/location/agent-app')) {
      return jsonResponse({ status: 'success', data: [
        { ip: '1.2.3.4', runningSince: 123 },
        { ip: '2.3.4.5', runningSince: null },
      ] });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const service = new FluxApiService({ fetchImpl, fluxApi: 'https://flux.test' });
  const status = await service.getDeploymentStatus(session, 'agent-app', 'registration-txid');
  assert.deepEqual(status, {
    appName: 'agent-app', txid: 'registration-txid', phase: 'deployed',
    instances: 2, runningInstances: 1, specificationHash: 'registration-txid',
  });
});

test('deployment status does not report an old live app as the requested transaction', async () => {
  let locationsCalled = false;
  const fetchImpl = async (url) => {
    if (url.includes('/appspecifications/agent-app')) {
      return jsonResponse({ status: 'success', data: {
        name: 'agent-app', owner: 't1Owner', hash: 'old-transaction', compose: [{ repotag: 'runonflux/orbit:latest' }],
      } });
    }
    locationsCalled = true;
    return jsonResponse({ status: 'success', data: [{ ip: '1.2.3.4', runningSince: 123 }] });
  };
  const service = new FluxApiService({ fetchImpl, fluxApi: 'https://flux.test' });
  const status = await service.getDeploymentStatus(session, 'agent-app', 'new-transaction');
  assert.equal(status.phase, 'pending_blockchain');
  assert.equal(status.specificationHash, 'old-transaction');
  assert.equal(locationsCalled, false);
});

test('deployment status reports pending only for a registration owned by the authenticated identity', async () => {
  const pending = new FluxApiService({
    fluxApi: 'https://flux.test',
    fetchImpl: async (url) => {
      if (String(url).includes('/appspecifications/agent-app')) return jsonResponse({ status: 'error', data: null });
      if (String(url).includes('/permanentmessages')) return jsonResponse({ status: 'success', data: [{
        type: 'fluxappregister', hash: 'owned-pending-tx',
        appSpecification: { name: 'agent-app', owner: 't1Owner', compose: [{ repotag: 'runonflux/orbit:latest' }] },
      }] });
      throw new Error(`Unexpected request ${url}`);
    },
  });
  assert.deepEqual(await pending.getDeploymentStatus(session, 'agent-app', 'owned-pending-tx'), {
    appName: 'agent-app', txid: 'owned-pending-tx', phase: 'pending_blockchain',
  });

  await assert.rejects(() => pending.getDeploymentStatus(session, 'agent-app', 'foreign-pending-tx'), OwnershipError);
  await assert.rejects(() => pending.getDeploymentStatus(session, 'agent-app'), OwnershipError);
});

test('update transaction context selects the immediately preceding owned on-chain app transaction', async () => {
  const messages = [
    { type: 'fluxappregister', hash: 'register-tx', height: 100, appSpecification: { name: 'agent-app', owner: 't1Owner', expire: 88_000 } },
    { type: 'fluxappupdate', hash: 'prior-update', height: 150, appSpecification: { name: 'agent-app', owner: 't1Owner', expire: 87_950 } },
    { type: 'fluxappupdate', hash: 'target-update', height: 200, appSpecification: { name: 'agent-app', owner: 't1Owner', expire: 87_900 } },
    { type: 'fluxappupdate', hash: 'foreign-update', height: 199, appSpecification: { name: 'agent-app', owner: 't1Other', expire: 999_999 } },
  ];
  const service = new FluxApiService({
    fluxApi: 'https://flux.test',
    fetchImpl: async (url) => {
      if (String(url).includes('/appspecifications/agent-app')) return jsonResponse({ status: 'success', data: {
        name: 'agent-app', owner: 't1Owner', compose: [{ repotag: 'runonflux/orbit:latest' }],
      } });
      if (String(url).includes('/permanentmessages')) return jsonResponse({ status: 'success', data: messages });
      throw new Error(`Unexpected request ${url}`);
    },
  });
  const context = await service.assertUpdateTransactionContext(session, { appName: 'agent-app', txid: 'target-update' });
  assert.equal(context.targetHeight, 200);
  assert.equal(context.previousHeight, 150);
  assert.equal(context.previousSpecification.expire, 87_950);
  await assert.rejects(() => service.assertUpdateTransactionContext(session, {
    appName: 'agent-app', txid: 'foreign-update',
  }), OwnershipError);
});

test('Enterprise app decryption performs a real RSA/AES round trip and remains ownership checked', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const encryptedFields = {
    contacts: ['F_S_CONTACTS=https://storage.test/contact'],
    compose: [{ name: 'cloudgit', repotag: 'runonflux/orbit:latest', environmentParameters: ['API_KEY=private-key'] }],
  };
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/apps/appspecifications/enterprise-app')) {
      return jsonResponse({ status: 'success', data: { name: 'enterprise-app', owner: 't1Owner', version: 8, enterprise: 'chain-blob', compose: [] } });
    }
    if (url.endsWith('/apps/apporiginalowner/enterprise-app')) {
      return jsonResponse({ status: 'success', data: 't1Owner' });
    }
    if (url.endsWith('/apps/getpublickey')) {
      return jsonResponse({ status: 'success', data: publicDer });
    }
    if (url.endsWith('/apps/appspecifications/enterprise-app/true')) {
      const wrapped = Buffer.from(options.headers['enterprise-key'], 'base64');
      const aesBase64 = crypto.privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        wrapped,
      ).toString();
      const aesKey = Buffer.from(aesBase64, 'base64');
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, nonce);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(encryptedFields)), cipher.final()]);
      const result = Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]).toString('base64');
      return jsonResponse({ status: 'success', data: { enterprise: result } });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const enterprise = new EnterpriseCryptoService({ fetchImpl, fluxApi: 'https://flux.test' });
  const service = new FluxApiService({ fetchImpl, fluxApi: 'https://flux.test', enterpriseCrypto: enterprise });
  const spec = await service.getOwnedSpec(session, 'enterprise-app');
  assert.equal(spec.compose[0].repotag, 'runonflux/orbit:latest');
  assert.equal(spec.compose[0].environmentParameters[0], 'API_KEY=private-key');
  assert.equal(spec._wasEnterprise, true);
});

test('repository analyzer uses authenticated GitLab tree data to identify a single HTML file', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const href = String(url);
    requests.push({ href, options });
    if (href.includes('/api/v4/projects/group%2Fsingle-page') && !href.includes('/repository/')) {
      if (!options.headers?.['PRIVATE-TOKEN']) return new Response('', { status: 404 });
      return jsonResponse({ id: 1, default_branch: 'main' });
    }
    if (href.includes('/repository/tree')) {
      if (href.includes('per_page=1')) return jsonResponse([{ name: 'landing.html', type: 'blob' }]);
      if (href.includes('per_page=100')) return jsonResponse([{ name: 'landing.html', type: 'blob' }]);
      return jsonResponse([{ name: 'landing.html', type: 'blob' }]);
    }
    if (href.includes('/repository/branches')) return jsonResponse([{ name: 'main', default: true }]);
    return new Response('', { status: 404 });
  });
  const service = new RepositoryService();
  const result = await service.analyze({
    url: 'https://gitlab.com/group/single-page', token: 'gitlab-private-token', branch: 'main',
  });
  assert.equal(result.access, 'private');
  assert.equal(result.compatibility.framework, 'Static HTML');
  assert.equal(result.compatibility.markerFile, 'landing.html');
  assert.doesNotMatch(JSON.stringify(result), /gitlab-private-token/);
  assert.ok(requests.some(({ options }) => options.headers?.['PRIVATE-TOKEN'] === 'gitlab-private-token'));
});

for (const [path, marker, framework] of [
  ['dart', 'pubspec.yaml', 'Dart'],
  ['elixir', 'mix.exs', 'Elixir'],
  ['erlang', 'rebar.config', 'Erlang'],
]) {
  test(`repository analyzer identifies ${framework}`, async (t) => {
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
      const href = String(url);
      if (href === 'https://api.github.com/repos/runonflux/samples') {
        return jsonResponse({ default_branch: 'main' });
      }
      if (href.includes('/branches')) return jsonResponse([{ name: 'main', protected: false }]);
      if (options.method === 'HEAD') return new Response('', { status: href.endsWith(`/${path}/${marker}`) ? 200 : 404 });
      if (href.includes('/contents')) return jsonResponse([]);
      return new Response('', { status: 404 });
    });
    const result = await new RepositoryService().analyze({
      url: 'https://github.com/runonflux/samples', branch: 'main', subdirectory: path,
    });
    assert.equal(result.compatibility.framework, framework);
    assert.equal(result.compatibility.markerFile, marker);
  });
}
