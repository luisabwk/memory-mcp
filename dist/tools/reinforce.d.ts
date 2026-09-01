/**
 * Memory Reinforce Tool
 * Reinforces a memory by incrementing its access count, scoped to the authenticated caller.
 */
import type { MongoMemoryService } from '../services/mongo-memory.js';
export interface MemoryReinforceInput {
    id: string;
}
export declare class MemoryReinforceTool {
    private memoryService;
    constructor(memoryService: MongoMemoryService);
    /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
    execute(input: MemoryReinforceInput, userId: string): Promise<{
        success: boolean;
        memory: {
            id: string;
            access_count: number;
            last_accessed_at: string | undefined;
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
//# sourceMappingURL=reinforce.d.ts.map