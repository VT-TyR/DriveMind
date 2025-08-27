
'use server';
/**
 * @fileOverview A flow to cluster similar files based on fuzzy name matching.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { SimilarityClusterInputSchema, SimilarityClusterInput, SimilarityClusterOutputSchema, SimilarityClusterOutput } from '@/lib/ai-types';
import { FileSchema } from '@/lib/ai-types';

// Mock datastore write
async function saveSimilarityCluster(clusterId: string, clusterData: any) {
    // In a real app, this would write to a database.
    return;
}

export async function similarityCluster(input: SimilarityClusterInput): Promise<SimilarityClusterOutput> {
  return similarityClusterFlow(input);
}

const similarityClusterFlow = ai.defineFlow(
  {
    name: 'similarityClusterFlow',
    inputSchema: SimilarityClusterInputSchema,
    outputSchema: SimilarityClusterOutputSchema,
  },
  async ({ files, auth }: SimilarityClusterInput) => {
    const user = getAuthenticatedUserSync(auth);
    const byFuzzy: Record<string, any[]> = {};
    
    files.forEach(f => {
      // In a real app, fuzzyKey would be pre-calculated.
      const fk = (f.name||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
      (byFuzzy[fk] ||= []).push(f);
    });

    let clusters = 0;
    for (const [fk, arr] of Object.entries(byFuzzy)) {
      if (arr.length < 2) continue;
      const clusterId = `${user.uid}_sim_${Buffer.from(fk).toString("base64").slice(0,16)}`;
      await saveSimilarityCluster(clusterId, {
        uid: user.uid,
        strategy: "name_size",
        members: arr.slice(0,20).map(x => ({ fileId: x.id, score: 0.6 })),
        createdAt: new Date(),
      });
      clusters++;
    }
    return { clusters };
  }
);

    
