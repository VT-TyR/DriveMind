
'use server';
/**
 * @fileOverview A flow to generate proactive recommendations for the user.
 * This flow would scan user files and create recommendation cards on the dashboard.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync, FlowAuthSchema } from '@/lib/flow-auth';
import { listSampleFiles } from './drive-list-sample';
import { logger } from '@/lib/logger';
import { createFirebaseAdmin } from '@/lib/firebase';

// In a real app, this would be defined in a shared types file.
const RecommendationSchema = z.object({
  uid: z.string(),
  kind: z.enum(["cleanup", "organize"]),
  title: z.string(),
  body: z.string(),
  batchId: z.string().optional(),
  createdAt: z.date(),
  dismissed: z.boolean(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const RecommendInputSchema = z.object({
    auth: FlowAuthSchema,
});
export type RecommendInput = z.infer<typeof RecommendInputSchema>;

export const RecommendOutputSchema = z.object({
  recommendations: z.array(RecommendationSchema),
});
export type RecommendOutput = z.infer<typeof RecommendOutputSchema>;

async function saveRecommendation(rec: Recommendation) {
    try {
        const admin = await createFirebaseAdmin();
        await admin.firestore().collection('recommendations').add({
            ...rec,
            createdAt: rec.createdAt.toISOString(),
        });
        logger.info('Recommendation saved', { title: rec.title, uid: rec.uid });
    } catch (error) {
        logger.error('Failed to save recommendation', error as Error, { title: rec.title });
        throw error;
    }
}

export async function recommend(input: RecommendInput): Promise<RecommendOutput> {
  return recommendFlow(input);
}

const recommendFlow = ai.defineFlow(
  {
    name: 'recommendFlow',
    inputSchema: RecommendInputSchema,
    outputSchema: RecommendOutputSchema,
  },
  async ({ auth }: RecommendInput) => {
    const user = getAuthenticatedUserSync(auth);
    logger.info('Generating recommendations for user', { uid: user.uid });
    
    try {
      // 1. Scan user files from Google Drive
      const { files: driveFiles } = await listSampleFiles({ auth });
      
      const recommendations: Recommendation[] = [];
      
      // 2. Identify patterns and generate recommendations
      const largeFiles = driveFiles.filter(f => Number(f.size || 0) > 100 * 1024 * 1024); // > 100MB
      if (largeFiles.length > 5) {
        recommendations.push({
          uid: user.uid,
          kind: 'cleanup',
          title: 'Clean up Large Files',
          body: `You have ${largeFiles.length} files larger than 100MB taking up significant space.`,
          batchId: `batch_large_files_${Date.now()}`,
          createdAt: new Date(),
          dismissed: false,
        });
      }
      
      const oldFiles = driveFiles.filter(f => {
        const modTime = f.modifiedTime ? new Date(f.modifiedTime) : new Date();
        const daysDiff = (Date.now() - modTime.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff > 365; // Older than 1 year
      });
      
      if (oldFiles.length > 10) {
        recommendations.push({
          uid: user.uid,
          kind: 'cleanup',
          title: 'Archive Old Files',
          body: `${oldFiles.length} files haven't been modified in over a year and could be archived.`,
          batchId: `batch_old_files_${Date.now()}`,
          createdAt: new Date(),
          dismissed: false,
        });
      }
      
      // Check for organization opportunities
      const rootFiles = driveFiles.filter(f => !f.parents || f.parents.includes('root'));
      if (rootFiles.length > 20) {
        recommendations.push({
          uid: user.uid,
          kind: 'organize',
          title: 'Organize Root Directory',
          body: `${rootFiles.length} files in your root directory could be better organized into folders.`,
          createdAt: new Date(),
          dismissed: false,
        });
      }
      
      // 3. Save recommendations to Firestore
      for (const rec of recommendations) {
        await saveRecommendation(rec);
      }
      
      logger.info('Recommendations generated', { 
        uid: user.uid, 
        count: recommendations.length,
        totalFiles: driveFiles.length 
      });

      return { recommendations };
    } catch (error) {
      logger.error('Failed to generate recommendations', error as Error, { uid: user.uid });
      return { recommendations: [] };
    }
  }
);

    
