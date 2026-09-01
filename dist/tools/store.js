/**
 * Memory Store Tool
 * Stores a new memory, scoped to the authenticated caller.
 */
import { notifyGraphitiBridge } from '../services/graphiti-bridge.js';
export class MemoryStoreTool {
    memoryService;
    embeddings;
    classifier;
    constructor(memoryService, embeddings, classifier) {
        this.memoryService = memoryService;
        this.embeddings = embeddings;
        this.classifier = classifier;
    }
    /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
    async execute(input, userId) {
        try {
            this.validateInput(input);
            const embedding = await this.embeddings.generateEmbedding(input.content);
            const sector = input.sector || this.classifier.classify(input.content);
            const memoryInsert = {
                content: input.content,
                embedding,
                sector,
                source_type: input.source_type,
                source_path: input.source_path,
                project_name: input.project_name,
                repository_url: input.repository_url,
                metadata: input.metadata || {},
                tags: input.tags || [],
                user_id: userId,
            };
            const memory = await this.memoryService.storeMemory(memoryInsert);
            // Best-effort replacement for the old Postgres trigger
            // (notify_graphiti_bridge_on_memory_insert), which fired on every INSERT
            // into `memories` and no longer exists once storage is Mongo. Never blocks
            // or fails the store call — matches the trigger's own
            // `exception when others then raise warning` behavior.
            void notifyGraphitiBridge(memory);
            return {
                success: true,
                memory: {
                    id: memory.id,
                    content: memory.content,
                    sector: memory.sector,
                    source_type: memory.source_type,
                    source_path: memory.source_path,
                    project_name: memory.project_name,
                    tags: memory.tags,
                    created_at: memory.created_at,
                },
                message: `Memory stored successfully with sector: ${sector}`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: 'Failed to store memory',
            };
        }
    }
    validateInput(input) {
        if (!input.content || input.content.trim().length === 0) {
            throw new Error('Content is required and cannot be empty');
        }
        if (input.content.length > 10000) {
            throw new Error('Content is too long (max 10000 characters)');
        }
        if (!input.source_type) {
            throw new Error('source_type is required');
        }
        if (!['vault', 'repo', 'global'].includes(input.source_type)) {
            throw new Error('source_type must be one of: vault, repo, global');
        }
        if (input.source_type === 'vault' && !input.source_path) {
            throw new Error('source_path is required when source_type is "vault"');
        }
        if (input.source_type === 'repo' && !input.repository_url) {
            throw new Error('repository_url is required when source_type is "repo"');
        }
        if (input.sector && !['episodic', 'semantic', 'procedural', 'emotional', 'reflective'].includes(input.sector)) {
            throw new Error('sector must be one of: episodic, semantic, procedural, emotional, reflective');
        }
    }
}
//# sourceMappingURL=store.js.map