#!/usr/bin/env node
/**
 * One-time setup: creates all indexes memory-mcp needs on the dedicated Mongo
 * instance — regular indexes for OAuth state + memory filters, TTL indexes that
 * replace the old Postgres pg_cron purge job, and the mongot-backed vector search
 * index used by MongoMemoryService.queryMemories().
 *
 * Requires MongoDB Server 8.3.4+ running as a replica set (even single-node) with
 * mongot deployed and reachable — see the deployment notes in .env.example.
 * Run once against a fresh instance, and again any time the index definitions
 * below change (safe to re-run: everything here is idempotent).
 *
 * Usage: MONGODB_URI=... MONGODB_DB=... node scripts/setup-mongo-indexes.mjs
 */

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error('Missing MONGODB_URI or MONGODB_DB');
  process.exit(1);
}

const VECTOR_INDEX_NAME = 'memories_vector_index';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10);

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log(`Connected to ${dbName}. Creating indexes...`);

  // --- memories: regular indexes for non-vector queries (list/get/reinforce) ---
  const memories = db.collection('memories');
  await memories.createIndexes([
    { key: { user_id: 1, created_at: -1 }, name: 'user_id_created_at' },
    { key: { user_id: 1, sector: 1 }, name: 'user_id_sector' },
    { key: { user_id: 1, source_type: 1 }, name: 'user_id_source_type' },
    { key: { user_id: 1, project_name: 1 }, name: 'user_id_project_name' },
  ]);
  console.log('memories: regular indexes done.');

  // --- memories: vector search index (mongot). Filter fields here must match
  // every field MongoMemoryService.queryMemories() puts in $vectorSearch.filter. ---
  try {
    await memories.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
          { type: 'filter', path: 'user_id' },
          { type: 'filter', path: 'sector' },
          { type: 'filter', path: 'source_type' },
          { type: 'filter', path: 'source_path' },
          { type: 'filter', path: 'project_name' },
        ],
      },
    });
    console.log(`memories: vector search index "${VECTOR_INDEX_NAME}" created (or already existed).`);
  } catch (err) {
    console.error(
      'Failed to create the vector search index. This requires mongot to be deployed and reachable ' +
      'from mongod, and the replica set to be healthy. See .env.example for the deployment prerequisites.',
    );
    throw err;
  }

  // --- OAuth state ---
  await db.collection('oauth_clients').createIndex({ created_at: 1 }, { name: 'created_at' });

  await db.collection('oauth_auth_codes').createIndexes([
    { key: { client_id: 1 }, name: 'client_id' },
    // TTL index: Mongo deletes the document once expires_at is in the past.
    // Replaces the old pg_cron purge job — no cron needed.
    { key: { expires_at: 1 }, name: 'expires_at_ttl', expireAfterSeconds: 0 },
  ]);

  await db.collection('oauth_access_tokens').createIndexes([
    { key: { client_id: 1 }, name: 'client_id' },
    { key: { expires_at: 1 }, name: 'expires_at_ttl', expireAfterSeconds: 0 },
  ]);

  // Refresh tokens have no expiry (expires_at may be null) — TTL indexes ignore
  // documents where the field is missing/null, so this is safe: only ever prunes
  // refresh tokens that are given a real expiry in the future.
  await db.collection('oauth_refresh_tokens').createIndexes([
    { key: { client_id: 1 }, name: 'client_id' },
    { key: { expires_at: 1 }, name: 'expires_at_ttl', expireAfterSeconds: 0 },
  ]);

  console.log('OAuth state: indexes done.');
  console.log('All done.');
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
