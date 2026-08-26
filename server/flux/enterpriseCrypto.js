import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { qsZelidAuth } from '../orbit/http.js';

function cleanKey(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function rsaWrapAesKey(publicKeyB64, aesKeyBytes) {
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(cleanKey(publicKeyB64), 'base64'),
    format: 'der',
    type: 'spki',
  });
  return crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(aesKeyBytes.toString('base64')),
  );
}

export class EnterpriseCryptoService {
  constructor({ fetchImpl = fetch, fluxApi = 'https://api.runonflux.io' } = {}) {
    this.fetch = fetchImpl;
    this.fluxApi = fluxApi.replace(/\/$/, '');
  }

  async getPublicKey(name, owner, session, baseUrl = this.fluxApi) {
    const response = await this.fetch(`${baseUrl}/apps/getpublickey`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        zelidauth: qsZelidAuth(session),
      },
      body: new URLSearchParams({ name, owner }).toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    if (!response.ok || body?.status !== 'success' || !body.data) throw new Error('Enterprise public key request failed');
    return body.data;
  }

  async encrypt(spec, session) {
    if (!session.stickyBackend) throw new Error('A sticky Flux backend is required for Enterprise encryption');
    const publicKeyB64 = await this.getPublicKey(spec.name, spec.owner, session, session.stickyBackend);
    const aesKey = crypto.randomBytes(32);
    const wrapped = rsaWrapAesKey(publicKeyB64, aesKey);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, nonce);
    const plaintext = Buffer.from(JSON.stringify({ contacts: spec.contacts, compose: spec.compose }));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const blob = Buffer.concat([wrapped, nonce, ciphertext, cipher.getAuthTag()]).toString('base64');
    return { ...spec, enterprise: blob, contacts: [], compose: [] };
  }

  async decrypt(spec, session) {
    if (!spec?.enterprise) return spec;
    const ownerResponse = await this.fetch(`${this.fluxApi}/apps/apporiginalowner/${encodeURIComponent(spec.name)}`);
    const ownerBody = await ownerResponse.json().catch(() => null);
    const owner = ownerBody?.status === 'success' && ownerBody.data ? ownerBody.data : spec.owner;
    const publicKeyB64 = await this.getPublicKey(spec.name, owner, session);
    const aesKey = crypto.randomBytes(32);
    const wrapped = rsaWrapAesKey(publicKeyB64, aesKey).toString('base64');
    const response = await this.fetch(`${this.fluxApi}/apps/appspecifications/${encodeURIComponent(spec.name)}/true`, {
      headers: {
        zelidauth: qsZelidAuth(session),
        'enterprise-key': wrapped,
        'x-apicache-bypass': 'true',
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    if (!response.ok || body?.status !== 'success' || !body.data?.enterprise) throw new Error('Enterprise specification request failed');
    const encrypted = Buffer.from(body.data.enterprise, 'base64');
    if (encrypted.length < 29) throw new Error('Enterprise specification is malformed');
    const nonce = encrypted.subarray(0, 12);
    const tag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(12, encrypted.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
    decipher.setAuthTag(tag);
    const fields = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
    return { ...spec, ...fields, enterprise: null, _wasEnterprise: true };
  }
}
