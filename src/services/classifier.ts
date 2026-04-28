/**
 * Sector Classifier Service
 * Automatically classifies memories into cognitive sectors
 */

import type { MemorySector } from '../types/memory.js';

interface SectorKeywords {
  sector: MemorySector;
  keywords: string[];
  patterns: RegExp[];
}

export class SectorClassifier {
  private sectorRules: SectorKeywords[] = [
    {
      sector: 'episodic',
      keywords: ['reunião', 'encontro', 'aconteceu', 'ocorreu', 'meeting', 'happened', 'event', 'session'],
      patterns: [
        /\b(ontem|hoje|amanhã|yesterday|today|tomorrow)\b/i,
        /\d{1,2}\/\d{1,2}\/\d{2,4}/,
        /\b(janeiro|fevereiro|março|april|may|june)\b/i
      ]
    },
    {
      sector: 'procedural',
      keywords: ['como', 'passo', 'processo', 'instruções', 'para fazer', 'how to', 'step', 'process', 'guide'],
      patterns: [
        /^(como|how to|how do|what is the process)/i,
        /\b(criar|configurar|deploy|instalar|build|setup|configure)\b/i,
        /\b(primeiro|segundo|terceiro|step \d+|first|second|third)\b/i
      ]
    },
    {
      sector: 'emotional',
      keywords: ['prefiro', 'gosto', 'não gosto', 'melhor', 'pior', 'prefer', 'like', 'dislike', 'favorite'],
      patterns: [
        /\b(amo|odeio|adoro|love|hate|prefer)\b/i,
        /\b(should|shouldn't|must|must not|avoid)\b/i
      ]
    },
    {
      sector: 'reflective',
      keywords: ['percebi', 'aprendi', 'insight', 'lição', 'conclusão', 'learned', 'realized', 'understanding'],
      patterns: [
        /\b(percebi que|aprendi que|descobri que|realized that|learned that)\b/i,
        /\b(insight|lesson|takeaway|reflection)\b/i
      ]
    },
    {
      sector: 'semantic',
      keywords: ['é', 'usa', 'funciona', 'característica', 'definição', 'is', 'uses', 'works', 'definition'],
      patterns: [
        /\b(é um|é uma|is a|is an)\b/i,
        /\b(significa|means|refers to|stands for)\b/i
      ]
    }
  ];

  /**
   * Classify text into a memory sector
   */
  classify(text: string): MemorySector {
    const lowerText = text.toLowerCase();
    const scores: Record<MemorySector, number> = {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      emotional: 0,
      reflective: 0
    };

    // Score based on keywords
    for (const rule of this.sectorRules) {
      for (const keyword of rule.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          scores[rule.sector] += 1;
        }
      }

      // Score based on patterns
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          scores[rule.sector] += 2; // Patterns have higher weight
        }
      }
    }

    // Find sector with highest score
    const maxScore = Math.max(...Object.values(scores));
    
    // If no clear winner, default to semantic
    if (maxScore === 0) {
      return 'semantic';
    }

    // Return sector with highest score
    const winner = Object.entries(scores).find(([_, score]) => score === maxScore);
    return (winner?.[0] as MemorySector) || 'semantic';
  }

  /**
   * Get classification confidence
   */
  classifyWithConfidence(text: string): { sector: MemorySector; confidence: number } {
    const lowerText = text.toLowerCase();
    const scores: Record<MemorySector, number> = {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      emotional: 0,
      reflective: 0
    };

    let totalScore = 0;

    // Score based on keywords
    for (const rule of this.sectorRules) {
      for (const keyword of rule.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          scores[rule.sector] += 1;
          totalScore += 1;
        }
      }

      // Score based on patterns
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          scores[rule.sector] += 2;
          totalScore += 2;
        }
      }
    }

    // Find sector with highest score
    const maxScore = Math.max(...Object.values(scores));
    
    // Calculate confidence
    const confidence = totalScore > 0 ? maxScore / totalScore : 0;

    // If no clear winner, default to semantic with low confidence
    if (maxScore === 0) {
      return { sector: 'semantic', confidence: 0.1 };
    }

    // Return sector with highest score
    const winner = Object.entries(scores).find(([_, score]) => score === maxScore);
    return {
      sector: (winner?.[0] as MemorySector) || 'semantic',
      confidence
    };
  }
}
