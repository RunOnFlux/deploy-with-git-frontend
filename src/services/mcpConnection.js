function decodeJwtPayload(token) {
  const part = String(token || '').split('.')[1];
  if (!part) throw new Error('Firebase returned an invalid ID token');
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    return JSON.parse(atob(padded));
  } catch {
    throw new Error('Firebase returned an invalid ID token');
  }
}

export function buildMcpClientConfig({ origin, token }) {
  const endpoint = new URL('/mcp', origin).toString();
  return {
    mcpServers: {
      orbit: {
        type: 'http',
        url: endpoint,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  };
}

export async function createMcpConnection(firebaseUser, origin, { now = Date.now } = {}) {
  if (!firebaseUser?.getIdToken) {
    throw new Error('Connect an agent requires a Google or email Orbit login');
  }
  const token = await firebaseUser.getIdToken(true);
  const claims = decodeJwtPayload(token);
  if (!Number.isFinite(claims.exp)) throw new Error('Firebase token expiry is unavailable');
  if (claims.exp * 1000 <= now() + 60_000) throw new Error('Firebase returned an expired or near-expiry ID token');
  if (firebaseUser.uid && claims.sub !== firebaseUser.uid) throw new Error('Firebase token does not belong to the current user');
  return {
    token,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    endpoint: new URL('/mcp', origin).toString(),
    config: buildMcpClientConfig({ origin, token }),
  };
}
