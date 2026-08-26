import { redactSecrets } from './core.js';

export class UpstreamError extends Error {
  constructor(message, { status = 502, code = 'upstream_error', details } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.code = code;
    this.details = details == null ? undefined : redactSecrets(details);
  }
}

export async function fetchJson(fetchImpl, url, options = {}, label = 'Upstream request') {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new UpstreamError(`${label} failed`, { details: error?.message });
  }
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new UpstreamError(`${label} returned invalid JSON`, { status: response.status, details: text.slice(0, 500) });
  }
  if (!response.ok) {
    throw new UpstreamError(`${label} failed`, { status: response.status, details: body });
  }
  return { response, body };
}

export function qsZelidAuth(zelidauth) {
  const params = new URLSearchParams();
  params.set('zelid', zelidauth.zelid);
  params.set('signature', zelidauth.signature);
  params.set('loginPhrase', zelidauth.loginPhrase);
  return params.toString();
}
