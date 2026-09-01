/**
 * Memory List Tool
 * Lists memories with filters and pagination, scoped to the authenticated caller.
 */
import type { MongoMemoryService } from '../services/mongo-memory.js';
import type { MemorySector, SourceType } from '../types/memory.js';
export interface MemoryListInput {
    sector?: MemorySector;
    source_type?: SourceType;
    source_path?: string;
    project_name?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    order_by?: 'created_at' | 'updated_at' | 'last_accessed_at' | 'access_count';
    order?: 'asc' | 'desc';
}
export declare class MemoryListTool {
    private memoryService;
    constructor(memoryService: MongoMemoryService);
    /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
    execute(input: MemoryListInput, userId: string): Promise<{
        success: boolean;
        memories: {
            id: string;
            content: string;
            sector: MemorySector;
            source_type: SourceType;
            source_path: string | undefined;
            project_name: string | undefined;
            tags: string[];
            created_at: string;
            updated_at: string;
            access_count: number;
        }[];
        total: number;
        limit: number | undefined;
        offset: number | undefined;
        filters: {
            sector: MemorySector | undefined;
            source_type: SourceType | undefined;
            source_path: string | undefined;
            project_name: string | undefined;
            tags: string[] | undefined;
        };
        error?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        error: string;
        message: string;
        memories?: undefined;
        total?: undefined;
        limit?: undefined;
        offset?: undefined;
        filters?: undefined;
    }>;
    private validateInput;
}
//# sourceMappingURL=list.d.ts.map