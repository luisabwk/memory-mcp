import type { Request, Response, NextFunction } from 'express';
/** Compara o Bearer do header com o service token em tempo constante (digests SHA-256 de tamanho fixo). */
export declare function serviceTokenValid(authHeader: string | string[] | undefined, serviceToken: string | undefined): boolean;
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
export declare function makeMcpAuth(opts: McpAuthOptions): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=mcp-auth.d.ts.map