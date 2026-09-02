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
import type { GoogleBroker, VerifiedPendingAuth } from './google-broker.js';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
export declare class InMemoryClientsStore implements OAuthRegisteredClientsStore {
    private dbPromise;
    constructor();
    private col;
    getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;
    registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>): Promise<OAuthClientInformationFull>;
}
export declare class InMemoryOAuthProvider implements OAuthServerProvider {
    readonly clientsStore: InMemoryClientsStore;
    private dbPromise;
    private readonly broker;
    constructor(broker: GoogleBroker);
    private codesCol;
    private accessTokensCol;
    private refreshTokensCol;
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    /**
     * Emite o auth code MCP DEPOIS que a identidade foi provada no Google.
     * CONTRATO: só pode ser chamado pelo callback do Google, com o `pending` retornado
     * por `GoogleBroker.verifyCallback()` (que já validou e-mail + assinatura, e por isso
     * é tipado VerifiedPendingAuth — carrega `email`). NÃO chame direto de nenhum outro
     * lugar — isso bypassaria o gate de identidade.
     */
    issueMcpCode(pending: VerifiedPendingAuth, res: Response): Promise<void>;
    challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string>;
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens>;
    exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens>;
    verifyAccessToken(token: string): Promise<AuthInfo>;
    revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void>;
}
//# sourceMappingURL=auth-provider.d.ts.map