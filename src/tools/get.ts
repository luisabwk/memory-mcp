/**
 * Memory Get Tool
 * Gets a specific memory by ID, scoped to the authenticated caller.
 */

import type { MongoMemoryService } from '../services/mongo-memory.js';

export interface MemoryGetInput {
  id: string;
}

export class MemoryGetTool {
  constructor(private memoryService: MongoMemoryService) {}

  /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
  async execute(input: MemoryGetInput, userId: string) {
    try {
      this.validateInput(input);

      // Scoped by userId: a memory owned by someone else resolves as not-found,
      // not as a cross-user leak — see MongoMemoryService.getMemory.
      const memory = await this.memoryService.getMemory(input.id, userId);

      return {
        success: true,
        memory: {
          id: memory.id,
          content: memory.content,
          sector: memory.sector,
          source_type: memory.source_type,
          source_path: memory.source_path,
          project_name: memory.project_name,
          repository_url: memory.repository_url,
          metadata: memory.metadata,
          tags: memory.tags,
          created_at: memory.created_at,
          updated_at: memory.updated_at,
          last_accessed_at: memory.last_accessed_at,
          access_count: memory.access_count
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to get memory'
      };
    }
  }

  private validateInput(input: MemoryGetInput): void {
    if (!input.id || input.id.trim().length === 0) {
      throw new Error('ID is required and cannot be empty');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(input.id)) {
      throw new Error('ID must be a valid UUID');
    }
  }
}
