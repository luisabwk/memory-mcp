/**
 * MongoDB-backed Memory service.
 * Replaces services/supabase.ts. Method shapes mirror the old SupabaseService
 * 1:1 so tools/*.ts only need to add the trusted `user_id` scoping parameter,
 * not restructure their call sites.
 *
 * Every method requires `user_id` (the caller's authenticated email) and
 * filters/tags every read and write by it — this is the per-user isolation
 * boundary. `user_id` must always come from server.ts's trusted identity
 * injection, never from client-supplied tool arguments.
 */
import type { Db } from 'mongodb';
import type { Memory, MemoryInsert, MemoryQueryParams, MemoryListParams, MemoryQueryResult } from '../types/memory.js';
/** Must match the index built by scripts/setup-mongo-indexes.ts. */
export declare const VECTOR_INDEX_NAME = "memories_vector_index";
export declare class MongoMemoryService {
    private db;
    constructor(db: Db);
    private col;
    storeMemory(memory: MemoryInsert): Promise<Memory>;
    /**
     * Query memories by vector similarity, scoped to user_id.
     *
     * IMPORTANT — score semantics are NOT a drop-in replacement for the old Postgres
     * `match_memories` RPC. That function computed `similarity = 1 - cosine_distance`
     * via pgvector's `<=>` operator. MongoDB's $vectorSearch returns `vectorSearchScore`,
     * documented only as "a fixed range from 0 to 1" — MongoDB does not publish the exact
     * cosine-to-score formula. min_score thresholds tuned against the old Postgres numbers
     * (default 0.4, previously 0.7) are NOT guaranteed to select the same result set here.
     * Re-calibrate min_score empirically against real queries post-migration before
     * trusting it at the old thresholds — do not assume parity.
     */
    queryMemories(params: MemoryQueryParams, queryEmbedding: number[]): Promise<MemoryQueryResult[]>;
    listMemories(params: MemoryListParams): Promise<{
        memories: Memory[];
        total: number;
    }>;
    /** Scoped by user_id: a memory owned by another user resolves as not-found, not as a cross-user leak. */
    getMemory(id: string, user_id: string): Promise<Memory>;
    reinforceMemory(id: string, user_id: string): Promise<Memory>;
    private updateAccessTracking;
}
//# sourceMappingURL=mongo-memory.d.ts.map