/**
 * Memory List Tool
 * Lists memories with filters and pagination, scoped to the authenticated caller.
 */

import type { MongoMemoryService } from '../services/mongo-memory.js';
import type { MemoryListParams, MemorySector, SourceType } from '../types/memory.js';

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

export class MemoryListTool {
  constructor(private memoryService: MongoMemoryService) {}

  /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
  async execute(input: MemoryListInput, userId: string) {
    try {
      this.validateInput(input);

      const params: MemoryListParams = {
        sector: input.sector,
        source_type: input.source_type,
        source_path: input.source_path,
        project_name: input.project_name,
        tags: input.tags,
        limit: input.limit || 50,
        offset: input.offset || 0,
        order_by: input.order_by || 'created_at',
        order: input.order || 'desc',
        user_id: userId,
      };

      const result = await this.memoryService.listMemories(params);

      return {
        success: true,
        memories: result.memories.map(memory => ({
          id: memory.id,
          content: memory.content.substring(0, 200) + (memory.content.length > 200 ? '...' : ''),
          sector: memory.sector,
          source_type: memory.source_type,
          source_path: memory.source_path,
          project_name: memory.project_name,
          tags: memory.tags,
          created_at: memory.created_at,
          updated_at: memory.updated_at,
          access_count: memory.access_count
        })),
        total: result.total,
        limit: params.limit,
        offset: params.offset,
        filters: {
          sector: input.sector,
          source_type: input.source_type,
          source_path: input.source_path,
          project_name: input.project_name,
          tags: input.tags
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to list memories'
      };
    }
  }

  private validateInput(input: MemoryListInput): void {
    if (input.limit && (input.limit < 1 || input.limit > 100)) {
      throw new Error('Limit must be between 1 and 100');
    }

    if (input.offset && input.offset < 0) {
      throw new Error('Offset must be non-negative');
    }

    if (input.sector && !['episodic', 'semantic', 'procedural', 'emotional', 'reflective'].includes(input.sector)) {
      throw new Error('sector must be one of: episodic, semantic, procedural, emotional, reflective');
    }

    if (input.source_type && !['vault', 'repo', 'global'].includes(input.source_type)) {
      throw new Error('source_type must be one of: vault, repo, global');
    }

    if (input.order_by && !['created_at', 'updated_at', 'last_accessed_at', 'access_count'].includes(input.order_by)) {
      throw new Error('order_by must be one of: created_at, updated_at, last_accessed_at, access_count');
    }

    if (input.order && !['asc', 'desc'].includes(input.order)) {
      throw new Error('order must be one of: asc, desc');
    }
  }
}
