/**
 * Memory Store Tool
 * Stores a new memory, scoped to the authenticated caller.
 */
import type { MongoMemoryService } from '../services/mongo-memory.js';
import type { EmbeddingsService } from '../services/embeddings.js';
import type { SectorClassifier } from '../services/classifier.js';
import type { MemorySector, SourceType } from '../types/memory.js';
export interface MemoryStoreInput {
    content: string;
    sector?: MemorySector;
    source_type: SourceType;
    source_path?: string;
    project_name?: string;
    repository_url?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
}
export declare class MemoryStoreTool {
    private memoryService;
    private embeddings;
    private classifier;
    constructor(memoryService: MongoMemoryService, embeddings: EmbeddingsService, classifier: SectorClassifier);
    /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
    execute(input: MemoryStoreInput, userId: string): Promise<{
        success: boolean;
        memory: {
            id: string;
            content: string;
            sector: MemorySector;
            source_type: SourceType;
            source_path: string | undefined;
            project_name: string | undefined;
            tags: string[];
            created_at: string;
        };
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        message: string;
        memory?: undefined;
    }>;
    private validateInput;
}
//# sourceMappingURL=store.d.ts.map