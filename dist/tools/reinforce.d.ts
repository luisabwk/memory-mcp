/**
 * Memory Reinforce Tool
 * Reinforces a memory by incrementing its access count
 */
import type { SupabaseService } from '../services/supabase.js';
export interface MemoryReinforceInput {
    id: string;
}
export declare class MemoryReinforceTool {
    private supabase;
    constructor(supabase: SupabaseService);
    execute(input: MemoryReinforceInput): Promise<{
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