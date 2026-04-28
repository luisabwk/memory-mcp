/**
 * Embeddings Service
 * Handles text embedding generation using OpenAI
 */

import OpenAI from 'openai';

export class EmbeddingsService {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(apiKey: string, model = 'text-embedding-3-small', dimensions = 1536) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.dimensions = dimensions;
  }

  /**
   * Generate embedding for a text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        dimensions: this.dimensions
      });

      return response.data[0].embedding;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate embedding: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
        dimensions: this.dimensions
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate embeddings: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get model name
   */
  getModel(): string {
    return this.model;
  }
}
