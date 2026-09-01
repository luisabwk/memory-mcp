import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

/** Compara o Bearer do header com o service token em tempo constante (digests SHA-256 de tamanho fixo). */
export function serviceTokenValid(
  authHeader: string | string[] | undefined,
  serviceToken: string | undefined,
): boolean {
  if (!serviceToken) return false;
  if (!authHeader || Array.isArray(authHeader)) return false;
  const m = /^Bearer\s+(.+)$/.exec(authHeader);
  if (!m) return false;
  const expected = createHash('sha256').update(serviceToken).digest();
  const provided = createHash('sha256').update(m[1]).digest();
  return timingSafeEqual(provided, expected);
}

export interface McpAuthOptions {
  internalPort: number;
  serviceToken: string | undefined;
  /**
   * Identity the internal service-token bypass maps to. Confirmed by Lu (2026-09-01):
   * headless/automation clients hitting the internal port map to her identity by
   * default — no separate pseudo-user for now. Required whenever `serviceToken` is
   * set: a service token with no mapped identity would mint an AuthInfo with no
   * email, which server.ts must then reject — so this option is validated present
   * at startup (see index-http.ts) rather than silently omitted here.
   */
  serviceTokenUserEmail: string | undefined;
  /** Middleware OAuth bearer do MCP SDK (requireBearerAuth). */
  oauthBearer: (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Política de auth do /mcp:
 *  - chegou na porta INTERNA + service token válido → identidade de serviço, segue.
 *  - qualquer outro caso (inclusive porta PÚBLICA com service token) → exige OAuth bearer.
 * A porta de chegada (req.socket.localPort) não é spoofável pela internet: o Traefik só
 * roteia a porta pública; a interna existe apenas na rede Docker.
 */
export function makeMcpAuth(opts: McpAuthOptions) {
  return function mcpAuth(req: Request, res: Response, next: NextFunction): void {
    const localPort = req.socket.localPort;
    if (localPort === opts.internalPort && serviceTokenValid(req.headers['authorization'], opts.serviceToken)) {
      // `token` é um placeholder sintético: a identidade de serviço não usa um access token OAuth real.
      // `extra.email` é a mesma identidade confiável que o fluxo OAuth carrega — ver server.ts.
      const auth: AuthInfo = {
        token: 'internal-service',
        clientId: 'internal-service',
        scopes: [],
        extra: opts.serviceTokenUserEmail ? { email: opts.serviceTokenUserEmail } : undefined,
      };
      req.auth = auth;
      next();
      return;
    }
    opts.oauthBearer(req, res, next);
  };
}
