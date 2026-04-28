/**
 * Embeddings Service
 * Handles text embedding generation using OpenAI
 */
export declare class EmbeddingsService {
    private client;
    private model;
    private dimensions;
    constructor(apiKey: string, model?: string, dimensions?: number);
    /**
     * Generate embedding for a text
     */
    generateEmbedding(text: string): Promise<number[]>;
    /**
     * Generate embeddings for multiple texts (batch)
     */
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    /**
     * Get embedding dimensions
     */
    getDimensions(): number;
    /**
     * Get model name
     */
    getModel(): string;
}
//# sourceMappingURL=embeddings.d.ts.map