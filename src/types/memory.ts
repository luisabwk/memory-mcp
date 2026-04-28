/**
 * Memory System Types
 * Type definitions for the global memory system
 */

export type MemorySector = 
  | 'episodic'    // Events and experiences
  | 'semantic'    // Facts and knowledge
  | 'procedural'  // How-to information
  | 'emotional'   // Preferences and feelings
  | 'reflective'; // Insights and meta-cognition

export type SourceType = 'vault' | 'repo' | 'global';

export interface Memory {
  id: string;
  content: string;
  embedding?: number[];
  sector: MemorySector;
  source_type: SourceType;
  source_path?: string;
  project_name?: string;
  repository_url?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
  access_count: number;
  user_id?: string;
}

export interface MemoryInsert {
  content: string;
  embedding?: number[];
  sector?: MemorySector;
  source_type: SourceType;
  source_path?: string;
  project_name?: string;
  repository_url?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  user_id?: string;
}

export interface MemoryQueryParams {
  query: string;
  limit?: number;
  min_score?: number;
  sector?: MemorySector;
  source_type?: SourceType;
  source_path?: string;
  project_name?: string;
  tags?: string[];
}

export interface MemoryListParams {
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

export interface MemoryQueryResult extends Memory {
  similarity: number;
}

export interface MemoryListResult {
  memories: Memory[];
  total: number;
  limit: number;
  offset: number;
}

export interface MemoryStats {
  sector: MemorySector;
  source_type: SourceType;
  count: number;
  avg_access: number;
  latest_memory: string;
  oldest_memory: string;
}
