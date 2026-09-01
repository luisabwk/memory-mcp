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
import { randomUUID } from 'node:crypto';
const COLLECTION = 'memories';
/** Must match the index built by scripts/setup-mongo-indexes.ts. */
export const VECTOR_INDEX_NAME = 'memories_vector_index';
function toMemory(doc) {
    return {
        id: doc._id,
        content: doc.content,
        embedding: doc.embedding,
        sector: doc.sector,
        source_type: doc.source_type,
        source_path: doc.source_path,
        project_name: doc.project_name,
        repository_url: doc.repository_url,
        metadata: doc.metadata ?? {},
        tags: doc.tags ?? [],
        created_at: doc.created_at.toISOString(),
        updated_at: doc.updated_at.toISOString(),
        last_accessed_at: doc.last_accessed_at ? doc.last_accessed_at.toISOString() : undefined,
        access_count: doc.access_count,
        user_id: doc.user_id,
    };
}
export class MongoMemoryService {
    db;
    constructor(db) {
        this.db = db;
    }
    col() {
        return this.db.collection(COLLECTION);
    }
    async storeMemory(memory) {
        if (!memory.user_id)
            throw new Error('storeMemory: user_id is required');
        const now = new Date();
        const doc = {
            _id: randomUUID(),
            content: memory.content,
            embedding: memory.embedding,
            sector: memory.sector ?? 'semantic',
            source_type: memory.source_type,
            source_path: memory.source_path,
            project_name: memory.project_name,
            repository_url: memory.repository_url,
            metadata: memory.metadata ?? {},
            tags: memory.tags ?? [],
            created_at: now,
            updated_at: now,
            last_accessed_at: undefined,
            access_count: 0,
            user_id: memory.user_id,
        };
        await this.col().insertOne(doc);
        return toMemory(doc);
    }
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
    async queryMemories(params, queryEmbedding) {
        const { limit = 10, min_score = 0.4, sector, source_type, source_path, project_name, tags, user_id, } = params;
        if (!user_id)
            throw new Error('queryMemories: user_id is required');
        const filterClauses = [{ user_id: { $eq: user_id } }];
        if (sector)
            filterClauses.push({ sector: { $eq: sector } });
        if (source_type)
            filterClauses.push({ source_type: { $eq: source_type } });
        if (source_path)
            filterClauses.push({ source_path: { $eq: source_path } });
        if (project_name)
            filterClauses.push({ project_name: { $eq: project_name } });
        if (tags && tags.length > 0)
            filterClauses.push({ tags: { $all: tags } });
        const pipeline = [
            {
                $vectorSearch: {
                    index: VECTOR_INDEX_NAME,
                    path: 'embedding',
                    queryVector: queryEmbedding,
                    // Wide candidate pool relative to `limit` so post-filtering by user_id/sector/etc.
                    // (declared as pre-filters here, not post-filters — see setup-mongo-indexes.ts)
                    // still returns enough matches. Floor of 100 keeps small `limit` values sane.
                    numCandidates: Math.max(limit * 20, 100),
                    limit,
                    filter: { $and: filterClauses },
                },
            },
            { $addFields: { similarity: { $meta: 'vectorSearchScore' } } },
            { $match: { similarity: { $gte: min_score } } },
        ];
        const docs = await this.col().aggregate(pipeline).toArray();
        return docs.map((d) => ({ ...toMemory(d), similarity: d.similarity }));
    }
    async listMemories(params) {
        const { sector, source_type, source_path, project_name, tags, limit = 50, offset = 0, order_by = 'created_at', order = 'desc', user_id, } = params;
        if (!user_id)
            throw new Error('listMemories: user_id is required');
        const filter = { user_id };
        if (sector)
            filter.sector = sector;
        if (source_type)
            filter.source_type = source_type;
        if (source_path)
            filter.source_path = source_path;
        if (project_name)
            filter.project_name = project_name;
        if (tags && tags.length > 0)
            filter.tags = { $all: tags };
        const sortDir = order === 'asc' ? 1 : -1;
        const [docs, total] = await Promise.all([
            this.col().find(filter).sort({ [order_by]: sortDir }).skip(offset).limit(limit).toArray(),
            this.col().countDocuments(filter),
        ]);
        return { memories: docs.map(toMemory), total };
    }
    /** Scoped by user_id: a memory owned by another user resolves as not-found, not as a cross-user leak. */
    async getMemory(id, user_id) {
        if (!user_id)
            throw new Error('getMemory: user_id is required');
        const doc = await this.col().findOne({ _id: id, user_id });
        if (!doc)
            throw new Error(`Failed to get memory: not found`);
        await this.updateAccessTracking(id, user_id);
        const refreshed = await this.col().findOne({ _id: id, user_id });
        return toMemory(refreshed ?? doc);
    }
    async reinforceMemory(id, user_id) {
        if (!user_id)
            throw new Error('reinforceMemory: user_id is required');
        await this.updateAccessTracking(id, user_id);
        const doc = await this.col().findOne({ _id: id, user_id });
        if (!doc)
            throw new Error(`Failed to reinforce memory: not found`);
        return toMemory(doc);
    }
    async updateAccessTracking(id, user_id) {
        await this.col().updateOne({ _id: id, user_id }, { $set: { last_accessed_at: new Date() }, $inc: { access_count: 1 } });
    }
}
//# sourceMappingURL=mongo-memory.js.map