/**
 * Memory Store Tool
 * Stores a new memory in the global system
 */
import type { SupabaseService } from '../services/supabase.js';
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
    private supabase;
    private embeddings;
    private classifier;
    constructor(supabase: SupabaseService, embeddings: EmbeddingsService, classifier: SectorClassifier);
    execute(input: MemoryStoreInput): Promise<{
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