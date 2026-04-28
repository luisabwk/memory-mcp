/**
 * Memory Get Tool
 * Gets a specific memory by ID
 */
import type { SupabaseService } from '../services/supabase.js';
export interface MemoryGetInput {
    id: string;
}
export declare class MemoryGetTool {
    private supabase;
    constructor(supabase: SupabaseService);
    execute(input: MemoryGetInput): Promise<{
        success: boolean;
        memory: {
            id: string;
            content: string;
            sector: import("../types/memory.js").MemorySector;
            source_type: import("../types/memory.js").SourceType;
            source_path: string | undefined;
            project_name: string | undefined;
            repository_url: string | undefined;
            metadata: Record<string, unknown>;
            tags: string[];
            created_at: string;
            updated_at: string;
            last_accessed_at: string | undefined;
            access_count: number;
        };
        error?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        error: string;
        message: string;
        memory?: undefined;
    }>;
    private validateInput;
}
//# sourceMappingURL=get.d.ts.map