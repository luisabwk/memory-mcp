/**
 * Embeddings Service
 *
 * Generates text embeddings via the OpenAI SDK pointed at OpenRouter.
 * OpenRouter proxies `openai/text-embedding-3-small` to the real OpenAI model,
 * so the vectors are byte-for-byte compatible with previously stored embeddings
 * (verified: cosine 1.0). This keeps a single provider key (OpenRouter) for the
 * whole stack.
 */

import OpenAI from 'openai';

export interface EmbeddingsConfig {
  apiKey: string;
  /** Provider base URL. Defaults to OpenRouter. */
  baseURL?: string;
  /** Model id. Via OpenRouter it must be namespaced, e.g. `openai/text-embedding-3-small`. */
  model?: string;
  dimensions?: number;
  /** Extra headers (OpenRouter uses HTTP-Referer / X-Title for analytics). */
  defaultHeaders?: Record<string, string>;
}

export class EmbeddingsService {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(config: EmbeddingsConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
    });
    this.model = config.model ?? 'openai/text-embedding-3-small';
    this.dimensions = config.dimensions ?? 1536;
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
