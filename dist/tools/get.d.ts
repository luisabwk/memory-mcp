/**
 * Memory Get Tool
 * Gets a specific memory by ID, scoped to the authenticated caller.
 */
import type { MongoMemoryService } from '../services/mongo-memory.js';
export interface MemoryGetInput {
    id: string;
}
export declare class MemoryGetTool {
    private memoryService;
    constructor(memoryService: MongoMemoryService);
    /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
    execute(input: MemoryGetInput, userId: string): Promise<{
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