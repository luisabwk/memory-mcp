/**
 * Sector Classifier Service
 * Automatically classifies memories into cognitive sectors
 */
import type { MemorySector } from '../types/memory.js';
export declare class SectorClassifier {
    private sectorRules;
    /**
     * Classify text into a memory sector
     */
    classify(text: string): MemorySector;
    /**
     * Get classification confidence
     */
    classifyWithConfidence(text: string): {
        sector: MemorySector;
        confidence: number;
    };
}
//# sourceMappingURL=classifier.d.ts.map