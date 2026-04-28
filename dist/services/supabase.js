/**
 * Supabase Client Service
 * Handles database operations for the memory system
 */
import { createClient } from '@supabase/supabase-js';
export class SupabaseService {
    client;
    constructor(url, serviceRoleKey) {
        this.client = createClient(url, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    }
    /**
     * Store a new memory
     */
    async storeMemory(memory) {
        const { data, error } = await this.client
            .from('memories')
            .insert(memory)
            .select()
            .single();
        if (error) {
            throw new Error(`Failed to store memory: ${error.message}`);
        }
        return data;
    }
    /**
     * Query memories by vector similarity
     */
    async queryMemories(params, queryEmbedding) {
        const { limit = 10, min_score = 0.7, sector, source_type, source_path, project_name, tags } = params;
        // Build query
        let query = this.client
            .from('memories')
            .select('*')
            .order('embedding', { ascending: true }); // Will be replaced by vector distance
        // Apply filters
        if (sector)
            query = query.eq('sector', sector);
        if (source_type)
            query = query.eq('source_type', source_type);
        if (source_path)
            query = query.eq('source_path', source_path);
        if (project_name)
            query = query.eq('project_name', project_name);
        if (tags && tags.length > 0) {
            query = query.contains('tags', tags);
        }
        // Execute query with RPC for vector similarity
        const { data, error } = await this.client.rpc('match_memories', {
            query_embedding: queryEmbedding,
            match_threshold: min_score,
            match_count: limit,
            filter_sector: sector,
            filter_source_type: source_type,
            filter_source_path: source_path,
            filter_project_name: project_name
        });
        if (error) {
            // Fallback: if RPC doesn't exist, use basic query
            console.warn('RPC match_memories not found, using fallback query');
            const { data: fallbackData, error: fallbackError } = await query.limit(limit);
            if (fallbackError) {
                throw new Error(`Failed to query memories: ${fallbackError.message}`);
            }
            return fallbackData.map(m => ({
                ...m,
                similarity: 0.5 // Default similarity for fallback
            }));
        }
        return data;
    }
    /**
     * List memories with filters
     */
    async listMemories(params) {
        const { sector, source_type, source_path, project_name, tags, limit = 50, offset = 0, order_by = 'created_at', order = 'desc' } = params;
        // Build query
        let query = this.client.from('memories').select('*', { count: 'exact' });
        // Apply filters
        if (sector)
            query = query.eq('sector', sector);
        if (source_type)
            query = query.eq('source_type', source_type);
        if (source_path)
            query = query.eq('source_path', source_path);
        if (project_name)
            query = query.eq('project_name', project_name);
        if (tags && tags.length > 0) {
            query = query.contains('tags', tags);
        }
        // Apply ordering and pagination
        query = query.order(order_by, { ascending: order === 'asc' });
        query = query.range(offset, offset + limit - 1);
        const { data, error, count } = await query;
        if (error) {
            throw new Error(`Failed to list memories: ${error.message}`);
        }
        return {
            memories: data,
            total: count || 0
        };
    }
    /**
     * Get a specific memory by ID
     */
    async getMemory(id) {
        const { data, error } = await this.client
            .from('memories')
            .select('*')
            .eq('id', id)
            .single();
        if (error) {
            throw new Error(`Failed to get memory: ${error.message}`);
        }
        // Update access tracking
        await this.updateAccessTracking(id);
        return data;
    }
    /**
     * Reinforce a memory (increment access count)
     */
    async reinforceMemory(id) {
        await this.updateAccessTracking(id);
        const { data, error } = await this.client
            .from('memories')
            .select('*')
            .eq('id', id)
            .single();
        if (error) {
            throw new Error(`Failed to reinforce memory: ${error.message}`);
        }
        return data;
    }
    /**
     * Update access tracking for a memory
     */
    async updateAccessTracking(id) {
        const { error } = await this.client
            .from('memories')
            .update({
            last_accessed_at: new Date().toISOString(),
            access_count: this.client.from('memories').select('access_count').eq('id', id)
        })
            .eq('id', id);
        if (error) {
            console.warn(`Failed to update access tracking: ${error.message}`);
        }
    }
    /**
     * Get memory statistics
     */
    async getStats() {
        const { data, error } = await this.client
            .from('memory_stats')
            .select('*');
        if (error) {
            throw new Error(`Failed to get stats: ${error.message}`);
        }
        return data;
    }
}
//# sourceMappingURL=supabase.js.map