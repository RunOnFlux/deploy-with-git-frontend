import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildServerSpec,
  publicPlanList,
  redactSecrets,
  resolvePlan,
  sanitizeSpec,
} from '../server/orbit/core.js';

const baseInput = {
  appName: 'sample-app',
  repository: { url: 'https://github.com/runonflux/sample', branch: 'main' },
  plan: 'free',
  port: 8080,
  contactEmail: 'user@example.com',
  billingPeriod: 1,
};

test('server core loads without browser globals and preserves additional-app pricing', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  const plan = resolvePlan('free', { hasExistingApp: true });
  assert.equal(plan.priceMonthly, 0.99);
  assert.equal(plan.cpu, 0.5);
  assert.equal(publicPlanList({ hasExistingApp: true })[0].additionalApp, true);
  assert.equal(publicPlanList()[1].ramMb, 4000);
  assert.equal(publicPlanList()[1].ramGb, 4);
  assert.equal('ram' in publicPlanList()[1], false);
});

test('redaction covers every database add-on password convention and credential query strings', () => {
  const result = redactSecrets([
    'POSTGRES_SUPERUSER_PASSWORD=one', 'POSTGRES_REPLICATION_PASSWORD=two',
    'MONGO_INITDB_ROOT_PASSWORD=three', 'MONGO_KEYFILE_PASSPHRASE=four',
    'DB_INIT_PASS=five', 'REDIS_PASSWORD=six', 'SSL_PASSPHRASE=seven',
    'CALLBACK=https://example.test/path?access_token=eight&mode=ok',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /one|two|three|four|five|six|seven|eight/);
  assert.ok(result.every((entry) => entry.includes('[REDACTED]')));
});

test('buildServerSpec creates the same Orbit spec shape with injected ports', () => {
  const spec = buildServerSpec({ input: baseInput, owner: 't1Owner', ports: [31000, 32000] });
  assert.equal(spec.owner, 't1Owner');
  assert.equal(spec.name, 'sample-app');
  assert.equal(spec.compose[0].repotag, 'runonflux/orbit:latest');
  assert.deepEqual(spec.compose[0].ports, [31000, 32000]);
  assert.deepEqual(spec.compose[0].containerPorts, [8080, 9001]);
  assert.ok(spec.compose[0].environmentParameters.includes('GIT_BRANCH=main'));
});

test('buildServerSpec maps MCP persistent folders through the shared volume validation', () => {
  const spec = buildServerSpec({
    input: {
      ...baseInput,
      plan: 'standard',
      persistentFolders: [
        { name: 'uploads', path: '/uploads' },
        { name: 'assets', path: '/data/assets' },
      ],
    },
    owner: 't1Owner',
    ports: [31000, 32000],
  });
  assert.equal(spec.compose[0].containerData, 'g:/app|m:uploads:/uploads|m:assets:/data/assets');
});

test('buildServerSpec rejects invalid additional ports on the free profile', () => {
  assert.throws(
    () => buildServerSpec({ input: { ...baseInput, additionalPort: 8081 }, owner: 't1Owner', ports: [31000, 32000, 33000] }),
    /does not support a second/,
  );
});

test('MCP custom domains distinguish free apps from paid $0.99 additional apps', () => {
  const input = { ...baseInput, customDomain: 'app.example.com' };
  assert.throws(
    () => buildServerSpec({ input, owner: 't1Owner', ports: [31000, 32000] }),
    /not available on the Free plan/,
  );
  const paidSpec = buildServerSpec({
    input,
    owner: 't1Owner',
    ports: [31000, 32000],
    hasExistingApp: true,
  });
  assert.equal(paidSpec.compose[0].domains[0], 'app.example.com');
});

test('redaction removes structured and embedded credentials without altering public fields', () => {
  const input = {
    name: 'sample-app',
    token: 'github-secret',
    nested: {
      authorization: 'Bearer abc.def.ghi',
      url: 'https://person:private-token@github.com/org/repo',
      environmentParameters: ['APP_PORT=8080', 'API_KEY=management-secret', 'DATABASE_URL=postgres://user:pass@db/app'],
    },
  };
  const output = redactSecrets(input);
  assert.equal(output.name, 'sample-app');
  assert.equal(output.token, '[REDACTED]');
  assert.equal(output.nested.authorization, '[REDACTED]');
  assert.equal(output.nested.url, 'https://***:***@github.com/org/repo');
  assert.deepEqual(output.nested.environmentParameters, ['APP_PORT=8080', 'API_KEY=[REDACTED]', 'DATABASE_URL=[REDACTED]']);
  assert.doesNotMatch(JSON.stringify(output), /github-secret|private-token|management-secret|user:pass/);
});

test('sanitizeSpec redacts credentials embedded in an Orbit repository URL', () => {
  const spec = buildServerSpec({
    input: {
      ...baseInput,
      plan: 'standard',
      webhookSecret: 'hook-secret',
    },
    owner: 't1Owner',
    ports: [31000, 32000],
  });
  spec.compose[0].environmentParameters = spec.compose[0].environmentParameters.map((entry) =>
    entry.startsWith('GIT_REPO_URL=')
      ? 'GIT_REPO_URL=https://git-user:git-token@github.com/runonflux/private'
      : entry,
  );
  const sanitized = sanitizeSpec(spec);
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /git-token|hook-secret/);
  assert.match(serialized, /sample-app/);
});

test('server spec composes custom database and Redis add-ons with geo and command settings', () => {
  const spec = buildServerSpec({
    owner: 't1Owner', ports: [31000, 32000],
    input: {
      ...baseInput,
      plan: { id: 'custom', cpu: 2, ram: 4000, hdd: 20, instances: 1 },
      billingPeriod: 3,
      geolocation: [{ code: 'EU_DE', type: 'allowed' }, { code: 'NA', type: 'forbidden' }],
      buildCommand: 'npm run build', runCommand: 'npm start', installCommand: 'npm ci',
      database: {
        enabled: true, type: 'postgres', componentName: 'postgres', password: 'db-secret', dbName: 'app',
        replicationPassword: 'replication-secret', sslPassphrase: 'ssl-secret', resources: { cpu: 1, ram: 2000, hdd: 5 },
      },
      redis: { enabled: true, componentName: 'redis', password: 'redis-secret', sslPassphrase: 'redis-ssl-secret', resources: { cpu: 0.5, ram: 500, hdd: 1 } },
    },
  });
  assert.equal(spec.compose.length, 3);
  assert.equal(spec.instances, 3);
  assert.deepEqual(spec.geolocation, ['acEU_DE', 'a!cNA']);
  assert.equal(spec.expire, 3 * 88_000);
  assert.ok(spec.compose[0].environmentParameters.includes('BUILD_COMMAND=npm run build'));
  assert.ok(spec.compose[0].environmentParameters.some((entry) => entry.startsWith('DATABASE_URL=')));
  assert.ok(spec.compose[0].environmentParameters.some((entry) => entry.startsWith('REDIS_URL=')));
});
