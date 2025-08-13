
'use server';
/**
 * @fileOverview A flow to detect version chains in files (e.g. file.txt, file (1).txt).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUser } from '@/lib/flow-auth';
import { VersionsLinkInputSchema, VersionsLinkInput, VersionsLinkOutputSchema, VersionsLinkOutput } from '@/lib/ai-types';
import { FileSchema } from '@/lib/ai-types';

// Mock datastore write
async function saveVersionChain(chainId: string, chainData: any) {
    console.log(`Faking save for version chain ${chainId}`, chainData);
    return;
}

export async function versionsLink(input: VersionsLinkInput): Promise<VersionsLinkOutput> {
  return versionsLinkFlow(input);
}

const versionsLinkFlow = ai.defineFlow(
  {
    name: 'versionsLinkFlow',
    inputSchema: VersionsLinkInputSchema,
    outputSchema: VersionsLinkOutputSchema,
  },
  async ({ files, auth }) => {
    const user = getAuthenticatedUser(auth);
    const buckets: Record<string, any[]> = {};
    
    function base(name:string) { 
        return (name||"").replace(/\s*\(\d+\)|\s*copy|_v\d+| - copy/i, "").trim().toLowerCase(); 
    }

    files.forEach(f => {
      const k = `${base(f.name)}|${f.mimeType||"any"}`;
      (buckets[k] ||= []).push(f);
    });

    let created = 0;
    for (const [k, arr] of Object.entries(buckets)) {
      if (arr.length < 2) continue;
      arr.sort((a,b) => b.lastModified.getTime() - a.lastModified.getTime());
      
      const chainId = `${user.uid}_${Buffer.from(k).toString("base64").slice(0,16)}`;
      await saveVersionChain(chainId, {
        uid: user.uid,
        key: k,
        members: arr.map(x => ({ fileId: x.id, modifiedTime: x.lastModified })),
        winner: arr[0].id,
        createdAt: new Date(),
      });
      created++;
    }
    return { chains: created };
  }
);

    
