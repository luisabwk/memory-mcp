/**
 * Supabase Client Service
 * Handles database operations for the memory system
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Memory, MemoryInsert, MemoryQueryParams, MemoryListParams, MemoryQueryResult } from '../types/memory.js';

export class SupabaseService {
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
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
  async storeMemory(memory: MemoryInsert): Promise<Memory> {
    const { data, error } = await this.client
      .from('memories')
      .insert(memory)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store memory: ${error.message}`);
    }

    return data as Memory;
  }

  /**
   * Query memories by vector similarity
   */
  async queryMemories(params: MemoryQueryParams, queryEmbedding: number[]): Promise<MemoryQueryResult[]> {
    const { 
      limit = 10, 
      min_score = 0.4,
      sector,
      source_type,
      source_path,
      project_name,
      tags
    } = params;

    // Build query
    let query = this.client
      .from('memories')
      .select('*')
      .order('embedding', { ascending: true }); // Will be replaced by vector distance

    // Apply filters
    if (sector) query = query.eq('sector', sector);
    if (source_type) query = query.eq('source_type', source_type);
    if (source_path) query = query.eq('source_path', source_path);
    if (project_name) query = query.eq('project_name', project_name);
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

      return (fallbackData as Memory[]).map(m => ({
        ...m,
        similarity: 0.5 // Default similarity for fallback
      }));
    }

    return data as MemoryQueryResult[];
  }

  /**
   * List memories with filters
   */
  async listMemories(params: MemoryListParams): Promise<{ memories: Memory[]; total: number }> {
    const {
      sector,
      source_type,
      source_path,
      project_name,
      tags,
      limit = 50,
      offset = 0,
      order_by = 'created_at',
      order = 'desc'
    } = params;

    // Build query
    let query = this.client.from('memories').select('*', { count: 'exact' });

    // Apply filters
    if (sector) query = query.eq('sector', sector);
    if (source_type) query = query.eq('source_type', source_type);
    if (source_path) query = query.eq('source_path', source_path);
    if (project_name) query = query.eq('project_name', project_name);
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
      memories: data as Memory[],
      total: count || 0
    };
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(id: string): Promise<Memory> {
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

    return data as Memory;
  }

  /**
   * Reinforce a memory (increment access count)
   */
  async reinforceMemory(id: string): Promise<Memory> {
    await this.updateAccessTracking(id);

    const { data, error } = await this.client
      .from('memories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to reinforce memory: ${error.message}`);
    }

    return data as Memory;
  }

  /**
   * Update access tracking for a memory
   */
  private async updateAccessTracking(id: string): Promise<void> {
    // Lê o contador atual e incrementa. O código antigo atribuía o próprio query-builder
    // (não-awaited) ao access_count — o supabase-js serializava o builder em JSON e o
    // PostgREST recusava com "invalid input syntax for type integer". Para um servidor
    // single-user, read-then-write é suficiente (a race de concorrência real é irrelevante).
    const { data: current, error: readError } = await this.client
      .from('memories')
      .select('access_count')
      .eq('id', id)
      .single();

    if (readError) {
      console.warn(`Failed to read access_count: ${readError.message}`);
      return;
    }

    const nextCount = ((current?.access_count as number | null) ?? 0) + 1;

    const { error } = await this.client
      .from('memories')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: nextCount
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
