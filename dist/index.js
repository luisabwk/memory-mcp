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
import * as dotenv from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMemoryMcpServer } from './server.js';
dotenv.config();
function resolveStdioUserEmail() {
    const email = process.env.MEMORY_STDIO_USER_EMAIL;
    if (!email) {
        throw new Error('MEMORY_STDIO_USER_EMAIL is required for the stdio transport (no auth layer exists to derive an owner from).');
    }
    const allowed = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    const normalized = email.trim().toLowerCase();
    if (allowed.length > 0 && !allowed.includes(normalized)) {
        throw new Error(`MEMORY_STDIO_USER_EMAIL (${normalized}) is not in ALLOWED_EMAILS.`);
    }
    return normalized;
}
async function main() {
    const stdioUserEmail = resolveStdioUserEmail();
    const server = await createMemoryMcpServer({ stdioUserEmail });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('octoAgent Memory MCP Server running on stdio');
    console.error(`User: ${stdioUserEmail}`);
    console.error(`MongoDB DB: ${process.env.MONGODB_DB}`);
    console.error(`Embedding Model: ${process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'}`);
    console.error(`Embedding Dimensions: ${process.env.EMBEDDING_DIMENSIONS ?? '1536'}`);
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map