import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

import { FirebaseTokenVerifier, bearerTokenFromHeader } from '../server/auth/firebaseTokenVerifier.js';
import { FluxSessionService, parseStickyBackend } from '../server/flux/fluxSession.js';

const projectId = 'orbit-test-project';
const issuer = `https://securetoken.google.com/${projectId}`;

async function tokenFixture(overrides = {}, header = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: 'firebase-user-1',
    email: 'verified@example.com',
    email_verified: true,
    aud: projectId,
    iss: issuer,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', ...header })
    .sign(privateKey);
  const keySet = async (protectedHeader) => {
    if (protectedHeader.kid !== jwk.kid) throw new Error('unknown key');
    return publicKey;
  };
  return { token, keySet, now };
}

test('Firebase verifier accepts a correctly signed verified user token', async () => {
  const { token, keySet } = await tokenFixture();
  const verifier = new FirebaseTokenVerifier({ projectId, keySet });
  const auth = await verifier.verifyAccessToken(token);
  assert.equal(auth.clientId, 'firebase-user-1');
  assert.equal(auth.extra.email, 'verified@example.com');
  assert.deepEqual(auth.scopes, ['orbit:read', 'orbit:write']);
  assert.equal(auth.extra.firebaseToken, token);
});

for (const [name, overrides] of [
  ['expired', { exp: 1 }],
  ['wrong audience', { aud: 'another-project' }],
  ['wrong issuer', { iss: 'https://securetoken.google.com/another-project' }],
  ['unverified email', { email_verified: false }],
  ['missing subject', { sub: '' }],
]) {
  test(`Firebase verifier rejects ${name}`, async () => {
    const { token, keySet } = await tokenFixture(overrides);
    const verifier = new FirebaseTokenVerifier({ projectId, keySet, clockTolerance: 0 });
    await assert.rejects(() => verifier.verifyAccessToken(token), /Invalid authentication|verified Firebase email/);
  });
}

test('Firebase verifier rejects an unknown signing key and malformed bearer headers', async () => {
  const { token } = await tokenFixture({}, { kid: 'unknown' });
  const verifier = new FirebaseTokenVerifier({ projectId, keySet: async () => { throw new Error('unknown'); } });
  await assert.rejects(() => verifier.verifyAccessToken(token), /Invalid authentication/);
  assert.throws(() => bearerTokenFromHeader('Basic abc'), /Malformed bearer/);
  assert.equal(bearerTokenFromHeader('Bearer abc.def'), 'abc.def');
});

test('Flux session derives internal identity and preserves sticky backend', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/id/loginphrase')) {
      return new Response(JSON.stringify({ status: 'success', data: 'phrase-123' }), {
        status: 200,
        headers: { fluxnode: 'server77_65.109.86.26' },
      });
    }
    if (url.endsWith('/signInOrUp')) {
      return new Response(JSON.stringify({ status: 'success', public_address: 't1Owner', signature: 'flux-signature' }));
    }
    if (url.endsWith('/signMessage')) {
      return new Response(JSON.stringify({ status: 'success', signature: 'message-signature' }));
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const service = new FluxSessionService({ fetchImpl, fluxApi: 'https://flux.test', fluxCoreApi: 'https://core.test' });
  const session = await service.create('firebase-token-secret', { uid: 'uid-1', email: 'user@example.com' });
  assert.equal(session.zelid, 't1Owner');
  assert.equal(session.stickyBackend, 'https://65-109-86-26-16127.node.api.runonflux.io');
  assert.match(service.header(session), /zelid=t1Owner/);
  assert.equal(await service.signMessage(session, 'payload-to-sign'), 'message-signature');
  assert.equal(JSON.parse(requests[1].options.body).message, 'phrase-123');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer firebase-token-secret');
  assert.equal(JSON.parse(requests[2].options.body).message, 'payload-to-sign');
});

test('sticky backend parser rejects invalid or out-of-range addresses', () => {
  assert.equal(parseStickyBackend('server_999.1.1.1'), null);
  assert.equal(parseStickyBackend('not-an-ip'), null);
});
