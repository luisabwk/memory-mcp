/**
 * Shared MCP server setup for octoAgent Memory.
 * Used by both stdio (index.ts) and Streamable HTTP (index-http.ts) entrypoints.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export type IdentityResolution = {
    ok: true;
    userId: string;
} | {
    ok: false;
    error: string;
};
/**
 * The ONLY place tool calls get a user_id from. Never read user_id/email from
 * client-supplied tool arguments — a client (or the LLM driving it) fully controls
 * that payload, so trusting it there would let anyone read/write anyone else's
 * memories just by passing a different email in a tool call.
 *
 * Extracted as a pure function so the identity gate can be unit-tested directly,
 * without spinning up a Server/Mongo/embeddings stack — see server.test.ts.
 */
export declare function resolveUserId(authInfo: {
    extra?: Record<string, unknown>;
} | undefined, stdioUserEmail: string | undefined): IdentityResolution;
export interface CreateServerOptions {
    /**
     * Identity to use when the transport has no auth layer at all (stdio only —
     * index.ts). Must come from an explicit, named env var (MEMORY_STDIO_USER_EMAIL),
     * never a hardcoded default: there is no "shared pool" user. Ignored for HTTP,
     * where identity always comes from extra.authInfo.extra.email per-request — see
     * the CallToolRequestSchema handler below.
     */
    stdioUserEmail?: string;
}
export declare function createMemoryMcpServer(opts?: CreateServerOptions): Promise<Server>;
//# sourceMappingURL=server.d.ts.map