
'use server';
/**
 * @fileOverview Stubs for risk detection flows.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { FileSchema } from '@/lib/ai-types';
import { logger } from '@/lib/logger';
import { saveAnalytics } from '@/lib/firebase-db';
import { driveFor } from '@/lib/google-drive';
import { 
    RiskSensitiveInputSchema,
    RiskSensitiveOutputSchema,
    RiskSensitiveInput,
    RiskSensitiveOutput,
    ScanSharesInputSchema,
    ScanSharesInput,
    ScanSharesOutputSchema,
    ScanSharesOutput,
} from '@/lib/ai-types';


// In a real app, this would be defined in a shared types file.
const SensitiveFlagSchema = z.object({
  uid: z.string(),
  fileId: z.string(),
  patterns: z.array(z.string()),
  confidence: z.number(),
  detectedAt: z.date(),
});
export type SensitiveFlag = z.infer<typeof SensitiveFlagSchema>;

async function saveSensitiveFlag(flag: SensitiveFlag) {
    try {
        await saveAnalytics(flag.uid, {
            type: 'sensitive_flag',
            ...flag,
            detectedAt: flag.detectedAt.toISOString(),
        });
        logger.info('Sensitive flag saved', { fileId: flag.fileId, patterns: flag.patterns });
    } catch (error) {
        logger.error('Failed to save sensitive flag', error as Error, { fileId: flag.fileId });
        throw error;
    }
}

export async function riskSensitive(input: RiskSensitiveInput): Promise<RiskSensitiveOutput> {
  return riskSensitiveFlow(input);
}

const riskSensitiveFlow = ai.defineFlow(
  {
    name: 'riskSensitiveFlow',
    inputSchema: RiskSensitiveInputSchema,
    outputSchema: RiskSensitiveOutputSchema,
  },
  async ({ files, auth }: RiskSensitiveInput) => {
    const user = getAuthenticatedUserSync(auth);
    let flagged = 0;
    
    logger.info('Starting sensitive content detection', { 
      uid: user.uid, 
      fileCount: files.length 
    });

    // Enhanced pattern detection for sensitive content
    const sensitivePatterns = {
      ssn: /\b\d{3}-?\d{2}-?\d{4}\b/,
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      secrets: /(?:key|secret|password|token|api[-_]?key|private[-_]?key)/i,
      financial: /(?:bank|account|routing|iban|bic|swift)/i,
      medical: /(?:ssn|dob|patient|medical|hipaa|phi)/i,
    };

    for (const f of files) {
        const name = (f.name || "").toLowerCase();
        const patterns: string[] = [];
        let maxConfidence = 0;

        // Check filename patterns
        for (const [patternName, regex] of Object.entries(sensitivePatterns)) {
            if (regex.test(name)) {
                patterns.push(patternName);
                maxConfidence = Math.max(maxConfidence, 0.8);
            }
        }

        // Additional context-based scoring
        if (name.includes('confidential') || name.includes('private')) {
            patterns.push('marked_confidential');
            maxConfidence = Math.max(maxConfidence, 0.9);
        }

        if (patterns.length > 0) {
          await saveSensitiveFlag({
            uid: user.uid,
            fileId: f.id,
            patterns,
            confidence: maxConfidence,
            detectedAt: new Date(),
          });
          flagged++;
        }
    }
    
    logger.info('Sensitive content detection completed', { 
      uid: user.uid, 
      flaggedFiles: flagged,
      totalFiles: files.length 
    });

    return { flagged };
  }
);

export async function scanShares(input: ScanSharesInput): Promise<ScanSharesOutput> {
    return riskScanSharesFlow(input);
}

const riskScanSharesFlow = ai.defineFlow(
    {
      name: 'riskScanSharesFlow',
      inputSchema: ScanSharesInputSchema,
      outputSchema: ScanSharesOutputSchema,
    },
    async ({ auth }: ScanSharesInput) => {
      const user = getAuthenticatedUserSync(auth);
      
      logger.info('Starting share risk analysis', { uid: user.uid });
      
      try {
        const drive = await driveFor(user.uid);
        let risks = 0;
        
        // Get files that are shared publicly
        const publicFilesResponse = await drive.files.list({
          q: "visibility = 'anyoneCanFind' or visibility = 'anyoneWithLink'",
          fields: 'files(id,name,permissions,visibility)',
          pageSize: 1000,
        });
        
        const publicFiles = publicFilesResponse.data.files || [];
        
        // Get files with external sharing
        const sharedFilesResponse = await drive.files.list({
          q: "sharedWithMe = false and 'me' in owners",
          fields: 'files(id,name,permissions)',
          pageSize: 1000,
        });
        
        const sharedFiles = sharedFilesResponse.data.files || [];
        
        // Analyze sharing risks
        for (const file of publicFiles) {
          risks++; // Public files are inherently risky
        }
        
        for (const file of sharedFiles) {
          const permissions = file.permissions || [];
          const externalShares = permissions.filter(p => 
            p.type === 'user' && 
            p.emailAddress && 
            !p.emailAddress.endsWith('@gmail.com') // Simplified external domain detection
          );
          
          if (externalShares.length > 0) {
            risks++;
          }
        }
        
        logger.info('Share risk analysis completed', { 
          uid: user.uid, 
          risks,
          publicFiles: publicFiles.length,
          sharedFiles: sharedFiles.length 
        });
        
        return { risks };
      } catch (error) {
        logger.error('Failed to analyze sharing risks', error as Error, { uid: user.uid });
        return { risks: 0 };
      }
    }
);
