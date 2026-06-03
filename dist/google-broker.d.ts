export interface PendingAuth {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    scopes: string[];
    state?: string;
}
export declare class BrokerError extends Error {
    status: number;
    constructor(status: number, message: string);
}
export declare class GoogleBroker {
    private oauth;
    private clientId;
    private allowed;
    private pending;
    constructor();
    /** Grava o pedido MCP pendente e devolve a URL de consent do Google. */
    startLogin(pending: PendingAuth): string;
    /**
     * Valida o callback do Google. Devolve o pendente se a identidade for permitida; senão lança BrokerError.
     * NOTA: o `codeChallenge` (PKCE) no PendingAuth NÃO é validado aqui — o Google é usado só como
     * provedor de identidade. O PKCE do fluxo MCP é enforçado pela camada de cima
     * (auth-provider `challengeForAuthorizationCode`/`exchangeAuthorizationCode`).
     */
    verifyCallback(state: string | undefined, code: string | undefined): Promise<PendingAuth>;
    private sweep;
}
//# sourceMappingURL=google-broker.d.ts.map