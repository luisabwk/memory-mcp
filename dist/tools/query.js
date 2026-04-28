/**
 * Memory Query Tool
 * Queries memories using vector similarity search
 */
export class MemoryQueryTool {
    supabase;
    embeddings;
    constructor(supabase, embeddings) {
        this.supabase = supabase;
        this.embeddings = embeddings;
    }
    async execute(input) {
        try {
            // Validate input
            this.validateInput(input);
            // Generate query embedding
            const queryEmbedding = await this.embeddings.generateEmbedding(input.query);
            // Prepare query params
            const params = {
                query: input.query,
                limit: input.limit || 10,
                min_score: input.min_score || 0.7,
                sector: input.sector,
                source_type: input.source_type,
                source_path: input.source_path,
                project_name: input.project_name,
                tags: input.tags
            };
            // Query database
            const results = await this.supabase.queryMemories(params, queryEmbedding);
            return {
                success: true,
                memories: results.map(memory => ({
                    id: memory.id,
                    content: memory.content,
                    sector: memory.sector,
                    source_type: memory.source_type,
                    source_path: memory.source_path,
                    project_name: memory.project_name,
                    similarity: memory.similarity,
                    tags: memory.tags,
                    metadata: memory.metadata,
                    created_at: memory.created_at,
                    last_accessed_at: memory.last_accessed_at,
                    access_count: memory.access_count
                })),
                total: results.length,
                query: input.query,
                filters: {
                    sector: input.sector,
                    source_type: input.source_type,
                    source_path: input.source_path,
                    project_name: input.project_name
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: 'Failed to query memories'
            };
        }
    }
    validateInput(input) {
        if (!input.query || input.query.trim().length === 0) {
            throw new Error('Query is required and cannot be empty');
        }
        if (input.limit && (input.limit < 1 || input.limit > 100)) {
            throw new Error('Limit must be between 1 and 100');
        }
        if (input.min_score && (input.min_score < 0 || input.min_score > 1)) {
            throw new Error('min_score must be between 0 and 1');
        }
        if (input.sector && !['episodic', 'semantic', 'procedural', 'emotional', 'reflective'].includes(input.sector)) {
            throw new Error('sector must be one of: episodic, semantic, procedural, emotional, reflective');
        }
        if (input.source_type && !['vault', 'repo', 'global'].includes(input.source_type)) {
            throw new Error('source_type must be one of: vault, repo, global');
        }
    }
}
//# sourceMappingURL=query.js.map