import { createRemoteJWKSet, jwtVerify } from 'jose';

export const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
);

function authError(message = 'Invalid authentication token') {
  const error = new Error(message);
  error.name = 'AuthenticationError';
  error.status = 401;
  error.code = 'invalid_token';
  return error;
}

export class FirebaseTokenVerifier {
  constructor({
    projectId,
    keySet = createRemoteJWKSet(FIREBASE_JWKS_URL),
    clockTolerance = 5,
    requiredScopes = ['orbit:read', 'orbit:write'],
  }) {
    if (!projectId) throw new Error('Firebase projectId is required');
    this.projectId = projectId;
    this.keySet = keySet;
    this.clockTolerance = clockTolerance;
    this.requiredScopes = requiredScopes;
  }

  async verifyAccessToken(token) {
    if (!token || typeof token !== 'string') throw authError();
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.keySet, {
        algorithms: ['RS256'],
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
        clockTolerance: this.clockTolerance,
      });
      if (!protectedHeader.kid) throw authError();
      if (!payload.sub || typeof payload.sub !== 'string') throw authError();
      if (!payload.email || payload.email_verified !== true) throw authError('A verified Firebase email is required');
      if (!Number.isFinite(payload.exp)) throw authError();

      return {
        token,
        clientId: payload.sub,
        scopes: [...this.requiredScopes],
        expiresAt: payload.exp,
        extra: {
          firebaseUid: payload.sub,
          email: payload.email,
          displayName: payload.name || '',
          firebaseToken: token,
        },
      };
    } catch (error) {
      if (error?.name === 'AuthenticationError') throw error;
      throw authError();
    }
  }
}

export function bearerTokenFromHeader(value) {
  if (typeof value !== 'string') throw authError('Missing bearer token');
  const match = value.match(/^Bearer ([^\s]+)$/);
  if (!match) throw authError('Malformed bearer token');
  return match[1];
}
