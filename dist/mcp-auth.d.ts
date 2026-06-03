import type { Request, Response, NextFunction } from 'express';
/** Compara o Bearer do header com o service token em tempo constante (digests SHA-256 de tamanho fixo). */
export declare function serviceTokenValid(authHeader: string | string[] | undefined, serviceToken: string | undefined): boolean;
export interface McpAuthOptions {
    internalPort: number;
    serviceToken: string | undefined;
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