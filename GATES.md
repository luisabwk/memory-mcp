# GATES — memory-mcp: per-user separation + Mongo migration

## Leaf 0 — Re-verify architecture claims and Mongo vector search research (COMPLETE)

- [x] G1: Every architectural claim in the task brief about the current codebase is confirmed by reading the actual source, not trusted from the brief.
      Evidence (manual): read src/google-broker.ts, auth-provider.ts, mcp-auth.ts, server.ts,
      types/memory.ts, services/supabase.ts, services/embeddings.ts, tools/*.ts, migrations/001_oauth_state.sql,
      .env.example. All claims confirmed accurate:
      - GoogleBroker.verifyCallback() destructures email out via `{ createdAt: _createdAt, ...rest }` — email never returned (google-broker.ts:102-103).
      - auth-provider.ts token lifecycle (issueMcpCode/exchangeAuthorizationCode/exchangeRefreshToken/verifyAccessToken) carries only client_id + scopes, no identity, across 4 Supabase tables.
      - mcp-auth.ts service-token bypass returns AuthInfo with no identity (clientId: 'internal-service').
      - server.ts CallToolRequestSchema handler signature is `async (request) => {...}` — second `extra` param not present at all (confirmed, matches brief).
      - types/memory.ts Memory.user_id?: string exists and is unused; MemoryInsert.user_id?: string exists and unused by any tool.
      - services/supabase.ts queryMemories() calls RPC `match_memories(...)` whose SQL body is absent from the repo (only OAuth tables are in migrations/001_oauth_state.sql).
      - tools/{store,get,list,query,reinforce}.ts pass client args straight through, no identity awareness anywhere.

- [x] G2: Mongo self-hosted vector search claims re-verified against current (Sept 2026) docs, corrections identified.
      Evidence (manual, WebFetch against mongodb.com/docs): the prior session's research needs correction —
      MongoDB Server 8.2 is now past end-of-life for Search/Vector Search; **8.3.4+ is the current minimum**
      (not 8.2+ as previously reported). GA is confirmed as of mongot 1.70.1+. mongot is a genuinely separate
      process from mongod (not a flag); self-managed deployments run **two mongot processes per replica set**,
      and mongod must run as a replica set even for a single node. Community Edition supports Linux
      tarball, Docker container, and Kubernetes Operator — no SSPL commercial requirement found for
      Community. Filtering by a field (e.g. user_id) alongside $vectorSearch requires declaring that field
      as `{"type": "filter", "path": "user_id"}` in the search index definition, then passing
      `filter: {"user_id": "..."}` in the $vectorSearch stage — this is pre-filter (applied before the HNSW
      traversal), which is exactly the mechanism needed for per-user scoping in Layer 5.

- [x] G3: Repo workflow convention checked, not assumed.
      Evidence: `gh pr list --state all` shows 3 PRs (2 merged, 1 draft) against a mix of direct-to-main
      commits (fix:, chore:) with no branch protection on main (`gh api .../branches/main/protection` → 404).
      Convention is mixed, not strictly PR-only, but PRs are used for larger/riskier changes
      (feat/google-auth-broker was PR #2). A public repo carrying a security-sensitive auth rewrite +
      DB migration should go through a PR regardless of what's technically allowed, given no branch
      protection means a raw push to main is a single mistake from being live in production.

## Leaf 1–5 (identity capture → vector search scoping) — UNBLOCKED, implemented

All four blockers were resolved by the coordinator relaying Lu's answers, and independently
re-verified against the live Supabase project (`hextpmkszdcmoetxdpyz`, "memory-mcp") via the
Supabase MCP before being trusted — see below.

- [x] G4: Guilherme's email (guilhermeconter@gmail.com) added to ALLOWED_EMAILS alongside Lu's
      (.env.example), covered by google-broker tests (allowlist is generic, not email-specific).
- [x] G5: Internal service-token bypass maps to Lu's identity by default (SERVICE_TOKEN_USER_EMAIL).
      Evidence: src/mcp-auth.ts + src/mcp-auth.test.ts ("aceita service token... com extra: { email }").
      index-http.ts fails startup if MEMORY_SERVICE_TOKEN is set without SERVICE_TOKEN_USER_EMAIL.
- [x] G6: Full OAuth-state consolidation into Mongo. Evidence: src/auth-provider.ts rewritten against
      4 Mongo collections (oauth_clients/oauth_auth_codes/oauth_access_tokens/oauth_refresh_tokens),
      TTL indexes in scripts/setup-mongo-indexes.mjs replace the old pg_cron purge job.
- [x] G7: Live Supabase data independently re-queried via the Supabase MCP (list_tables, execute_sql on
      pg_proc) — NOT trusted from the coordinator's paste alone. Row counts, `memories` schema, and the
      full `match_memories` function body all matched exactly. Found in the process, not in the original
      brief: a hardcoded webhook secret in `notify_graphiti_bridge_on_memory_insert` (flagged to Lu,
      not fixed — out of scope) and a live dependency on that trigger's POST to graphiti-bridge.bloko.dev
      (addressed — see G11).

- [x] G8: Identity threading (Layers 1-3). Evidence: `npx vitest run` — 39/39 tests pass across
      google-broker.test.ts (email survives verifyCallback, case-insensitive), auth-provider.test.ts
      (email threads code → access token → refresh token → AuthInfo.extra.email, verified against a
      fake Mongo double), server.test.ts (8 cases on resolveUserId: OAuth identity, service-token
      identity, stdio fallback, and every unsafe path — missing email, non-string email, no auth at
      all — refuses rather than guessing).
      CHECK: cd /Users/luisabarwinski/Documents/GitHub/memory-mcp && npx vitest run
      EXPECT: "Test Files  4 passed (4)" and "Tests  39 passed (39)"

- [x] G9: Scoping (Layer 4). Evidence: src/services/mongo-memory.ts — every method (storeMemory,
      queryMemories, listMemories, getMemory, reinforceMemory) requires user_id and filters/tags by it;
      getMemory/reinforceMemory scope the Mongo filter itself (`{ _id: id, user_id }`) so another user's
      memory resolves as not-found, not a leak. src/tools/*.ts take userId as a second, non-optional
      parameter never sourced from `input`.

- [x] G10: Vector search scoping (Layer 5) is correctly wired in code. Evidence: src/services/mongo-memory.ts
      queryMemories() builds a $vectorSearch pre-filter (`filter: { $and: [...] }`) including user_id,
      matching the "filter"-typed fields declared in scripts/setup-mongo-indexes.mjs's vector index
      definition (re-verified against current MongoDB docs: pre-filter requires the field declared as
      `{type: "filter", path: ...}` in the index — not assumed, checked).
      KNOWN GAP, documented not hidden: MongoDB does not publish the exact cosine→vectorSearchScore
      formula, so min_score thresholds tuned against the old Postgres `1 - cosine_distance` (0.4/0.7)
      are NOT guaranteed equivalent here — see the doc-comment on queryMemories(). Recalibrate
      empirically post-migration; do not assume parity.
      CHECK: cd /Users/luisabarwinski/Documents/GitHub/memory-mcp && grep -n "type: 'filter', path: 'user_id'" scripts/setup-mongo-indexes.mjs && grep -n "user_id: { \$eq: user_id }" src/services/mongo-memory.ts
      EXPECT: /type: 'filter', path: 'user_id'/

- [ ] G10-live: a real memory_query call against a live mongot-backed cluster returns zero cross-user results.
      EVIDENCE: pending

- [x] G11: graphiti-bridge continuity. Evidence: src/services/graphiti-bridge.ts reproduces the old
      trigger's POST (same URL, same payload shape) from the application layer (called from
      tools/store.ts after every successful store), non-blocking on failure like the original
      `exception when others`. Secret moved to GRAPHITI_BRIDGE_WEBHOOK_SECRET env var — the leaked
      hardcoded value is deliberately NOT reused; Lu must set a freshly rotated secret.

- [x] G12: Migration script exists, is idempotent-by-design, and is syntactically valid. Evidence:
      scripts/migrate-supabase-to-mongo.mjs — dry-run by default, migrates `memories` (backfilling
      user_id to Lu's email, asserting every source row is currently unowned before doing so — refuses
      instead of assuming) and `oauth_clients` only; explicitly does NOT migrate OAuth tokens/codes (no
      identity in the old schema — forces one clean re-login per client post-cutover) or
      entities/entity_memories/inbox_items (no code in this repo touches them; external-service contract
      unknown — flagged to Lu, not guessed). Idempotent (upsert on original UUID). Independently
      re-counts Mongo after writing rather than trusting the write call's own report.
      CHECK: cd /Users/luisabarwinski/Documents/GitHub/memory-mcp && node --check scripts/migrate-supabase-to-mongo.mjs && node --check scripts/setup-mongo-indexes.mjs && echo SCRIPTS_OK
      EXPECT: SCRIPTS_OK

- [ ] G12-live: migration script has been run (dry-run then --apply) against the live Supabase project
      and the real Mongo instance, and post-migration counts were verified to match.
      EVIDENCE: pending

- [x] G13: Repo-wide DoD. Evidence:
      CHECK: cd /Users/luisabarwinski/Documents/GitHub/memory-mcp && npm run typecheck && npm run lint && npx vitest run && npm run build
      EXPECT: all four exit 0; observed — typecheck clean, lint clean (eslint.config.js was missing
      entirely on main; added, since the lint script already existed and the deps were already
      installed — pre-existing gap, not introduced here, fixed because it's on the DoD path), 39/39
      tests pass, build produces dist/ with no errors.

ABANDON: G10-live cannot execute a live vector-search query end-to-end without a provisioned mongot-backed MongoDB instance, which requires VPS/Coolify access this environment does not have (no SSH/Coolify MCP tool available). Static verification (index definition, filter construction, unit tests) is complete; this is a required handoff — run scripts/setup-mongo-indexes.mjs then a real memory_query for two different users and confirm zero cross-user results before trusting it in production.
ABANDON: G12-live same VPS/Coolify access gap as G10-live — the script has not been executed end-to-end against live data in this environment, only syntax-checked and reviewed. Required handoff: run `npm run migrate:supabase-to-mongo` (dry run) then `-- --apply` once the Mongo instance exists, and verify the printed post-migration counts.

## Handoffs for Lu (not implementer decisions — surfaced, not resolved silently)

1. **Provision the dedicated Mongo instance** (MongoDB 8.3.4+, replica set even single-node, mongot
   deployed and reachable from mongod) — isolated from the existing credit-workflow Mongo. Then run
   `npm run setup:mongo-indexes` and `npm run migrate:supabase-to-mongo -- --apply`.
2. **Rotate the graphiti-bridge webhook secret.** The one hardcoded in the old trigger function body
   (`notify_graphiti_bridge_on_memory_insert`) is exposed to anyone who can read `pg_proc` — and per the
   Supabase security advisor, that function is SECURITY DEFINER and anon-callable. Set a new value in
   GRAPHITI_BRIDGE_WEBHOOK_SECRET; do not reuse the old one.
3. **entities / entity_memories / inbox_items are not migrated.** Nothing in this repo touches them —
   they appear to belong to an external "graphiti-bridge" service this task has no visibility into.
   Decide separately whether/how those move, with that service's actual read/write contract in hand.
4. **All existing OAuth sessions (including claude.ai's) will need to re-login once** after cutover —
   deliberate, since old tokens carry no identity to preserve.
5. **min_score is not numerically equivalent** between the old Postgres RPC and the new Mongo
   $vectorSearch score — recalibrate empirically once real queries can run against both.
