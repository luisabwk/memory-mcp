import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutos
export class BrokerError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'BrokerError';
    }
}
export class GoogleBroker {
    oauth;
    clientId;
    allowed;
    pending = new Map();
    constructor() {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const baseUrl = process.env.BASE_URL;
        const allowed = process.env.ALLOWED_EMAILS;
        if (!clientId)
            throw new Error('Missing GOOGLE_CLIENT_ID');
        if (!clientSecret)
            throw new Error('Missing GOOGLE_CLIENT_SECRET');
        if (!baseUrl)
            throw new Error('Missing BASE_URL');
        if (!allowed)
            throw new Error('Missing ALLOWED_EMAILS');
        this.clientId = clientId;
        this.oauth = new OAuth2Client({
            clientId,
            clientSecret,
            redirectUri: new URL('/auth/google/callback', baseUrl).toString(),
        });
        this.allowed = new Set(allowed.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
    }
    /** Grava o pedido MCP pendente e devolve a URL de consent do Google. */
    startLogin(pending) {
        this.sweep();
        const loginSid = randomBytes(24).toString('hex');
        this.pending.set(loginSid, { ...pending, createdAt: Date.now() });
        return this.oauth.generateAuthUrl({
            access_type: 'online',
            scope: ['openid', 'email'],
            state: loginSid,
            prompt: 'select_account',
        });
    }
    /**
     * Valida o callback do Google. Devolve o pendente se a identidade for permitida; senão lança BrokerError.
     * NOTA: o `codeChallenge` (PKCE) no PendingAuth NÃO é validado aqui — o Google é usado só como
     * provedor de identidade. O PKCE do fluxo MCP é enforçado pela camada de cima
     * (auth-provider `challengeForAuthorizationCode`/`exchangeAuthorizationCode`).
     */
    async verifyCallback(state, code) {
        if (!state)
            throw new BrokerError(400, 'Missing state');
        if (!code)
            throw new BrokerError(400, 'Missing code');
        const stored = this.pending.get(state);
        if (!stored)
            throw new BrokerError(400, 'Unknown or expired login session');
        this.pending.delete(state); // consome: code de login não reutilizável
        if (Date.now() - stored.createdAt > PENDING_TTL_MS) {
            throw new BrokerError(400, 'Login session expired');
        }
        let idToken;
        try {
            const { tokens } = await this.oauth.getToken(code);
            idToken = tokens.id_token ?? undefined;
        }
        catch {
            throw new BrokerError(502, 'Google token exchange failed');
        }
        if (!idToken)
            throw new BrokerError(502, 'No id_token from Google');
        let payload;
        try {
            const ticket = await this.oauth.verifyIdToken({ idToken, audience: this.clientId });
            payload = ticket.getPayload();
        }
        catch {
            throw new BrokerError(502, 'Invalid id_token signature');
        }
        if (!payload)
            throw new BrokerError(502, 'Empty id_token payload');
        if (payload.email_verified !== true)
            throw new BrokerError(403, 'Email not verified');
        if (!payload.email)
            throw new BrokerError(502, 'id_token missing email claim');
        const email = payload.email.toLowerCase();
        if (!this.allowed.has(email))
            throw new BrokerError(403, 'Email not allowed');
        const { createdAt: _createdAt, ...rest } = stored;
        return rest;
    }
    sweep() {
        const now = Date.now();
        for (const [k, v] of this.pending) {
            if (now - v.createdAt > PENDING_TTL_MS)
                this.pending.delete(k);
        }
    }
}
//# sourceMappingURL=google-broker.js.map