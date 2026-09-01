#!/usr/bin/env node
/**
 * octoAgent Memory MCP Server (stdio)
 * Global memory system using MongoDB Vector Search and OpenAI-compatible embeddings.
 *
 * Stdio has no auth layer at all — there's no HTTP bearer token, no session, no
 * Google login. Per-user scoping (Golden rule: memory-mcp) still requires a named
 * owner for every memory this process touches, so MEMORY_STDIO_USER_EMAIL is
 * required explicitly here rather than silently defaulting to a shared identity.
 * Validated against ALLOWED_EMAILS so a stdio deployment can't write memories
 * under an email nobody has actually verified ownership of.
 */
export {};
//# sourceMappingURL=index.d.ts.map