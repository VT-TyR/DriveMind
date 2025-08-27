
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

// In a real app, this would be defined in a shared types file.
const AnalyticsDataSchema = z.object({
  uid: z.string(),
  byMime: z.record(z.object({ count: z.number(), bytes: z.number() })),
  byDepth: z.record(z.object({ count: z.number(), bytes: z.number() })),
  byMonth: z.record(z.object({ createdCount: z.number(), modifiedCount: z.number(), bytes: z.number() })),
  updatedAt: z.date(),
});
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;

// Mock datastore write
async function saveAnalytics(analytics: AnalyticsData) {
    console.log(`Faking save for analytics data for user '${analytics.uid}'`, analytics);
    return;
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
    
    const byMime:any = {}, byDepth:any = {}, byMonth:any = {};
    files.forEach(f => {
      const mg = (f.mimeType||"other").split("/")[0];
      byMime[mg] = byMime[mg] || { count:0, bytes:0 };
      byMime[mg].count++; 
      byMime[mg].bytes += Number(f.size||0);

      // In a real app, path would be stored with the file record.
      const depth = Array.isArray(f.path) ? f.path.length : 0;
      byDepth[depth] = byDepth[depth] || { count:0, bytes:0 };
      byDepth[depth].count++; 
      byDepth[depth].bytes += Number(f.size||0);

      const m = f.lastModified ? f.lastModified.toISOString().slice(0,7) : "unknown";
      byMonth[m] = byMonth[m] || { createdCount:0, modifiedCount:0, bytes:0 };
      byMonth[m].modifiedCount++; 
      byMonth[m].bytes += Number(f.size||0);
    });

    await saveAnalytics({ 
        uid: user.uid, 
        byMime, 
        byDepth, 
        byMonth, 
        updatedAt: new Date() 
    });

    return { ok: true, count: files.length };
  }
);

    
