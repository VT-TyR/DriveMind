
'use server';
/**
 * @fileOverview This flow aggregates file metadata to build
 * analytics data for dashboard visualizations like heatmaps and charts.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { BuildAnalyticsInputSchema, BuildAnalyticsOutputSchema, BuildAnalyticsInput, BuildAnalyticsOutput } from '@/lib/ai-types';
import { FileSchema } from '@/lib/ai-types';
import { logger } from '@/lib/logger';
import { createFirebaseAdmin } from '@/lib/firebase-db';

// In a real app, this would be defined in a shared types file.
const AnalyticsDataSchema = z.object({
  uid: z.string(),
  byMime: z.record(z.object({ count: z.number(), bytes: z.number() })),
  byDepth: z.record(z.object({ count: z.number(), bytes: z.number() })),
  byMonth: z.record(z.object({ createdCount: z.number(), modifiedCount: z.number(), bytes: z.number() })),
  updatedAt: z.date(),
});
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;

async function saveAnalytics(analytics: AnalyticsData) {
    try {
        const admin = await createFirebaseAdmin();
        const analyticsRef = admin.firestore().collection('analytics').doc(analytics.uid);
        
        await analyticsRef.set({
            ...analytics,
            updatedAt: analytics.updatedAt.toISOString(),
        }, { merge: true });
        
        logger.info('Analytics data saved', { 
            uid: analytics.uid, 
            mimeTypes: Object.keys(analytics.byMime).length,
            depthLevels: Object.keys(analytics.byDepth).length,
            monthsTracked: Object.keys(analytics.byMonth).length 
        });
    } catch (error) {
        logger.error('Failed to save analytics data', error as Error, { uid: analytics.uid });
        throw error;
    }
}

export async function buildAnalytics(input: BuildAnalyticsInput): Promise<BuildAnalyticsOutput> {
  return buildAnalyticsFlow(input);
}

const buildAnalyticsFlow = ai.defineFlow(
  {
    name: 'buildAnalyticsFlow',
    inputSchema: BuildAnalyticsInputSchema,
    outputSchema: BuildAnalyticsOutputSchema,
  },
  async ({ files, auth }: BuildAnalyticsInput) => {
    const user = getAuthenticatedUserSync(auth);
    
    logger.info('Building analytics data', { uid: user.uid, fileCount: files.length });
    
    const byMime: any = {}, byDepth: any = {}, byMonth: any = {};
    let totalBytes = 0;
    
    files.forEach(f => {
      const fileSize = Number(f.size || 0);
      totalBytes += fileSize;
      
      // Group by MIME type
      const mimeGroup = (f.mimeType || "other").split("/")[0];
      byMime[mimeGroup] = byMime[mimeGroup] || { count: 0, bytes: 0 };
      byMime[mimeGroup].count++; 
      byMime[mimeGroup].bytes += fileSize;

      // Group by folder depth
      const depth = Array.isArray(f.path) ? f.path.length : 0;
      byDepth[depth] = byDepth[depth] || { count: 0, bytes: 0 };
      byDepth[depth].count++; 
      byDepth[depth].bytes += fileSize;

      // Group by modification month
      const month = f.lastModified ? f.lastModified.toISOString().slice(0, 7) : "unknown";
      byMonth[month] = byMonth[month] || { createdCount: 0, modifiedCount: 0, bytes: 0 };
      byMonth[month].modifiedCount++; 
      byMonth[month].bytes += fileSize;
    });

    const analytics: AnalyticsData = {
        uid: user.uid, 
        byMime, 
        byDepth, 
        byMonth, 
        updatedAt: new Date() 
    };

    await saveAnalytics(analytics);
    
    logger.info('Analytics build completed', { 
      uid: user.uid, 
      fileCount: files.length,
      totalBytes,
      mimeTypes: Object.keys(byMime).length,
      depthLevels: Object.keys(byDepth).length
    });

    return { ok: true, count: files.length };
  }
);

    
