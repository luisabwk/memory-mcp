/**
 * Supabase-backed OAuth 2.1 provider for the MCP SDK.
 * Implements OAuthServerProvider + OAuthRegisteredClientsStore.
 * Auto-approves authorization requests (personal server).
 *
 * Drop-in replacement for the original in-memory version.
 * Exported names are intentionally kept identical so index-http.ts
 * requires zero changes.
 *
 * Env vars required:
 *   SUPABASE_URL              — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const ACCESS_TOKEN_TTL = 3600; // 1 hour in seconds
const AUTH_CODE_TTL = 300; // 5 minutes in seconds
// ---------------------------------------------------------------------------
// Supabase client (singleton — shared by both classes)
// ---------------------------------------------------------------------------
function buildSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
let _supabase = null;
function getSupabase() {
    if (!_supabase)
        _supabase = buildSupabaseClient();
    return _supabase;
}
// ---------------------------------------------------------------------------
// SupabaseClientsStore (exported as InMemoryClientsStore for backward compat)
// ---------------------------------------------------------------------------
export class InMemoryClientsStore {
    db;
    constructor() {
        this.db = getSupabase();
    }
    async getClient(clientId) {
        const { data, error } = await this.db
            .from('oauth_clients')
            .select('client_data')
            .eq('client_id', clientId)
            .maybeSingle();
        if (error)
            throw new Error(`getClient DB error: ${error.message}`);
        if (!data)
            return undefined;
        return data.client_data;
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
        const { error } = await this.db
            .from('oauth_clients')
            .insert({ client_id: clientId, client_data: full });
        if (error)
            throw new Error(`registerClient DB error: ${error.message}`);
        return full;
    }
}
// ---------------------------------------------------------------------------
// SupabaseOAuthProvider (exported as InMemoryOAuthProvider for backward compat)
// ---------------------------------------------------------------------------
export class InMemoryOAuthProvider {
    clientsStore;
    db;
    constructor() {
        this.db = getSupabase();
        this.clientsStore = new InMemoryClientsStore();
    }
    async authorize(client, params, res) {
        const code = `code_${randomBytes(24).toString('hex')}`;
        const now = Math.floor(Date.now() / 1000);
        const { error } = await this.db.from('oauth_auth_codes').insert({
            code,
            client_id: client.client_id,
            code_challenge: params.codeChallenge,
            redirect_uri: params.redirectUri,
            scopes: params.scopes ?? [],
            expires_at: new Date((now + AUTH_CODE_TTL) * 1000).toISOString(),
        });
        if (error)
            throw new Error(`authorize DB error: ${error.message}`);
        const redirectUrl = new URL(params.redirectUri);
        redirectUrl.searchParams.set('code', code);
        if (params.state) {
            redirectUrl.searchParams.set('state', params.state);
        }
        res.redirect(redirectUrl.toString());
    }
    async challengeForAuthorizationCode(_client, authorizationCode) {
        const { data, error } = await this.db
            .from('oauth_auth_codes')
            .select('code_challenge')
            .eq('code', authorizationCode)
            .maybeSingle();
        if (error)
            throw new Error(`challengeForAuthorizationCode DB error: ${error.message}`);
        if (!data)
            throw new Error('Authorization code not found');
        return data.code_challenge;
    }
    async exchangeAuthorizationCode(client, authorizationCode) {
        const { data, error } = await this.db
            .from('oauth_auth_codes')
            .select('*')
            .eq('code', authorizationCode)
            .maybeSingle();
        if (error)
            throw new Error(`exchangeAuthorizationCode DB error: ${error.message}`);
        if (!data)
            throw new Error('Authorization code not found');
        const stored = data;
        if (stored.client_id !== client.client_id)
            throw new Error('Client mismatch');
        if (new Date(stored.expires_at).getTime() < Date.now()) {
            await this.db.from('oauth_auth_codes').delete().eq('code', authorizationCode);
            throw new Error('Authorization code expired');
        }
        const now = Math.floor(Date.now() / 1000);
        const accessToken = `at_${randomBytes(32).toString('hex')}`;
        const refreshToken = `rt_${randomBytes(32).toString('hex')}`;
        // Insert tokens before deleting the code — if inserts fail, code remains
        // usable on retry (no permanent lockout).
        const { error: atError } = await this.db.from('oauth_access_tokens').insert({
            token: accessToken,
            client_id: client.client_id,
            scopes: stored.scopes,
            expires_at: new Date((now + ACCESS_TOKEN_TTL) * 1000).toISOString(),
        });
        if (atError)
            throw new Error(`insert access token DB error: ${atError.message}`);
        const { error: rtError } = await this.db.from('oauth_refresh_tokens').insert({
            token: refreshToken,
            client_id: client.client_id,
            scopes: stored.scopes,
            expires_at: null,
        });
        if (rtError)
            throw new Error(`insert refresh token DB error: ${rtError.message}`);
        await this.db.from('oauth_auth_codes').delete().eq('code', authorizationCode);
        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL,
            refresh_token: refreshToken,
            scope: stored.scopes.join(' '),
        };
    }
    async exchangeRefreshToken(client, refreshToken, scopes) {
        const { data, error } = await this.db
            .from('oauth_refresh_tokens')
            .select('*')
            .eq('token', refreshToken)
            .maybeSingle();
        if (error)
            throw new Error(`exchangeRefreshToken DB error: ${error.message}`);
        if (!data)
            throw new Error('Refresh token not found');
        const stored = data;
        if (stored.client_id !== client.client_id)
            throw new Error('Client mismatch');
        const now = Math.floor(Date.now() / 1000);
        const newAccessToken = `at_${randomBytes(32).toString('hex')}`;
        const newRefreshToken = `rt_${randomBytes(32).toString('hex')}`;
        const effectiveScopes = scopes ?? stored.scopes;
        // Insert new tokens before deleting old — if inserts fail, old refresh
        // token remains valid and client can retry without permanent lockout.
        const { error: atError } = await this.db.from('oauth_access_tokens').insert({
            token: newAccessToken,
            client_id: client.client_id,
            scopes: effectiveScopes,
            expires_at: new Date((now + ACCESS_TOKEN_TTL) * 1000).toISOString(),
        });
        if (atError)
            throw new Error(`insert access token DB error: ${atError.message}`);
        const { error: rtError } = await this.db.from('oauth_refresh_tokens').insert({
            token: newRefreshToken,
            client_id: client.client_id,
            scopes: effectiveScopes,
            expires_at: null,
        });
        if (rtError)
            throw new Error(`insert refresh token DB error: ${rtError.message}`);
        await this.db.from('oauth_refresh_tokens').delete().eq('token', refreshToken);
        return {
            access_token: newAccessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL,
            refresh_token: newRefreshToken,
            scope: effectiveScopes.join(' '),
        };
    }
    async verifyAccessToken(token) {
        const { data, error } = await this.db
            .from('oauth_access_tokens')
            .select('*')
            .eq('token', token)
            .maybeSingle();
        if (error)
            throw new Error(`verifyAccessToken DB error: ${error.message}`);
        if (!data)
            throw new Error('Invalid access token');
        const stored = data;
        const expiresAtEpoch = Math.floor(new Date(stored.expires_at).getTime() / 1000);
        if (expiresAtEpoch < Math.floor(Date.now() / 1000)) {
            await this.db.from('oauth_access_tokens').delete().eq('token', token);
            throw new Error('Access token expired');
        }
        return {
            token: stored.token,
            clientId: stored.client_id,
            scopes: stored.scopes,
            expiresAt: expiresAtEpoch,
        };
    }
    async revokeToken(_client, request) {
        await Promise.all([
            this.db.from('oauth_access_tokens').delete().eq('token', request.token),
            this.db.from('oauth_refresh_tokens').delete().eq('token', request.token),
        ]);
    }
}
//# sourceMappingURL=auth-provider.js.map