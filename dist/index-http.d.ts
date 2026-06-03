#!/usr/bin/env node
/**
 * memory-mcp Server (Streamable HTTP + OAuth 2.1)
 * Serves MCP over HTTP com OAuth 2.1 (DCR + PKCE), gateado por login Google (allowlist).
 * Required for claude.ai remote MCP integration.
 *
 * Duas portas: PUBLIC_PORT (roteada pelo Traefik, só OAuth bearer) e INTERNAL_PORT
 * (só rede Docker, aceita MEMORY_SERVICE_TOKEN para clientes headless).
 *
 * MCP sessions: one StreamableHTTPServerTransport + McpServer per client session
 * (map keyed by mcp-session-id). A single global transport breaks all clients after
 * the first initialize ("Server already initialized").
 */
export {};
//# sourceMappingURL=index-http.d.ts.map