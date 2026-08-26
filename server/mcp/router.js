import express from 'express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';

import { bearerTokenFromHeader } from '../auth/firebaseTokenVerifier.js';
import { createOrbitMcpServer } from './createServer.js';

function sendAuthError(res, error) {
  return res.status(error?.status === 403 ? 403 : 401)
    .set('WWW-Authenticate', 'Bearer realm="orbit-mcp"')
    .json({ error: error?.code || 'invalid_token', error_description: error?.message || 'Authentication failed' });
}

export function createOrbitMcpRouter({ tokenVerifier, services = {}, version, allowedOrigins = [] } = {}) {
  if (!tokenVerifier?.verifyAccessToken) throw new Error('An MCP token verifier is required');
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  router.post('/', async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'origin_not_allowed' });
    }
    let authInfo;
    try {
      const token = bearerTokenFromHeader(req.headers.authorization);
      authInfo = await tokenVerifier.verifyAccessToken(token);
      req.auth = authInfo;
    } catch (error) {
      return sendAuthError(res, error);
    }

    const server = createOrbitMcpServer({ authInfo, services, version });
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal MCP error' }, id: null });
      }
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  });

  router.all('/', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' });
  });
  return router;
}
