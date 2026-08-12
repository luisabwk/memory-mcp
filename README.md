# memory-mcp

Persistent, searchable memory for AI agents, exposed over the [Model Context Protocol](https://modelcontextprotocol.io) (MCP).

An agent connected to this server can **store** what it learns and later **recall** it by meaning — across sessions, projects and tools. Memories are embedded, kept in a vector store, and classified into cognitive *sectors* so retrieval stays relevant as the store grows.

Runs as a local stdio server (for desktop MCP clients) or as a remote HTTP server behind OAuth 2.1.

---

## What it does

- **Semantic recall** — memories are stored with embeddings and retrieved by vector similarity, not keyword match.
- **Cognitive sectors** — each memory is tagged as `episodic`, `semantic`, `procedural`, `emotional` or `reflective`. If you don't set one, it's classified automatically.
- **Scoping** — filter by `source_type` (`vault` / `repo` / `global`), `project_name` and `tags`, so one store can serve many contexts without them bleeding into each other.
- **Access tracking** — every read updates an access counter, so frequently used memories can be surfaced or reinforced.
- **Two transports** — stdio for local clients (e.g. Claude Desktop) and Streamable HTTP for a hosted deployment.

## MCP tools

| Tool | What it does |
|---|---|
| `memory_store` | Store a memory. Auto-generates the embedding and classifies the sector when omitted. |
| `memory_query` | Semantic search by vector similarity, with optional filters and a minimum score. |
| `memory_list` | List memories with filters, ordering and pagination (no similarity scoring). |
| `memory_get` | Fetch one memory by id; updates its access tracking. |
| `memory_reinforce` | Increment a memory's access count to mark it as important. |

## How it works

```
MCP client ──► memory-mcp ──► embeddings (OpenAI-compatible) ──► Supabase (Postgres + pgvector)
                   │
                   ├─ stdio transport ....... local clients
                   └─ Streamable HTTP ....... remote, OAuth 2.1 (public) + service token (internal)
```

- **Embeddings:** the OpenAI SDK pointed at an OpenAI-compatible endpoint (OpenRouter by default), using `text-embedding-3-small` (1536 dimensions).
- **Storage:** Supabase (Postgres + `pgvector`) holds the memories and serves similarity search.
- **Auth (HTTP mode):** OAuth 2.1 with PKCE and Dynamic Client Registration; tokens are persisted in Supabase. A Google identity broker gates the authorization step by an allow-list of e-mails. The HTTP server also opens an internal port that accepts a static service token for headless clients.

## Getting started

Requirements: Node.js ≥ 18, a Supabase project with `pgvector` enabled, and an OpenAI-compatible API key.

```bash
# 1. install
npm ci

# 2. configure — copy the example and fill in the values
cp .env.example .env

# 3. apply the SQL migration (OAuth state tables) to your Supabase project
#    src/migrations/001_oauth_state.sql

# 4. build
npm run build

# 5a. run locally over stdio (for a desktop MCP client)
npm start

# 5b. or run the HTTP server
npm run start:http
```

### Configuration

All secrets live in `.env` (never committed). See [`.env.example`](./.env.example) for the full list — the essentials:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Memory storage and OAuth tables. |
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` | Embedding generation (OpenAI-compatible endpoint). |
| `BASE_URL`, `PORT`, `INTERNAL_PORT` | HTTP server (public port routed by the proxy; internal port for the service token). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS` | Google identity broker that gates `/authorize`. |
| `MEMORY_SERVICE_TOKEN` | Static token for headless clients on the internal port. |

## Project structure

```
src/
  index.ts            stdio entrypoint
  index-http.ts       Streamable HTTP entrypoint (public + internal ports)
  server.ts           MCP server: tool registration and dispatch
  auth-provider.ts    OAuth 2.1 provider (PKCE, DCR, token store)
  google-broker.ts    Google identity gate for /authorize
  mcp-auth.ts         bearer/token middleware
  services/
    embeddings.ts     embedding generation
    supabase.ts       storage + vector search
    classifier.ts     automatic sector classification
  tools/              store · query · list · get · reinforce
  types/memory.ts     memory model and types
  migrations/         SQL (OAuth state)
```

## Scripts

```bash
npm run build      # compile TypeScript to dist/
npm run dev        # compile in watch mode
npm test           # run tests (vitest)
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## License

MIT — see [LICENSE](./LICENSE).
