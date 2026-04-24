/**
 * Enterprise crypto utilities — WebCrypto RSA-OAEP + AES-GCM.
 * Requires a secure context (HTTPS or localhost).
 *
 * Encryption format:
 *   rsaEncryptedAesKey (256 bytes) | nonce (12 bytes) | AES-GCM ciphertext+tag
 * The whole blob is base64-encoded and stored in spec.enterprise.
 * spec.contacts and spec.compose are cleared (moved inside the encrypted blob).
 */

import qs from 'qs';

export function isWebCryptoAvailable() {
  return !!(window.crypto?.subtle);
}

function requireWebCrypto() {
  if (!isWebCryptoAvailable()) {
    const secure =
      window.location.protocol === 'https:' ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname);
    throw new Error(
      secure
        ? 'WebCrypto API unavailable. Please use a modern browser.'
        : 'Enterprise encryption requires HTTPS. Please access Orbit over a secure connection.',
    );
  }
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToUint8Array(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Primitives ────────────────────────────────────────────────────────────────

/**
 * Import a base64-encoded SPKI DER RSA public key for RSA-OAEP/SHA-256 encryption.
 */
export async function importRsaPublicKey(base64SpkiDer) {
  requireWebCrypto();
  const spkiDer = base64ToUint8Array(base64SpkiDer);
  return window.crypto.subtle.importKey(
    'spki',
    spkiDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

/**
 * RSA-OAEP encrypt a 32-byte AES key. Returns base64 ciphertext.
 */
async function encryptAesKeyWithRsaKey(aesKey, rsaPubKey) {
  requireWebCrypto();
  // Encode the raw key bytes as base64 before RSA encrypting (matches reference impl)
  const aesKeyB64 = arrayBufferToBase64(aesKey);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    rsaPubKey,
    new TextEncoder().encode(aesKeyB64),
  );
  return arrayBufferToBase64(encrypted);
}

/**
 * AES-GCM encrypt plainText.
 * Returns base64 of: rsaEncryptedAesKey | nonce(12B) | ciphertext+tag
 */
async function encryptWithAes(plainText, aesKey, base64RsaEncryptedAesKey) {
  requireWebCrypto();
  const nonce = window.crypto.getRandomValues(new Uint8Array(12));
  const rsaKeyBytes = base64ToUint8Array(base64RsaEncryptedAesKey);

  const aesCryptoKey = await window.crypto.subtle.importKey(
    'raw', aesKey, 'AES-GCM', false, ['encrypt'],
  );
  const ciphertextBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesCryptoKey,
    new TextEncoder().encode(plainText),
  );

  const ciphertext = new Uint8Array(ciphertextBuf);
  const combined = new Uint8Array(rsaKeyBytes.length + nonce.length + ciphertext.length);
  combined.set(rsaKeyBytes);
  combined.set(nonce, rsaKeyBytes.byteLength);
  combined.set(ciphertext, rsaKeyBytes.byteLength + nonce.length);
  return arrayBufferToBase64(combined.buffer);
}

// ── High-level API ────────────────────────────────────────────────────────────

/**
 * Full enterprise encryption pipeline:
 * 1. Fetch RSA public key from Flux API
 * 2. Generate ephemeral AES-256 key
 * 3. RSA-OAEP encrypt the AES key
 * 4. AES-GCM encrypt { contacts, compose }
 * 5. Return modified spec: enterprise = blob, contacts = [], compose = []
 */
export async function encryptSpec(spec, zelidauth) {
  requireWebCrypto();

  const zaStr = qs.stringify({
    zelid: zelidauth.zelid,
    signature: zelidauth.signature,
    loginPhrase: zelidauth.loginPhrase,
  });

  const resp = await fetch('/api/flux/apps/getapppublickey', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      zelidauth: zaStr,
    },
    body: JSON.stringify({ name: spec.name, owner: spec.owner }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch enterprise public key: HTTP ${resp.status}`);
  }

  const json = await resp.json();
  if (json.status === 'error') {
    throw new Error(`Enterprise key error: ${json.data || 'Unknown error'}`);
  }

  const pubKeyB64 = (json.data || '').trim().replace(/\s+/g, '');
  if (!pubKeyB64) throw new Error('Received empty enterprise public key');

  const aesKey = window.crypto.getRandomValues(new Uint8Array(32));
  const rsaPubKey = await importRsaPublicKey(pubKeyB64);
  const encryptedAesKey = await encryptAesKeyWithRsaKey(aesKey, rsaPubKey);

  const enterprisePayload = JSON.stringify({
    contacts: spec.contacts,
    compose: spec.compose,
  });
  const encryptedEnterprise = await encryptWithAes(enterprisePayload, aesKey, encryptedAesKey);

  return {
    ...spec,
    enterprise: encryptedEnterprise,
    contacts: [],
    compose: [],
  };
}
