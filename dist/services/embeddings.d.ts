/**
 * Embeddings Service
 *
 * Generates text embeddings via the OpenAI SDK pointed at OpenRouter.
 * OpenRouter proxies `openai/text-embedding-3-small` to the real OpenAI model,
 * so the vectors are byte-for-byte compatible with previously stored embeddings
 * (verified: cosine 1.0). This keeps a single provider key (OpenRouter) for the
 * whole stack.
 */
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
export declare class EmbeddingsService {
    private client;
    private model;
    private dimensions;
    constructor(config: EmbeddingsConfig);
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