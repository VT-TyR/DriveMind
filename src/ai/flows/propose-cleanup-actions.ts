
'use server';

/**
 * @fileOverview Production AI cleanup action proposal engine.
 * Uses advanced ML models to analyze files and propose intelligent cleanup actions
 * with safety checks, confidence scoring, and context-aware recommendations.
 * Implements ALPHA-CODENAME v1.4 standards.
 */

import {ai} from '@/ai/genkit';
import { 
    ProposeCleanupActionsInput,
    ProposeCleanupActionsInputSchema,
    ProposeCleanupActionsOutput,
    ProposeCleanupActionsOutputSchema,
} from '@/lib/ai-types';
import { logger } from '@/lib/logger';
import { saveAnalytics } from '@/lib/firebase-db';


export async function proposeCleanupActions(input: ProposeCleanupActionsInput): Promise<ProposeCleanupActionsOutput> {
  return proposeCleanupActionsFlow(input);
}

/**
 * Enhanced file analysis with multiple criteria.
 */
function analyzeFileContext(fileDescription: string): {
  indicators: string[];
  riskFactors: string[];
  contextualClues: string[];
} {
  const desc = fileDescription.toLowerCase();
  const indicators: string[] = [];
  const riskFactors: string[] = [];
  const contextualClues: string[] = [];
  
  // Age indicators
  if (desc.includes('old') || desc.includes('outdated') || desc.includes('legacy')) {
    indicators.push('age-related');
  }
  
  // Temporary file indicators
  if (desc.includes('temp') || desc.includes('tmp') || desc.includes('backup') || 
      desc.includes('draft') || desc.includes('copy')) {
    indicators.push('temporary');
  }
  
  // System/generated file indicators
  if (desc.includes('cache') || desc.includes('log') || desc.includes('automatic') ||
      desc.includes('generated') || desc.includes('thumbnail')) {
    indicators.push('system-generated');
  }
  
  // Important file indicators (risk factors)
  if (desc.includes('important') || desc.includes('contract') || desc.includes('legal') ||
      desc.includes('tax') || desc.includes('financial') || desc.includes('passport') ||
      desc.includes('certificate') || desc.includes('license')) {
    riskFactors.push('important-document');
  }
  
  // Personal/sensitive indicators
  if (desc.includes('personal') || desc.includes('private') || desc.includes('confidential') ||
      desc.includes('password') || desc.includes('ssn') || desc.includes('social security')) {
    riskFactors.push('sensitive-content');
  }
  
  // Work-related indicators
  if (desc.includes('project') || desc.includes('presentation') || desc.includes('report') ||
      desc.includes('meeting') || desc.includes('client') || desc.includes('business')) {
    contextualClues.push('work-related');
  }
  
  // Media indicators
  if (desc.includes('photo') || desc.includes('image') || desc.includes('video') ||
      desc.includes('music') || desc.includes('movie') || desc.includes('picture')) {
    contextualClues.push('media-content');
  }
  
  // Recent activity indicators
  if (desc.includes('recent') || desc.includes('new') || desc.includes('current') ||
      desc.includes('active') || desc.includes('in progress')) {
    riskFactors.push('recent-activity');
  }
  
  return { indicators, riskFactors, contextualClues };
}

/**
 * Determine cleanup action using rule-based analysis combined with AI.
 */
function determineCleanupAction(fileDescription: string, analysis: ReturnType<typeof analyzeFileContext>): {
  suggestedAction: 'trash' | 'move' | 'archive' | 'no_action';
  reason: string;
  confidenceScore: number;
} {
  const { indicators, riskFactors, contextualClues } = analysis;
  
  // Safety first - never recommend deletion of important files
  if (riskFactors.includes('important-document') || 
      riskFactors.includes('sensitive-content') ||
      riskFactors.includes('recent-activity')) {
    return {
      suggestedAction: 'no_action',
      reason: 'File appears to contain important or sensitive content that should not be automatically processed.',
      confidenceScore: 0.95
    };
  }
  
  // High confidence trash recommendations
  if (indicators.includes('temporary') && indicators.includes('age-related')) {
    return {
      suggestedAction: 'trash',
      reason: 'File appears to be an old temporary file that is safe to remove.',
      confidenceScore: 0.9
    };
  }
  
  if (indicators.includes('system-generated')) {
    return {
      suggestedAction: 'trash',
      reason: 'System-generated file that can typically be safely removed or regenerated.',
      confidenceScore: 0.85
    };
  }
  
  // Archive recommendations
  if (contextualClues.includes('work-related') && indicators.includes('age-related')) {
    return {
      suggestedAction: 'archive',
      reason: 'Older work-related file that may have historical value but is no longer actively used.',
      confidenceScore: 0.75
    };
  }
  
  // Move recommendations for better organization
  if (contextualClues.includes('media-content') && !indicators.includes('age-related')) {
    return {
      suggestedAction: 'move',
      reason: 'Media file that could be better organized in a dedicated folder.',
      confidenceScore: 0.7
    };
  }
  
  // Moderate confidence trash for clearly temporary files
  if (indicators.includes('temporary')) {
    return {
      suggestedAction: 'trash',
      reason: 'Temporary file that appears safe to remove.',
      confidenceScore: 0.7
    };
  }
  
  // Low confidence recommendations
  if (indicators.includes('age-related')) {
    return {
      suggestedAction: 'archive',
      reason: 'Older file that might benefit from archiving for better organization.',
      confidenceScore: 0.5
    };
  }
  
  // Default conservative approach
  return {
    suggestedAction: 'no_action',
    reason: 'Insufficient information to confidently recommend a cleanup action.',
    confidenceScore: 0.3
  };
}

const prompt = ai.definePrompt({
  name: 'proposeCleanupActionsPrompt',
  input: {schema: ProposeCleanupActionsInputSchema},
  output: {schema: ProposeCleanupActionsOutputSchema},
  prompt: `You are an expert AI assistant specializing in intelligent file management and cleanup recommendations.

ANALYZE the provided file description using these criteria:

**SAFETY FIRST**: Never recommend 'trash' for:
- Important documents (contracts, legal, financial, tax, certificates)
- Personal/sensitive files (passwords, SSN, medical records)
- Recent files (created/modified within last 30 days)
- Work-critical files (active projects, client data)

**ACTION GUIDELINES**:
- **trash**: Only for clearly redundant files (temp files, old backups, system cache, duplicates)
- **move**: For files that need better organization (photos to media folder, documents to project folders)
- **archive**: For completed work, old projects, or historical documents with potential future value
- **no_action**: When unsure, for active files, or important content

**CONFIDENCE SCORING**:
- 0.9-1.0: Very clear indicators (temp files, system cache, obvious duplicates)
- 0.7-0.9: Strong indicators with some context (old drafts, completed projects)
- 0.5-0.7: Moderate confidence (organizational moves, mild cleanup candidates)
- 0.3-0.5: Low confidence (unclear status, mixed signals)
- 0.0-0.3: Very uncertain (important files, insufficient information)

Be conservative and prioritize data safety over aggressive cleanup.

File Description: {{{fileDescription}}}

Provide your analysis and recommendation:`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
    ],
    temperature: 0.3, // Lower temperature for more consistent, conservative recommendations
  },
});

const proposeCleanupActionsFlow = ai.defineFlow(
  {
    name: 'proposeCleanupActionsFlow',
    inputSchema: ProposeCleanupActionsInputSchema,
    outputSchema: ProposeCleanupActionsOutputSchema,
  },
  async (input: ProposeCleanupActionsInput) => {
    const startTime = Date.now();
    
    try {
      logger.info('Starting cleanup action proposal', {
        descriptionLength: input.fileDescription.length
      });
      
      // First, perform rule-based analysis for safety and efficiency
      const contextAnalysis = analyzeFileContext(input.fileDescription);
      const ruleBasedResult = determineCleanupAction(input.fileDescription, contextAnalysis);
      
      logger.info('Rule-based analysis completed', {
        suggestedAction: ruleBasedResult.suggestedAction,
        confidence: ruleBasedResult.confidenceScore,
        indicators: contextAnalysis.indicators,
        riskFactors: contextAnalysis.riskFactors
      });
      
      // If rule-based analysis has high confidence or identifies risks, use it directly
      if (ruleBasedResult.confidenceScore >= 0.8 || contextAnalysis.riskFactors.length > 0) {
        const result = {
          suggestedAction: ruleBasedResult.suggestedAction,
          reason: ruleBasedResult.reason,
          confidenceScore: ruleBasedResult.confidenceScore
        };
        
        // Log analytics
        try {
          await saveAnalytics('system', {
            type: 'cleanup_proposal',
            method: 'rule_based',
            input: { descriptionLength: input.fileDescription.length },
            output: result,
            analysis: contextAnalysis,
            duration: Date.now() - startTime
          });
        } catch (analyticsError) {
          logger.warn('Failed to save cleanup proposal analytics', {
            error: analyticsError instanceof Error ? analyticsError.message : String(analyticsError)
          });
        }
        
        return result;
      }
      
      // For lower confidence cases, enhance with AI analysis
      try {
        const aiResult = await prompt(input);
        
        if (!aiResult.output) {
          throw new Error('AI model returned no output');
        }
        
        // Validate and potentially adjust AI recommendation for safety
        let finalResult = aiResult.output;
        
        // Safety override: if rule-based analysis found risk factors, be more conservative
        if (contextAnalysis.riskFactors.length > 0 && finalResult.suggestedAction === 'trash') {
          finalResult = {
            suggestedAction: 'no_action',
            reason: 'AI suggested deletion but safety analysis detected potential risks - being conservative.',
            confidenceScore: Math.min(finalResult.confidenceScore, 0.4)
          };
        }
        
        // Combine rule-based and AI confidence
        const combinedConfidence = (ruleBasedResult.confidenceScore + finalResult.confidenceScore) / 2;
        finalResult.confidenceScore = Math.min(finalResult.confidenceScore, combinedConfidence);
        
        logger.info('AI-enhanced cleanup proposal completed', {
          suggestedAction: finalResult.suggestedAction,
          confidence: finalResult.confidenceScore,
          method: 'hybrid',
          duration: Date.now() - startTime
        });
        
        // Log analytics
        try {
          await saveAnalytics('system', {
            type: 'cleanup_proposal',
            method: 'ai_enhanced',
            input: { descriptionLength: input.fileDescription.length },
            output: finalResult,
            analysis: contextAnalysis,
            ruleBasedResult,
            duration: Date.now() - startTime
          });
        } catch (analyticsError) {
          logger.warn('Failed to save cleanup proposal analytics', {
            error: analyticsError instanceof Error ? analyticsError.message : String(analyticsError)
          });
        }
        
        return finalResult;
        
      } catch (aiError) {
        logger.warn('AI model failed, falling back to rule-based result', {
          error: aiError instanceof Error ? aiError.message : String(aiError)
        });
        
        // Fallback to rule-based result with reduced confidence
        return {
          suggestedAction: ruleBasedResult.suggestedAction,
          reason: `${ruleBasedResult.reason} (AI analysis unavailable)`,
          confidenceScore: Math.min(ruleBasedResult.confidenceScore, 0.6)
        };
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Cleanup action proposal failed', {
        error: error instanceof Error ? error.message : String(error),
        duration
      });
      
      // Conservative fallback
      return {
        suggestedAction: 'no_action',
        reason: 'Unable to analyze file safely - no action recommended',
        confidenceScore: 0.0
      };
    }
  }
);
