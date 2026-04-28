/**
 * Memory Store Tool
 * Stores a new memory in the global system
 */

import type { SupabaseService } from '../services/supabase.js';
import type { EmbeddingsService } from '../services/embeddings.js';
import type { SectorClassifier } from '../services/classifier.js';
import type { MemoryInsert, MemorySector, SourceType } from '../types/memory.js';

export interface MemoryStoreInput {
  content: string;
  sector?: MemorySector;
  source_type: SourceType;
  source_path?: string;
  project_name?: string;
  repository_url?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export class MemoryStoreTool {
  constructor(
    private supabase: SupabaseService,
    private embeddings: EmbeddingsService,
    private classifier: SectorClassifier
  ) {}

  async execute(input: MemoryStoreInput) {
    try {
      // Validate input
      this.validateInput(input);

      // Generate embedding
      const embedding = await this.embeddings.generateEmbedding(input.content);

      // Classify sector if not provided
      const sector = input.sector || this.classifier.classify(input.content);

      // Prepare memory insert
      const memoryInsert: MemoryInsert = {
        content: input.content,
        embedding,
        sector,
        source_type: input.source_type,
        source_path: input.source_path,
        project_name: input.project_name,
        repository_url: input.repository_url,
        metadata: input.metadata || {},
        tags: input.tags || []
      };

      // Store in database
      const memory = await this.supabase.storeMemory(memoryInsert);

      return {
        success: true,
        memory: {
          id: memory.id,
          content: memory.content,
          sector: memory.sector,
          source_type: memory.source_type,
          source_path: memory.source_path,
          project_name: memory.project_name,
          tags: memory.tags,
          created_at: memory.created_at
        },
        message: `Memory stored successfully with sector: ${sector}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to store memory'
      };
    }
  }

  private validateInput(input: MemoryStoreInput): void {
    if (!input.content || input.content.trim().length === 0) {
      throw new Error('Content is required and cannot be empty');
    }

    if (input.content.length > 10000) {
      throw new Error('Content is too long (max 10000 characters)');
    }

    if (!input.source_type) {
      throw new Error('source_type is required');
    }

    if (!['vault', 'repo', 'global'].includes(input.source_type)) {
      throw new Error('source_type must be one of: vault, repo, global');
    }

    if (input.source_type === 'vault' && !input.source_path) {
      throw new Error('source_path is required when source_type is "vault"');
    }

    if (input.source_type === 'repo' && !input.repository_url) {
      throw new Error('repository_url is required when source_type is "repo"');
    }

    if (input.sector && !['episodic', 'semantic', 'procedural', 'emotional', 'reflective'].includes(input.sector)) {
      throw new Error('sector must be one of: episodic, semantic, procedural, emotional, reflective');
    }
  }
}
