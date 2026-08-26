import { fetchJson, qsZelidAuth } from '../orbit/http.js';

export const DEFAULT_FLUX_API = 'https://api.runonflux.io';
export const DEFAULT_FLUXCORE_API = 'https://service.fluxcore.ai/api';

export function parseStickyBackend(fluxnodeHeader) {
  if (!fluxnodeHeader || typeof fluxnodeHeader !== 'string') return null;
  const rawIp = fluxnodeHeader.includes('_') ? fluxnodeHeader.split('_').at(-1) : fluxnodeHeader;
  const ip = rawIp.trim();
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
  if (ip.split('.').some((part) => Number(part) > 255)) return null;
  return `https://${ip.replaceAll('.', '-')}-16127.node.api.runonflux.io`;
}

export class FluxSessionService {
  constructor({
    fetchImpl = fetch,
    fluxApi = DEFAULT_FLUX_API,
    fluxCoreApi = DEFAULT_FLUXCORE_API,
  } = {}) {
    this.fetch = fetchImpl;
    this.fluxApi = fluxApi.replace(/\/$/, '');
    this.fluxCoreApi = fluxCoreApi.replace(/\/$/, '');
  }

  async create(firebaseToken, firebaseUser) {
    const { response: phraseResponse, body: phraseBody } = await fetchJson(
      this.fetch,
      `${this.fluxApi}/id/loginphrase`,
      { headers: { Accept: 'application/json' } },
      'Flux login phrase request',
    );
    if (phraseBody?.status !== 'success' || typeof phraseBody.data !== 'string') {
      throw new Error('Flux login phrase request failed');
    }
    const { body: ssoBody } = await fetchJson(
      this.fetch,
      `${this.fluxCoreApi}/signInOrUp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firebaseToken}` },
        body: JSON.stringify({ message: phraseBody.data }),
      },
      'FluxCore authentication',
    );
    if (ssoBody?.status !== 'success' || !ssoBody.public_address || !ssoBody.signature) {
      throw new Error('FluxCore authentication failed');
    }
    return Object.freeze({
      firebaseUid: firebaseUser?.uid || firebaseUser?.firebaseUid,
      email: firebaseUser?.email,
      firebaseToken,
      zelid: ssoBody.public_address,
      signature: ssoBody.signature,
      loginPhrase: phraseBody.data,
      stickyBackend: parseStickyBackend(phraseResponse.headers.get('fluxnode')),
    });
  }

  async signMessage(session, message) {
    const { body } = await fetchJson(
      this.fetch,
      `${this.fluxCoreApi}/signMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.firebaseToken}` },
        body: JSON.stringify({ message }),
      },
      'FluxCore signing',
    );
    if (body?.status !== 'success' || !body.signature) throw new Error('FluxCore signing failed');
    return body.signature;
  }

  header(session) {
    return qsZelidAuth(session);
  }
}
