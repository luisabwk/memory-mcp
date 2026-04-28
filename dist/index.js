#!/usr/bin/env node
/**
 * octoAgent Memory MCP Server (stdio)
 * Global memory system using Supabase Vector and OpenAI embeddings.
 */
import * as dotenv from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMemoryMcpServer } from './server.js';
dotenv.config();
async function main() {
    const server = await createMemoryMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('octoAgent Memory MCP Server running on stdio');
    console.error(`Supabase: ${process.env.SUPABASE_URL}`);
    console.error(`Embedding Model: ${process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'}`);
    console.error(`Embedding Dimensions: ${process.env.EMBEDDING_DIMENSIONS ?? '1536'}`);
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map