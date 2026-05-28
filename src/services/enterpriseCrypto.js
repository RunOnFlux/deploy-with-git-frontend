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
    // In dev builds allow plain-HTTP access so enterprise flows can be tested
    // over a non-HTTPS IP. The browser's native crypto will still throw if
    // SubtleCrypto is truly unavailable.
    if (import.meta.env.DEV) return;

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

  const stickyBackend = zelidauth._stickyBackend;
  if (!stickyBackend) {
    throw new Error('Sticky backend not available — please log out and log in again before publishing an enterprise app.');
  }

  const resp = await fetch('/api/node-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 15s timeout — the getpublickey RPC is known to hang on some nodes
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      nodeBase: stickyBackend,
      path: '/apps/getpublickey',
      method: 'POST',
      zelidauth: zaStr,
      data: { name: spec.name, owner: spec.owner },
    }),
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

// ── Decryption ────────────────────────────────────────────────────────────────

/**
 * AES-GCM decrypt a payload re-encrypted by the Flux node.
 * The node returns: nonce(12B) | ciphertext+tag (no RSA key prefix).
 */
async function decryptWithAes(base64NonceCiphertext, aesKey) {
  requireWebCrypto();
  const buf = base64ToUint8Array(base64NonceCiphertext);
  const nonce = buf.slice(0, 12);
  const ciphertextTag = buf.slice(12);
  const aesCryptoKey = await window.crypto.subtle.importKey(
    'raw', aesKey, 'AES-GCM', false, ['decrypt'],
  );
  const plainBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    aesCryptoKey,
    ciphertextTag,
  );
  return new TextDecoder().decode(plainBuf);
}

/**
 * Decrypt an enterprise spec:
 * 1. GET /apps/getpublickey  → RSA public key
 * 2. Generate ephemeral AES key, RSA-encrypt it
 * 3. GET /apps/appspecifications/<name>/true  with enterprise-key header
 *    → node re-encrypts payload with our AES key
 * 4. Decrypt with our AES key → JSON { contacts, compose }
 * 5. Return spec with compose/contacts restored, enterprise: null
 *
 * Fails open — returns the original spec on any error.
 */
/**
 * Decrypt an enterprise spec using browser-side WebCrypto (requires HTTPS/localhost).
 * 1. GET  /apps/apporiginalowner/<name>
 * 2. POST /apps/getpublickey { name, owner } → RSA public key
 * 3. Generate ephemeral AES-256 key; RSA-OAEP wrap it
 * 4. GET  /apps/appspecifications/<name>/true with enterprise-key header
 *    → node re-encrypts payload with our AES key
 * 5. AES-GCM decrypt → { contacts, compose }
 */
export async function decryptEnterpriseSpec(spec, zelidauth) {
  if (!spec?.enterprise) return spec;
  if (!isWebCryptoAvailable()) {
    console.warn(`[decrypt:${spec.name}] WebCrypto not available — requires HTTPS`);
    return { ...spec, _decryptFailed: true };
  }

  const zaStr = qs.stringify({
    zelid: zelidauth.zelid,
    signature: zelidauth.signature,
    loginPhrase: zelidauth.loginPhrase,
  });

  try {
    // 0. Original owner
    let owner = spec.owner;
    try {
      const ownerResp = await fetch(`/api/flux/apps/apporiginalowner/${encodeURIComponent(spec.name)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const ownerJson = await ownerResp.json();
      if (ownerJson.status === 'success' && ownerJson.data) owner = ownerJson.data;
    } catch { /* fall back to spec.owner */ }

    // 1. POST /apps/getpublickey — Flux API requires form-encoded body
    const pkResp = await fetch('/api/flux/apps/getpublickey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', zelidauth: zaStr },
      body: new URLSearchParams({ name: spec.name, owner }).toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const pkJson = await pkResp.json();
    if (pkJson.status !== 'success' || !pkJson.data) return { ...spec, _decryptFailed: true };

    // 2. Import RSA public key + generate ephemeral AES key
    const rsaPubKey = await importRsaPublicKey(pkJson.data.trim().replace(/\s+/g, ''));
    const aesKey = window.crypto.getRandomValues(new Uint8Array(32));
    const encryptedEnterpriseKey = await encryptAesKeyWithRsaKey(aesKey, rsaPubKey);

    // 3. GET /apps/appspecifications/<name>/true with enterprise-key
    const specResp = await fetch(
      `/api/flux/apps/appspecifications/${encodeURIComponent(spec.name)}/true`,
      {
        headers: {
          zelidauth: zaStr,
          'enterprise-key': encryptedEnterpriseKey,
          'x-apicache-bypass': 'true',
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    const specJson = await specResp.json();
    if (specJson.status !== 'success' || !specJson.data?.enterprise) return { ...spec, _decryptFailed: true };

    // 4. AES-GCM decrypt
    const plain = await decryptWithAes(specJson.data.enterprise, aesKey);
    const extraFields = JSON.parse(plain);

    return { ...spec, ...extraFields, enterprise: null, _wasEnterprise: true };
  } catch (err) {
    console.error(`[decrypt:${spec.name}] failed:`, err);
    return { ...spec, _decryptFailed: true };
  }
}
