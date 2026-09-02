/**
 * Shared MCP server setup for octoAgent Memory.
 * Used by both stdio (index.ts) and Streamable HTTP (index-http.ts) entrypoints.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { getMongoDb } from './services/mongo.js';
import { MongoMemoryService } from './services/mongo-memory.js';
import { EmbeddingsService } from './services/embeddings.js';
import { SectorClassifier } from './services/classifier.js';
import { MemoryStoreTool } from './tools/store.js';
import { MemoryQueryTool } from './tools/query.js';
import { MemoryListTool } from './tools/list.js';
import { MemoryGetTool } from './tools/get.js';
import { MemoryReinforceTool } from './tools/reinforce.js';

const requiredEnvVars = ['MONGODB_URI', 'MONGODB_DB', 'OPENROUTER_API_KEY'];

function assertEnv(): void {
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`${envVar} is required but not set in environment`);
    }
  }
}

function buildTools(): Tool[] {
  return [
    {
      name: 'memory_store',
      description:
        'Store a new memory in the global memory system. Automatically generates embeddings and can classify sector.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memory content to store' },
          sector: {
            type: 'string',
            enum: ['episodic', 'semantic', 'procedural', 'emotional', 'reflective'],
            description: 'Memory sector (optional, will be auto-classified if not provided)',
          },
          source_type: {
            type: 'string',
            enum: ['vault', 'repo', 'global'],
            description: 'Type of source: vault (project in vaults/), repo (external repository), or global',
          },
          source_path: {
            type: 'string',
            description: 'Path to source (e.g., vaults/work/projects/myproject) - required for vault type',
          },
          project_name: { type: 'string', description: 'Name of the project (e.g., kraken, linear-routing)' },
          repository_url: { type: 'string', description: 'Repository URL - required for repo type' },
          metadata: { type: 'object', description: 'Additional metadata as JSON object' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Array of tags for organization' },
        },
        required: ['content', 'source_type'],
      },
    },
    {
      name: 'memory_query',
      description: 'Query memories using semantic similarity search. Returns most relevant memories based on vector similarity.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          limit: { type: 'number', description: 'Maximum number of results (default: 10, max: 100)', default: 10 },
          min_score: { type: 'number', description: 'Minimum similarity score 0-1 (default: 0.4)', default: 0.4 },
          sector: {
            type: 'string',
            enum: ['episodic', 'semantic', 'procedural', 'emotional', 'reflective'],
            description: 'Filter by memory sector',
          },
          source_type: { type: 'string', enum: ['vault', 'repo', 'global'], description: 'Filter by source type' },
          source_path: { type: 'string', description: 'Filter by specific source path' },
          project_name: { type: 'string', description: 'Filter by project name' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (must contain all specified tags)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'memory_list',
      description: 'List memories with filters and pagination. Returns memories without similarity scoring.',
      inputSchema: {
        type: 'object',
        properties: {
          sector: {
            type: 'string',
            enum: ['episodic', 'semantic', 'procedural', 'emotional', 'reflective'],
            description: 'Filter by memory sector',
          },
          source_type: { type: 'string', enum: ['vault', 'repo', 'global'], description: 'Filter by source type' },
          source_path: { type: 'string', description: 'Filter by specific source path' },
          project_name: { type: 'string', description: 'Filter by project name' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          limit: { type: 'number', description: 'Number of results per page (default: 50, max: 100)', default: 50 },
          offset: { type: 'number', description: 'Number of results to skip (for pagination)', default: 0 },
          order_by: {
            type: 'string',
            enum: ['created_at', 'updated_at', 'last_accessed_at', 'access_count'],
            description: 'Field to order by (default: created_at)',
            default: 'created_at',
          },
          order: { type: 'string', enum: ['asc', 'desc'], description: 'Order direction (default: desc)', default: 'desc' },
        },
      },
    },
    {
      name: 'memory_get',
      description: 'Get a specific memory by its ID. Updates access tracking.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The UUID of the memory to retrieve' } },
        required: ['id'],
      },
    },
    {
      name: 'memory_reinforce',
      description: 'Reinforce a memory by incrementing its access count. Use this to mark important memories.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The UUID of the memory to reinforce' } },
        required: ['id'],
      },
    },
  ];
}

export type IdentityResolution =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * The ONLY place tool calls get a user_id from. Never read user_id/email from
 * client-supplied tool arguments — a client (or the LLM driving it) fully controls
 * that payload, so trusting it there would let anyone read/write anyone else's
 * memories just by passing a different email in a tool call.
 *
 * Extracted as a pure function so the identity gate can be unit-tested directly,
 * without spinning up a Server/Mongo/embeddings stack — see server.test.ts.
 */
export function resolveUserId(
  authInfo: { extra?: Record<string, unknown> } | undefined,
  stdioUserEmail: string | undefined,
): IdentityResolution {
  if (authInfo) {
    // HTTP transport (OAuth bearer or the internal service-token bypass) always
    // carries an AuthInfo. Its `extra.email` is set exclusively by auth-provider.ts
    // (from the Google-verified identity) or mcp-auth.ts (service token → Lu's
    // identity) — never by client input. Missing email here means a bug or a
    // token minted outside those two paths: refuse rather than guess.
    const email = authInfo.extra?.email;
    if (typeof email !== 'string' || email.length === 0) {
      return { ok: false, error: 'Authenticated but no user identity attached to this session. Refusing to guess an owner for this request.' };
    }
    return { ok: true, userId: email };
  }
  if (stdioUserEmail) {
    // True stdio: no auth layer exists at all. Requires an explicit env var set
    // by the operator (see index.ts) — not a fallback default.
    return { ok: true, userId: stdioUserEmail };
  }
  return { ok: false, error: 'No authenticated identity available for this request.' };
}

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

export async function createMemoryMcpServer(opts: CreateServerOptions = {}): Promise<Server> {
  assertEnv();

  const db = await getMongoDb();
  const memoryService = new MongoMemoryService(db);
  // Single provider for the whole stack: OpenRouter. The model must be
  // namespaced (`openai/...`); we normalize a bare model name for back-compat
  // with the existing EMBEDDING_MODEL=text-embedding-3-small env.
  const baseModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const embeddings = new EmbeddingsService({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: baseModel.includes('/') ? baseModel : `openai/${baseModel}`,
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://memory.bloko.dev',
      'X-Title': 'octoAgent Memory MCP',
    },
  });
  const classifier = new SectorClassifier();

  const storeTool = new MemoryStoreTool(memoryService, embeddings, classifier);
  const queryTool = new MemoryQueryTool(memoryService, embeddings);
  const listTool = new MemoryListTool(memoryService);
  const getTool = new MemoryGetTool(memoryService);
  const reinforceTool = new MemoryReinforceTool(memoryService);

  const tools = buildTools();

  const server = new Server(
    { name: 'memory-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;

    const identity = resolveUserId(extra.authInfo, opts.stdioUserEmail);
    if (!identity.ok) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: identity.error }, null, 2) }],
        isError: true,
      };
    }
    const userId = identity.userId;

    try {
      switch (name) {
        case 'memory_store':
          return { content: [{ type: 'text', text: JSON.stringify(await storeTool.execute(args as unknown as Parameters<MemoryStoreTool['execute']>[0], userId), null, 2) }] };
        case 'memory_query':
          return { content: [{ type: 'text', text: JSON.stringify(await queryTool.execute(args as unknown as Parameters<MemoryQueryTool['execute']>[0], userId), null, 2) }] };
        case 'memory_list':
          return { content: [{ type: 'text', text: JSON.stringify(await listTool.execute(args as unknown as Parameters<MemoryListTool['execute']>[0], userId), null, 2) }] };
        case 'memory_get':
          return { content: [{ type: 'text', text: JSON.stringify(await getTool.execute(args as unknown as Parameters<MemoryGetTool['execute']>[0], userId), null, 2) }] };
        case 'memory_reinforce':
          return { content: [{ type: 'text', text: JSON.stringify(await reinforceTool.execute(args as unknown as Parameters<MemoryReinforceTool['execute']>[0], userId), null, 2) }] };
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
