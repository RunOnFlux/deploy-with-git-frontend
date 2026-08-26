import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Client, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client';

import { createOrbitMcpRouter } from '../server/mcp/router.js';

async function withServer(run, serviceOverrides = {}) {
  const verifier = {
    async verifyAccessToken(token) {
      if (token !== 'valid-firebase-token') {
        const error = new Error('Invalid authentication token');
        error.status = 401;
        error.code = 'invalid_token';
        throw error;
      }
      return {
        token,
        clientId: 'firebase-user-1',
        scopes: ['orbit:read', 'orbit:write'],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: { firebaseUid: 'firebase-user-1', email: 'user@example.com', firebaseToken: token },
      };
    },
  };
  const app = express();
  const services = {
    hasExistingApp: async () => true,
    analyzeRepository: async (_auth, input) => ({ analyzed: input.url }),
    listApps: async () => [], getApp: async () => ({}), getInstances: async () => [],
    getDeploymentStatus: async () => ({}), getNetworkCapacity: async () => ({}),
    validateDeployment: async () => ({}), deployApp: async () => ({}), createStripeCheckout: async () => ({}),
    getLogs: async () => ({}), triggerBuild: async () => ({}), controlInstance: async () => ({}),
    updateApp: async (_auth, input) => ({ operation: 'update', appName: input.appName }),
    renewApp: async () => ({}),
    ...serviceOverrides,
  };
  app.use('/mcp', createOrbitMcpRouter({
    tokenVerifier: verifier,
    services,
    version: 'test',
    allowedOrigins: ['https://orbit.example'],
  }));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => listener.once('listening', resolve));
  const address = listener.address();
  try {
    await run(new URL(`http://127.0.0.1:${address.port}/mcp`));
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
}

test('official MCP client discovers and calls Orbit tools over stateless HTTP', async () => {
  await withServer(async (url) => {
    const transport = new StreamableHTTPClientTransport(url, {
      authProvider: { token: async () => 'valid-firebase-token' },
    });
    const client = new Client({ name: 'orbit-test', version: '1.0.0' });
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
      'analyze_repository', 'control_instance', 'create_stripe_checkout', 'deploy_app', 'get_app', 'get_deployment_status',
      'get_instances', 'get_logs', 'get_network_capacity', 'list_apps', 'list_plans', 'renew_app', 'trigger_build',
      'update_app', 'validate_deployment',
    ]);
    const planTool = listed.tools.find((tool) => tool.name === 'list_plans');
    assert.ok(planTool);
    assert.equal(planTool.annotations.readOnlyHint, true);
    const result = await client.callTool({ name: 'list_plans', arguments: {} });
    assert.equal(result.structuredContent.plans[0].priceMonthly, 0.99);
    assert.equal(transport.sessionId, undefined);
    const updateTool = listed.tools.find((tool) => tool.name === 'update_app');
    const controlTool = listed.tools.find((tool) => tool.name === 'control_instance');
    assert.equal(updateTool.annotations.readOnlyHint, false);
    assert.equal(updateTool.annotations.destructiveHint, true);
    assert.equal(controlTool.annotations.destructiveHint, true);
    const update = await client.callTool({ name: 'update_app', arguments: { appName: 'agent-app', changes: {} } });
    assert.deepEqual(update.structuredContent, { operation: 'update', appName: 'agent-app' });
    const invalidDeploy = await client.callTool({ name: 'deploy_app', arguments: {} });
    assert.equal(invalidDeploy.isError, true);
    const injectedPrice = await client.callTool({
      name: 'validate_deployment',
      arguments: {
        appName: 'agent-app',
        repository: { url: 'https://github.com/org/repo' },
        plan: { id: 'custom', cpu: 2, ram: 4000, hdd: 20, instances: 2, priceMonthly: 0 },
        port: 3000,
        contactEmail: 'user@example.com',
        billingPeriod: 3,
      },
    });
    assert.equal(injectedPrice.isError, true);
    await client.close();
  });
});

test('MCP tool errors are returned as redacted errors instead of leaking service credentials', async () => {
  await withServer(async (url) => {
    const transport = new StreamableHTTPClientTransport(url, { authProvider: { token: async () => 'valid-firebase-token' } });
    const client = new Client({ name: 'orbit-error-test', version: '1.0.0' });
    await client.connect(transport);
    const result = await client.callTool({ name: 'analyze_repository', arguments: { url: 'https://github.com/org/repo' } });
    assert.equal(result.isError, true);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /firebase-secret|git-secret|api-secret/);
    assert.match(serialized, /\[REDACTED\]|\*\*\*/);
    await client.close();
  }, {
    async analyzeRepository() {
      throw new Error('Bearer firebase-secret API_KEY=api-secret https://user:git-secret@github.com/org/repo');
    },
  });
});

test('MCP endpoint rejects missing and invalid bearer tokens', async () => {
  await withServer(async (url) => {
    const missing = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate'), /^Bearer/);

    const transport = new StreamableHTTPClientTransport(url, {
      authProvider: { token: async () => 'wrong-token' },
    });
    const client = new Client({ name: 'orbit-test', version: '1.0.0' });
    await assert.rejects(() => client.connect(transport), UnauthorizedError);
  });
});

test('MCP endpoint accepts absent/allowlisted Origin and rejects cross-site browser Origins', async () => {
  await withServer(async (url) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'origin-test', version: '1' } } });
    const baseHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer valid-firebase-token' };
    const rejected = await fetch(url, { method: 'POST', headers: { ...baseHeaders, Origin: 'https://attacker.example' }, body });
    assert.equal(rejected.status, 403);
    const allowed = await fetch(url, { method: 'POST', headers: { ...baseHeaders, Origin: 'https://orbit.example' }, body });
    assert.equal(allowed.status, 200);
  });
});

test('separate MCP clients do not receive or require a server session id', async () => {
  await withServer(async (url) => {
    for (let i = 0; i < 2; i++) {
      const transport = new StreamableHTTPClientTransport(url, {
        authProvider: { token: async () => 'valid-firebase-token' },
      });
      const client = new Client({ name: `orbit-test-${i}`, version: '1.0.0' });
      await client.connect(transport);
      const result = await client.callTool({ name: 'list_plans', arguments: {} });
      assert.equal(result.structuredContent.plans.length, 4);
      assert.equal(transport.sessionId, undefined);
      await client.close();
    }
  });
});
