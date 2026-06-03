/**
 * Supabase-backed OAuth 2.1 provider for the MCP SDK.
 * Implements OAuthServerProvider + OAuthRegisteredClientsStore.
 *
 * authorize() NÃO auto-aprova: delega ao GoogleBroker, que prova a identidade
 * (login Google + allowlist de e-mail) antes de qualquer code ser emitido. O code
 * MCP só é gerado em issueMcpCode(), chamado pelo callback do Google após verificação.
 *
 * Exported names são mantidos por compat (InMemoryOAuthProvider / InMemoryClientsStore).
 *
 * Env vars required:
 *   SUPABASE_URL              — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 */
import type { Response } from 'express';
import type { GoogleBroker, PendingAuth } from './google-broker.js';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
export declare class InMemoryClientsStore implements OAuthRegisteredClientsStore {
    private db;
    constructor();
    getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;
    registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>): Promise<OAuthClientInformationFull>;
}
export declare class InMemoryOAuthProvider implements OAuthServerProvider {
    readonly clientsStore: InMemoryClientsStore;
    private db;
    private readonly broker;
    constructor(broker: GoogleBroker);
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    /**
     * Emite o auth code MCP DEPOIS que a identidade foi provada no Google.
     * CONTRATO: só pode ser chamado pelo callback do Google, com o `pending` retornado
     * por `GoogleBroker.verifyCallback()` (que já validou e-mail + assinatura). NÃO chame
     * direto de nenhum outro lugar — isso bypassaria o gate de identidade.
     */
    issueMcpCode(pending: PendingAuth, res: Response): Promise<void>;
    challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string>;
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens>;
    exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens>;
    verifyAccessToken(token: string): Promise<AuthInfo>;
    revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void>;
}
//# sourceMappingURL=auth-provider.d.ts.map