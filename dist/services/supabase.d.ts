/**
 * Supabase Client Service
 * Handles database operations for the memory system
 */
import type { Memory, MemoryInsert, MemoryQueryParams, MemoryListParams, MemoryQueryResult } from '../types/memory.js';
export declare class SupabaseService {
    private client;
    constructor(url: string, serviceRoleKey: string);
    /**
     * Store a new memory
     */
    storeMemory(memory: MemoryInsert): Promise<Memory>;
    /**
     * Query memories by vector similarity
     */
    queryMemories(params: MemoryQueryParams, queryEmbedding: number[]): Promise<MemoryQueryResult[]>;
    /**
     * List memories with filters
     */
    listMemories(params: MemoryListParams): Promise<{
        memories: Memory[];
        total: number;
    }>;
    /**
     * Get a specific memory by ID
     */
    getMemory(id: string): Promise<Memory>;
    /**
     * Reinforce a memory (increment access count)
     */
    reinforceMemory(id: string): Promise<Memory>;
    /**
     * Update access tracking for a memory
     */
    private updateAccessTracking;
    /**
     * Get memory statistics
     */
    getStats(): Promise<any[]>;
}
//# sourceMappingURL=supabase.d.ts.map