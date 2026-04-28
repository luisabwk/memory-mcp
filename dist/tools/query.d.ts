/**
 * Memory Query Tool
 * Queries memories using vector similarity search
 */
import type { SupabaseService } from '../services/supabase.js';
import type { EmbeddingsService } from '../services/embeddings.js';
import type { MemorySector, SourceType } from '../types/memory.js';
export interface MemoryQueryInput {
    query: string;
    limit?: number;
    min_score?: number;
    sector?: MemorySector;
    source_type?: SourceType;
    source_path?: string;
    project_name?: string;
    tags?: string[];
}
export declare class MemoryQueryTool {
    private supabase;
    private embeddings;
    constructor(supabase: SupabaseService, embeddings: EmbeddingsService);
    execute(input: MemoryQueryInput): Promise<{
        success: boolean;
        memories: {
            id: string;
            content: string;
            sector: MemorySector;
            source_type: SourceType;
            source_path: string | undefined;
            project_name: string | undefined;
            similarity: number;
            tags: string[];
            metadata: Record<string, unknown>;
            created_at: string;
            last_accessed_at: string | undefined;
            access_count: number;
        }[];
        total: number;
        query: string;
        filters: {
            sector: MemorySector | undefined;
            source_type: SourceType | undefined;
            source_path: string | undefined;
            project_name: string | undefined;
        };
        error?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        error: string;
        message: string;
        memories?: undefined;
        total?: undefined;
        query?: undefined;
        filters?: undefined;
    }>;
    private validateInput;
}
//# sourceMappingURL=query.d.ts.map