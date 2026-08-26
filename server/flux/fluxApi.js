import { parseAppData } from '../../src/services/appSpecParser.js';
import { sanitizeSpec } from '../orbit/core.js';
import { qsZelidAuth, UpstreamError } from '../orbit/http.js';

export class OwnershipError extends Error {
  constructor() {
    super('App not found or not owned by the authenticated user');
    this.name = 'OwnershipError';
    this.code = 'not_found';
    this.status = 404;
  }
}

function isOrbitSpec(spec) {
  return Boolean(spec?.compose?.some((component) => component.repotag?.includes('runonflux/orbit')));
}

function messageSpec(message) {
  return message?.appSpecification || message?.appspecification || message?.specification || message;
}

function messageHash(message) {
  return message?.hash || message?.txid || message?.transactionHash;
}

function messageHeight(message) {
  const height = Number(message?.height ?? message?.blockheight ?? message?.blockHeight);
  return Number.isInteger(height) && height >= 0 ? height : null;
}

export class FluxApiService {
  constructor({ fetchImpl = fetch, fluxApi = 'https://api.runonflux.io', enterpriseCrypto } = {}) {
    this.fetch = fetchImpl;
    this.fluxApi = fluxApi.replace(/\/$/, '');
    this.enterpriseCrypto = enterpriseCrypto;
  }

  async request(path, { method = 'GET', session, body, contentType, headers = {}, timeout = 30_000 } = {}) {
    const response = await this.fetch(`${this.fluxApi}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(session ? { zelidauth: qsZelidAuth(session) } : {}),
        ...headers,
      },
      ...(body == null ? {} : { body }),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await response.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { throw new UpstreamError('Flux returned invalid JSON'); }
    if (!response.ok) throw new UpstreamError('Flux request failed', { status: response.status, details: json });
    return json;
  }

  async listOwnedApps(session) {
    const body = await this.request(`/apps/globalappsspecifications?owner=${encodeURIComponent(session.zelid)}`, {
      session,
      headers: { 'x-apicache-bypass': 'true' },
    });
    const specs = Array.isArray(body?.data) ? body.data : [];
    const candidates = specs.filter((spec) => spec.owner === session.zelid && (
      spec.compose?.some((component) => component.repotag?.includes('runonflux/orbit')) ||
      (spec.version >= 8 && spec.enterprise)
    ));
    const parsed = [];
    for (let spec of candidates) {
      if (spec.enterprise && this.enterpriseCrypto) {
        try { spec = await this.enterpriseCrypto.decrypt(spec, session); } catch { continue; }
      }
      if (!isOrbitSpec(spec)) continue;
      parsed.push(sanitizeSpec(parseAppData(spec)));
    }
    return parsed;
  }

  async getOwnedSpec(session, appName, { decrypt = true } = {}) {
    const body = await this.request(`/apps/appspecifications/${encodeURIComponent(appName)}`, {
      session,
      headers: { 'x-apicache-bypass': 'true' },
    });
    let spec = body?.status === 'success' ? body.data : null;
    if (!spec || spec.owner !== session.zelid) throw new OwnershipError();
    if (decrypt && spec.enterprise) {
      if (!this.enterpriseCrypto) throw new Error('Enterprise decryption is unavailable');
      spec = await this.enterpriseCrypto.decrypt(spec, session);
    }
    if (decrypt && !isOrbitSpec(spec)) throw new OwnershipError();
    if (!decrypt && !spec.enterprise && !isOrbitSpec(spec)) throw new OwnershipError();
    return spec;
  }

  async assertTransaction(session, { appName, txid, type = 'fluxappregister' }) {
    const body = await this.request(`/apps/permanentmessages?owner=${encodeURIComponent(session.zelid)}`, {
      session,
      headers: { 'x-apicache-bypass': 'true' },
    });
    const messages = Array.isArray(body?.data) ? body.data : [];
    const match = messages.find((message) => {
      const spec = messageSpec(message);
      return messageHash(message) === txid && message.type === type && spec.name === appName && spec.owner === session.zelid;
    });
    if (!match) throw new OwnershipError();
    return messageSpec(match);
  }

  async assertUpdateTransactionContext(session, { appName, txid }) {
    // This proves the live app is both owned and an Orbit deployment before any
    // permanent-message data is used for payment reconstruction.
    await this.getOwnedSpec(session, appName);
    const body = await this.request(`/apps/permanentmessages?owner=${encodeURIComponent(session.zelid)}`, {
      session,
      headers: { 'x-apicache-bypass': 'true' },
    });
    const messages = Array.isArray(body?.data) ? body.data : [];
    const target = messages.find((message) => {
      const spec = messageSpec(message);
      return messageHash(message) === txid && message.type === 'fluxappupdate' &&
        spec.name === appName && spec.owner === session.zelid;
    });
    if (!target) throw new OwnershipError();
    const targetHeight = messageHeight(target);
    if (targetHeight == null) throw new Error('Flux update transaction height is unavailable');
    const prior = messages
      .filter((message) => {
        const spec = messageSpec(message);
        const height = messageHeight(message);
        return height != null && height < targetHeight &&
          (message.type === 'fluxappregister' || message.type === 'fluxappupdate') &&
          spec.name === appName && spec.owner === session.zelid;
      })
      .sort((left, right) => messageHeight(right) - messageHeight(left))[0];
    if (!prior) throw new Error('Previous Flux app transaction is unavailable');
    return {
      specification: messageSpec(target),
      targetHeight,
      previousSpecification: messageSpec(prior),
      previousHeight: messageHeight(prior),
    };
  }

  async getLocations(session, appName) {
    await this.getOwnedSpec(session, appName);
    const body = await this.request(`/apps/location/${encodeURIComponent(appName)}`, {
      headers: { 'x-apicache-bypass': 'true' },
    });
    return Array.isArray(body?.data) ? body.data.map((node) => ({
      ip: node.ip,
      runningSince: node.runningSince || null,
      expireAt: node.expireAt || null,
      hash: node.hash || null,
    })) : [];
  }

  async getDeploymentStatus(session, appName, txid) {
    let spec;
    try { spec = await this.getOwnedSpec(session, appName); } catch (error) {
      if (error instanceof OwnershipError && txid) {
        // A spec can lag its permanent registration message, but a caller must
        // still prove the pending transaction belongs to this Flux identity.
        await this.assertTransaction(session, { appName, txid, type: 'fluxappregister' });
        return { appName, txid, phase: 'pending_blockchain' };
      }
      throw error;
    }
    if (txid && spec.hash !== txid) {
      return { appName, txid, phase: 'pending_blockchain', instances: 0, runningInstances: 0, specificationHash: spec.hash || null };
    }
    const locations = await this.getLocations(session, appName);
    const running = locations.filter((node) => node.runningSince).length;
    return {
      appName,
      txid: txid || null,
      phase: running > 0 ? 'deployed' : 'installing',
      instances: locations.length,
      runningInstances: running,
      specificationHash: spec.hash || null,
    };
  }
}
