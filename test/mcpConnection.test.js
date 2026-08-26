import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { buildMcpClientConfig, createMcpConnection } from '../src/services/mcpConnection.js';

function token(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

test('connection config binds the current origin, refreshed Firebase token, and token expiry', async () => {
  let forcedRefresh;
  const idToken = token({ sub: 'firebase-user', exp: 2_000_000_000 });
  const result = await createMcpConnection({
    uid: 'firebase-user',
    async getIdToken(force) { forcedRefresh = force; return idToken; },
  }, 'https://orbit.example/some/path', { now: () => 1_900_000_000_000 });
  assert.equal(forcedRefresh, true);
  assert.equal(result.endpoint, 'https://orbit.example/mcp');
  assert.equal(result.expiresAt, new Date(2_000_000_000_000).toISOString());
  assert.equal(result.config.mcpServers.orbit.headers.Authorization, `Bearer ${idToken}`);
  assert.equal(result.config.mcpServers.orbit.url, 'https://orbit.example/mcp');
});

test('unauthenticated users and malformed credentials cannot create a connection', async () => {
  await assert.rejects(() => createMcpConnection(null, 'https://orbit.example'), /Google or email/);
  await assert.rejects(() => createMcpConnection({ getIdToken: async () => 'invalid' }, 'https://orbit.example'), /invalid ID token/);
  await assert.rejects(() => createMcpConnection({ getIdToken: async () => token({ sub: 'user' }) }, 'https://orbit.example'), /expiry/);
  await assert.rejects(() => createMcpConnection({ getIdToken: async () => token({ sub: 'user', exp: 1 }) }, 'https://orbit.example'), /expired/);
  await assert.rejects(() => createMcpConnection({ uid: 'current', getIdToken: async () => token({ sub: 'other', exp: 2_000_000_000 }) }, 'https://orbit.example', { now: () => 1_900_000_000_000 }), /current user/);
});

test('client configuration ignores origin paths and always targets the MCP endpoint', () => {
  const config = buildMcpClientConfig({ origin: 'http://localhost:4000/dashboard/agents', token: 'secret-token' });
  assert.deepEqual(config, {
    mcpServers: { orbit: { type: 'http', url: 'http://localhost:4000/mcp', headers: { Authorization: 'Bearer secret-token' } } },
  });
});
