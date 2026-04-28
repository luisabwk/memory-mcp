#!/usr/bin/env node
/**
 * octoAgent Memory MCP Server (Streamable HTTP + OAuth 2.1)
 * Serves MCP over HTTP with OAuth 2.1 authentication (DCR + PKCE).
 * Required for claude.ai remote MCP integration.
 *
 * MCP sessions: one StreamableHTTPServerTransport + McpServer per client session
 * (map keyed by mcp-session-id). A single global transport breaks all clients after
 * the first initialize ("Server already initialized").
 */
export {};
//# sourceMappingURL=index-http.d.ts.map