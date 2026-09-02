import { createHash, timingSafeEqual } from 'node:crypto';
/** Compara o Bearer do header com o service token em tempo constante (digests SHA-256 de tamanho fixo). */
export function serviceTokenValid(authHeader, serviceToken) {
    if (!serviceToken)
        return false;
    if (!authHeader || Array.isArray(authHeader))
        return false;
    const m = /^Bearer\s+(.+)$/.exec(authHeader);
    if (!m)
        return false;
    const expected = createHash('sha256').update(serviceToken).digest();
    const provided = createHash('sha256').update(m[1]).digest();
    return timingSafeEqual(provided, expected);
}
/**
 * Política de auth do /mcp:
 *  - chegou na porta INTERNA + service token válido → identidade de serviço, segue.
 *  - qualquer outro caso (inclusive porta PÚBLICA com service token) → exige OAuth bearer.
 * A porta de chegada (req.socket.localPort) não é spoofável pela internet: o Traefik só
 * roteia a porta pública; a interna existe apenas na rede Docker.
 */
export function makeMcpAuth(opts) {
    return function mcpAuth(req, res, next) {
        const localPort = req.socket.localPort;
        if (localPort === opts.internalPort && serviceTokenValid(req.headers['authorization'], opts.serviceToken)) {
            // `token` é um placeholder sintético: a identidade de serviço não usa um access token OAuth real.
            // `extra.email` é a mesma identidade confiável que o fluxo OAuth carrega — ver server.ts.
            const auth = {
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
//# sourceMappingURL=mcp-auth.js.map