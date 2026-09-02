#!/usr/bin/env node
/**
 * One-time data migration: Supabase (Postgres + pgvector) → MongoDB.
 *
 * Scope, deliberately narrow:
 *   - `memories` (600 rows as of 2026-09-01) — migrated, with user_id backfilled to
 *     Lu's email for every row (all pre-date Guilherme; assumption is asserted below,
 *     not assumed silently — see assertAllUserIdNull()).
 *   - `oauth_clients` (90 rows) — migrated as-is, so already-registered MCP clients
 *     (e.g. claude.ai's DCR registration) don't have to re-register.
 *
 * Deliberately NOT migrated:
 *   - `oauth_auth_codes` / `oauth_access_tokens` / `oauth_refresh_tokens` — none of
 *     these carry an identity in the old schema (email was discarded at the Google
 *     callback — see google-broker.ts's prior behavior). Carrying them forward would
 *     mean live sessions with no owner, which the new server.ts explicitly refuses to
 *     serve. Every existing session (including claude.ai's) will need to redo the
 *     Google login once after cutover — a one-time, low-friction event, and the
 *     correct outcome of a security model change, not a bug.
 *   - `entities` / `entity_memories` / `inbox_items` (graph/inbox feature) — nothing
 *     in this repo's code reads or writes these tables; they appear to be written by
 *     an external service (graphiti-bridge). Migrating them without that service's
 *     read/write contract risks silently breaking it. Flagged back to Lu, not decided
 *     here.
 *   - `recordings` / `transcription_segments` / `transcriptions` / `workflows` /
 *     `audit_logs` — confirmed zero references anywhere in this repo; unrelated
 *     project sharing the same Supabase project. Out of scope per Lu's explicit
 *     instruction.
 *
 * Idempotent: uses the original Postgres UUID as the Mongo _id and upserts, so
 * re-running after a partial failure does not duplicate rows.
 *
 * Usage:
 *   node scripts/migrate-supabase-to-mongo.mjs            # dry run (default)
 *   node scripts/migrate-supabase-to-mongo.mjs --apply     # actually writes to Mongo
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MONGODB_URI, MONGODB_DB.
 */

import { createClient } from '@supabase/supabase-js';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const OWNER_EMAIL = process.env.MIGRATION_OWNER_EMAIL || 'luisa.barwinski@gmail.com';
const PAGE_SIZE = 500;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const mongoUri = requireEnv('MONGODB_URI');
const mongoDbName = requireEnv('MONGODB_DB');

async function fetchAllPages(table, columns) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

/**
 * Rule 3 (analise-quantitativa): what the code assumes about the source becomes an
 * assertion at load time. We assume every existing memory pre-dates Guilherme and
 * has no owner set — assert it instead of assuming it, so a surprise non-null
 * user_id (e.g. from a half-finished earlier attempt at this same migration) fails
 * loudly instead of getting silently overwritten.
 */
function assertAllUserIdNull(memories) {
  const withOwner = memories.filter((m) => m.user_id !== null && m.user_id !== undefined);
  if (withOwner.length > 0) {
    throw new Error(
      `Refusing to backfill: ${withOwner.length} of ${memories.length} memories already have a ` +
      `non-null user_id (ids: ${withOwner.slice(0, 5).map((m) => m.id).join(', ')}${withOwner.length > 5 ? ', ...' : ''}). ` +
      `Investigate before re-running — this migration only backfills rows it expects to be unowned.`,
    );
  }
}

/**
 * Supabase's pgvector column comes back from supabase-js as a string
 * ("[0.1,0.2,...]"), not a numeric array — confirmed against the real project
 * (all 601 rows) during the actual migration run. $vectorSearch requires a real
 * BSON array of doubles, so a raw string embedding silently passes this script
 * (no type check) and only fails later, opaquely, inside mongot. Parse it
 * explicitly instead of trusting the shape, and fail loudly if it isn't what we
 * expect (Rule 3, analise-quantitativa: what the code assumes about the source
 * becomes an assertion at load time).
 */
function parseEmbedding(raw) {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`Parsed embedding is not an array: ${raw.slice(0, 50)}`);
    return parsed.map(Number);
  }
  throw new Error(`Unexpected embedding type: ${typeof raw}`);
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to Mongo)' : 'DRY RUN (no writes — pass --apply to write)'}`);
  console.log(`Backfilling ownership to: ${OWNER_EMAIL}`);

  // --- memories ---
  const memories = await fetchAllPages(
    'memories',
    'id,content,embedding,sector,source_type,source_path,project_name,repository_url,metadata,tags,created_at,updated_at,last_accessed_at,access_count,user_id',
  );
  console.log(`Fetched ${memories.length} rows from Supabase "memories".`);
  assertAllUserIdNull(memories);

  // --- oauth_clients ---
  const clients = await fetchAllPages('oauth_clients', 'client_id,client_data,created_at');
  console.log(`Fetched ${clients.length} rows from Supabase "oauth_clients".`);

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to write these rows to Mongo.');
    return;
  }

  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const db = mongoClient.db(mongoDbName);

  const memoriesCol = db.collection('memories');
  const memoryOps = memories.map((m) => ({
    replaceOne: {
      filter: { _id: m.id },
      replacement: {
        _id: m.id,
        content: m.content,
        embedding: parseEmbedding(m.embedding),
        sector: m.sector,
        source_type: m.source_type,
        source_path: m.source_path ?? undefined,
        project_name: m.project_name ?? undefined,
        repository_url: m.repository_url ?? undefined,
        metadata: m.metadata ?? {},
        tags: m.tags ?? [],
        created_at: new Date(m.created_at),
        updated_at: new Date(m.updated_at),
        last_accessed_at: m.last_accessed_at ? new Date(m.last_accessed_at) : undefined,
        access_count: m.access_count ?? 0,
        user_id: OWNER_EMAIL,
      },
      upsert: true,
    },
  }));
  if (memoryOps.length > 0) {
    const result = await memoriesCol.bulkWrite(memoryOps, { ordered: false });
    console.log(`memories: upserted ${result.upsertedCount + result.modifiedCount} of ${memories.length} source rows.`);
  }

  const clientsCol = db.collection('oauth_clients');
  const clientOps = clients.map((c) => ({
    replaceOne: {
      filter: { _id: c.client_id },
      replacement: { _id: c.client_id, client_data: c.client_data, created_at: new Date(c.created_at) },
      upsert: true,
    },
  }));
  if (clientOps.length > 0) {
    const result = await clientsCol.bulkWrite(clientOps, { ordered: false });
    console.log(`oauth_clients: upserted ${result.upsertedCount + result.modifiedCount} of ${clients.length} source rows.`);
  }

  // --- Post-migration verification: independent re-count, not a copy of the source number. ---
  const mongoMemoryCount = await memoriesCol.countDocuments({});
  const mongoClientCount = await clientsCol.countDocuments({});
  console.log(`Verification — Mongo now has ${mongoMemoryCount} memories (source had ${memories.length}), ${mongoClientCount} oauth_clients (source had ${clients.length}).`);
  if (mongoMemoryCount < memories.length) {
    console.warn('WARNING: Mongo memories count is lower than source count. Investigate before trusting this migration.');
  }
  if (mongoClientCount < clients.length) {
    console.warn('WARNING: Mongo oauth_clients count is lower than source count. Investigate before trusting this migration.');
  }

  await mongoClient.close();
  console.log('Done. Supabase data was NOT modified or deleted — decommission it only after Lu verifies the Mongo data independently.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
