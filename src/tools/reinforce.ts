/**
 * Memory Reinforce Tool
 * Reinforces a memory by incrementing its access count, scoped to the authenticated caller.
 */

import type { MongoMemoryService } from '../services/mongo-memory.js';

export interface MemoryReinforceInput {
  id: string;
}

export class MemoryReinforceTool {
  constructor(private memoryService: MongoMemoryService) {}

  /** `userId` is the trusted, server-injected owner email — see server.ts. Never accept it via `input`. */
  async execute(input: MemoryReinforceInput, userId: string) {
    try {
      this.validateInput(input);

      const memory = await this.memoryService.reinforceMemory(input.id, userId);

      return {
        success: true,
        memory: {
          id: memory.id,
          access_count: memory.access_count,
          last_accessed_at: memory.last_accessed_at
        },
        message: `Memory reinforced. Access count: ${memory.access_count}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to reinforce memory'
      };
    }
  }

  private validateInput(input: MemoryReinforceInput): void {
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
