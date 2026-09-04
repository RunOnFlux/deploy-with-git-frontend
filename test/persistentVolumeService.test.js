import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOrbitContainerData,
  normalizePersistentPath,
  validatePersistentFolders,
} from '../src/services/persistentVolumeService.js';
import { ADDITIONAL_APP_PLAN, buildSpec, PLANS } from '../src/services/deployService.js';

test('Orbit retains its local app volume when no replicated folders are configured', () => {
  assert.equal(buildOrbitContainerData([]), '/app');
});

test('replicated folders use the Flux g primary and pipe-separated directory mount format', () => {
  const folders = [
    { name: 'uploads', path: '/uploads/' },
    { name: 'cache-data', path: '//var//cache//my-app' },
  ];
  assert.equal(normalizePersistentPath(folders[1].path), '/var/cache/my-app');
  assert.equal(
    buildOrbitContainerData(folders),
    'g:/app|m:uploads:/uploads|m:cache-data:/var/cache/my-app',
  );
});

test('persistent folder validation protects Orbit CI and container system paths', () => {
  for (const path of [
    '/', '/app', '/app/staging', '/app/production/current/uploads',
    '/opt', '/opt/flux-tools/node', '/usr/local/bin', '/etc/supervisord.conf',
    '/proc/self', '/home/appuser',
  ]) {
    const result = validatePersistentFolders([{ name: 'data', path }]);
    assert.equal(result.valid, false, `${path} must be rejected`);
  }
  assert.equal(validatePersistentFolders([{ name: 'data', path: '/data' }]).valid, true);
  assert.equal(validatePersistentFolders([{ name: 'uploads', path: '/var/lib/my-app' }]).valid, true);
});

test('persistent folder validation rejects parser delimiters, traversal, reserved names, duplicates, and overlaps', () => {
  const invalid = [
    [{ name: 'appdata', path: '/data' }],
    [{ name: 'bad/name', path: '/data' }],
    [{ name: 'data', path: 'relative' }],
    [{ name: 'data', path: '/safe/../escape' }],
    [{ name: 'data', path: '/safe|other' }],
    [{ name: 'same', path: '/one' }, { name: 'same', path: '/two' }],
    [{ name: 'one', path: '/data' }, { name: 'two', path: '/data/nested' }],
  ];
  invalid.forEach((folders) => assert.equal(validatePersistentFolders(folders).valid, false));
});

test('containerData enforces the Flux 200-character specification limit', () => {
  const result = validatePersistentFolders([
    { name: 'long-data', path: `/${'a'.repeat(190)}` },
  ]);
  assert.equal(result.valid, false);
  assert.match(result.error, /200/);
});

test('deployment specs include validated replicated folders on the Orbit component', () => {
  const spec = buildSpec({
    zelid: 't1Owner',
    contactsRef: null,
    plan: PLANS[1],
    repo: { url: 'https://github.com/org/repo', branch: 'main' },
    config: {
      appName: 'volume-app', port: '3000', billingPeriod: { months: 1 },
      persistentFolders: [{ name: 'uploads', path: '/uploads' }],
      extraEnvVars: [], geolocation: [],
    },
    ports: [31000, 32000],
  });
  assert.equal(spec.compose[0].containerData, 'g:/app|m:uploads:/uploads');
});

test('replicated folders cannot be deployed on a one-instance plan', () => {
  assert.throws(() => buildSpec({
    zelid: 't1Owner', contactsRef: null, plan: PLANS[0],
    repo: { url: 'https://github.com/org/repo', branch: 'main' },
    config: {
      appName: 'volume-app', port: '3000', billingPeriod: { months: 1 },
      persistentFolders: [{ name: 'uploads', path: '/uploads' }],
      extraEnvVars: [], geolocation: [],
    },
    ports: [31000, 32000],
  }), /at least 2 app instances/);
});

test('custom domains reject the free plan but remain available to the paid $0.99 plan', () => {
  const input = {
    zelid: 't1Owner', contactsRef: null,
    repo: { url: 'https://github.com/org/repo', branch: 'main' },
    config: {
      appName: 'domain-app', port: '3000', customDomain: 'app.example.com',
      billingPeriod: { months: 1 }, extraEnvVars: [], geolocation: [],
    },
    ports: [31000, 32000],
  };

  assert.throws(() => buildSpec({ ...input, plan: PLANS[0] }), /not available on the Free plan/);
  const paidSpec = buildSpec({ ...input, plan: ADDITIONAL_APP_PLAN });
  assert.equal(paidSpec.compose[0].domains[0], 'app.example.com');
});
