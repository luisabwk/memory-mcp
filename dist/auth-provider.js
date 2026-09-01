/**
 * MongoDB-backed OAuth 2.1 provider for the MCP SDK.
 * Implements OAuthServerProvider + OAuthRegisteredClientsStore.
 *
 * authorize() NÃO auto-aprova: delega ao GoogleBroker, que prova a identidade
 * (login Google + allowlist de e-mail) antes de qualquer code ser emitido. O code
 * MCP só é gerado em issueMcpCode(), chamado pelo callback do Google após verificação.
 *
 * Identity threading: issueMcpCode() only accepts a VerifiedPendingAuth (carries
 * `email`, proven by GoogleBroker.verifyCallback()). That email is stored alongside
 * every auth code / access token / refresh token it produces, and verifyAccessToken()
 * surfaces it back out as AuthInfo.extra.email — the one channel server.ts trusts for
 * per-user scoping. Nothing in this file ever takes email from client input.
 *
 * Exported names são mantidos por compat (InMemoryOAuthProvider / InMemoryClientsStore).
 *
 * Env vars required:
 *   MONGODB_URI — connection string for the dedicated memory-mcp Mongo instance
 *   MONGODB_DB  — database name
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { getMongoDb } from './services/mongo.js';
const ACCESS_TOKEN_TTL = 3600; // 1 hour in seconds
const AUTH_CODE_TTL = 300; // 5 minutes in seconds
// ---------------------------------------------------------------------------
// MongoClientsStore (exported as InMemoryClientsStore for backward compat)
// ---------------------------------------------------------------------------
export class InMemoryClientsStore {
    dbPromise;
    constructor() {
        this.dbPromise = getMongoDb();
    }
    async col() {
        const db = await this.dbPromise;
        return db.collection('oauth_clients');
    }
    async getClient(clientId) {
        const doc = await (await this.col()).findOne({ _id: clientId });
        return doc?.client_data;
    }
    async registerClient(client) {
        const clientId = randomUUID();
        const isPublicClient = client.token_endpoint_auth_method === 'none';
        const clientSecret = isPublicClient ? undefined : randomBytes(32).toString('hex');
        const now = Math.floor(Date.now() / 1000);
        const full = {
            ...client,
            client_id: clientId,
            client_secret: clientSecret,
            client_id_issued_at: now,
        };
        await (await this.col()).insertOne({ _id: clientId, client_data: full, created_at: new Date() });
        return full;
    }
}
// ---------------------------------------------------------------------------
// MongoOAuthProvider (exported as InMemoryOAuthProvider for backward compat)
// ---------------------------------------------------------------------------
export class InMemoryOAuthProvider {
    clientsStore;
    dbPromise;
    broker;
    constructor(broker) {
        this.dbPromise = getMongoDb();
        this.clientsStore = new InMemoryClientsStore();
        this.broker = broker;
    }
    async codesCol() {
        return (await this.dbPromise).collection('oauth_auth_codes');
    }
    async accessTokensCol() {
        return (await this.dbPromise).collection('oauth_access_tokens');
    }
    async refreshTokensCol() {
        return (await this.dbPromise).collection('oauth_refresh_tokens');
    }
    async authorize(client, params, res) {
        // Não auto-aprova: estaciona o pedido e manda o navegador pro Google.
        const url = this.broker.startLogin({
            clientId: client.client_id,
            redirectUri: params.redirectUri,
            codeChallenge: params.codeChallenge,
            scopes: params.scopes ?? [],
            state: params.state,
        });
        res.redirect(url);
    }
    /**
     * Emite o auth code MCP DEPOIS que a identidade foi provada no Google.
     * CONTRATO: só pode ser chamado pelo callback do Google, com o `pending` retornado
     * por `GoogleBroker.verifyCallback()` (que já validou e-mail + assinatura, e por isso
     * é tipado VerifiedPendingAuth — carrega `email`). NÃO chame direto de nenhum outro
     * lugar — isso bypassaria o gate de identidade.
     */
    async issueMcpCode(pending, res) {
        const code = `code_${randomBytes(24).toString('hex')}`;
        const now = Date.now();
        await (await this.codesCol()).insertOne({
            _id: code,
            client_id: pending.clientId,
            code_challenge: pending.codeChallenge,
            redirect_uri: pending.redirectUri,
            scopes: pending.scopes ?? [],
            email: pending.email,
            expires_at: new Date(now + AUTH_CODE_TTL * 1000),
            created_at: new Date(now),
        });
        const redirectUrl = new URL(pending.redirectUri);
        redirectUrl.searchParams.set('code', code);
        if (pending.state) {
            redirectUrl.searchParams.set('state', pending.state);
        }
        res.redirect(redirectUrl.toString());
    }
    async challengeForAuthorizationCode(_client, authorizationCode) {
        const doc = await (await this.codesCol()).findOne({ _id: authorizationCode });
        if (!doc)
            throw new Error('Authorization code not found');
        return doc.code_challenge;
    }
    async exchangeAuthorizationCode(client, authorizationCode) {
        const codesCol = await this.codesCol();
        const stored = await codesCol.findOne({ _id: authorizationCode });
        if (!stored)
            throw new Error('Authorization code not found');
        if (stored.client_id !== client.client_id)
            throw new Error('Client mismatch');
        if (stored.expires_at.getTime() < Date.now()) {
            await codesCol.deleteOne({ _id: authorizationCode });
            throw new Error('Authorization code expired');
        }
        const now = Date.now();
        const accessToken = `at_${randomBytes(32).toString('hex')}`;
        const refreshToken = `rt_${randomBytes(32).toString('hex')}`;
        // Insert tokens before deleting the code — if inserts fail, code remains
        // usable on retry (no permanent lockout).
        await (await this.accessTokensCol()).insertOne({
            _id: accessToken,
            client_id: client.client_id,
            scopes: stored.scopes,
            email: stored.email,
            expires_at: new Date(now + ACCESS_TOKEN_TTL * 1000),
            created_at: new Date(now),
        });
        await (await this.refreshTokensCol()).insertOne({
            _id: refreshToken,
            client_id: client.client_id,
            scopes: stored.scopes,
            email: stored.email,
            expires_at: null,
            created_at: new Date(now),
        });
        await codesCol.deleteOne({ _id: authorizationCode });
        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL,
            refresh_token: refreshToken,
            scope: stored.scopes.join(' '),
        };
    }
    async exchangeRefreshToken(client, refreshToken, scopes) {
        const refreshCol = await this.refreshTokensCol();
        const stored = await refreshCol.findOne({ _id: refreshToken });
        if (!stored)
            throw new Error('Refresh token not found');
        if (stored.client_id !== client.client_id)
            throw new Error('Client mismatch');
        const now = Date.now();
        const newAccessToken = `at_${randomBytes(32).toString('hex')}`;
        const newRefreshToken = `rt_${randomBytes(32).toString('hex')}`;
        const effectiveScopes = scopes ?? stored.scopes;
        // Insert new tokens before deleting old — if inserts fail, old refresh
        // token remains valid and client can retry without permanent lockout.
        await (await this.accessTokensCol()).insertOne({
            _id: newAccessToken,
            client_id: client.client_id,
            scopes: effectiveScopes,
            email: stored.email,
            expires_at: new Date(now + ACCESS_TOKEN_TTL * 1000),
            created_at: new Date(now),
        });
        await refreshCol.insertOne({
            _id: newRefreshToken,
            client_id: client.client_id,
            scopes: effectiveScopes,
            email: stored.email,
            expires_at: null,
            created_at: new Date(now),
        });
        await refreshCol.deleteOne({ _id: refreshToken });
        return {
            access_token: newAccessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL,
            refresh_token: newRefreshToken,
            scope: effectiveScopes.join(' '),
        };
    }
    async verifyAccessToken(token) {
        const accessCol = await this.accessTokensCol();
        const stored = await accessCol.findOne({ _id: token });
        if (!stored)
            throw new Error('Invalid access token');
        const expiresAtEpoch = Math.floor(stored.expires_at.getTime() / 1000);
        if (expiresAtEpoch < Math.floor(Date.now() / 1000)) {
            await accessCol.deleteOne({ _id: token });
            throw new Error('Access token expired');
        }
        return {
            token: stored._id,
            clientId: stored.client_id,
            scopes: stored.scopes,
            expiresAt: expiresAtEpoch,
            // The one channel server.ts trusts for per-user scoping (see server.ts).
            extra: { email: stored.email },
        };
    }
    async revokeToken(_client, request) {
        await Promise.all([
            (await this.accessTokensCol()).deleteOne({ _id: request.token }),
            (await this.refreshTokensCol()).deleteOne({ _id: request.token }),
        ]);
    }
}
//# sourceMappingURL=auth-provider.js.map