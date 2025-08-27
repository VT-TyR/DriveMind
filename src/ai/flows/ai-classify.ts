

'use server';

/**
 * @fileOverview A flow to classify files by type/topic using AI.
 *
 * - classifyFiles - A function that analyzes file metadata and assigns labels.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
    ClassifyFilesInput,
    ClassifyFilesInputSchema,
    ClassifyFilesOutput,
    ClassifyFilesOutputSchema,
    FileMetadataSchema,
} from '@/lib/ai-types';

// Helper function to build a compact metadata representation for the prompt
function buildMetadataString(files: z.infer<typeof FileMetadataSchema>[], opts: { redact: boolean }) {
  const rows = files.map(f => ({
    name: opts.redact ? (f.name || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[redacted-email]") : (f.name || ''),
    mimeType: f.mimeType || '',
    size: f.size || 0,
    path: (f.path || []).slice(-3),
    modifiedTime: f.modifiedTime,
  }));
  return JSON.stringify(rows, null, 2);
}

const AILabelSchema = z.object({
    topics: z.array(z.string()).describe("Array of tags (e.g., [\"finance\",\"invoice\"])"),
    sensitivity: z.enum(["low", "med", "high"]).describe("Sensitivity level (detect PII from names if obvious; else low)"),
    docType: z.string().describe("Semantic document type (e.g., invoice, receipt, contract, photo, note)"),
    summary: z.string().optional().describe("A summary of 20 words or less."),
    suggestedPath: z.array(z.string()).optional().describe("Array of short folder names for organization."),
    confidence: z.number().min(0).max(1).describe("Confidence score from 0 to 1."),
});

const classifyFilesFlow = ai.defineFlow(
  {
    name: 'classifyFilesFlow',
    inputSchema: ClassifyFilesInputSchema,
    outputSchema: ClassifyFilesOutputSchema,
  },
  async (input) => {
    // In a real scenario, you would first check user settings for aiMode.
    // For this implementation, we proceed directly to the AI call.
    
    const filesAsJson = buildMetadataString(input.files, { redact: input.redact ?? true });

    const prompt = ai.definePrompt({
      name: 'classifyFilesPrompt',
      input: { schema: z.object({ filesAsJson: z.string() }) },
      output: { schema: z.object({ labels: z.array(AILabelSchema) }) },
      prompt: `You are an expert at classifying Google Drive items for organization. For each object in the input JSON, return a corresponding JSON object with the following fields:
- topics: array of tags (e.g., ["finance","invoice"])
- sensitivity: "low"|"med"|"high" (detect PII from names if obvious; else low)
- docType: a single semantic type (e.g., invoice, receipt, contract, photo, note, report, code, backup, temp, archive)
- suggestedPath: array of short folder names (e.g., ["Finance","Invoices","2025"])
- summary: a concise summary of 20 words or less
- confidence: a score from 0 to 1

Input JSON:
{{{filesAsJson}}}

Return a strict JSON object with a single key "labels" containing an array of your classifications in the same order as the input. Do not include the fileId in your output.`,
    });

    const { output } = await prompt({ filesAsJson });
    
    if (!output?.labels) {
      // Fallback to stub/demo if LLM fails
      const labels = input.files.map((f) => ({
        fileId: f.fileId,
        topics: (f.mimeType || "").includes("image") ? ["media", "photo"] : ["docs"],
        sensitivity: "low" as const,
        docType: (f.mimeType || "").includes("spreadsheet") ? "sheet" : ((f.mimeType || "").includes("image") ? "photo" : "document"),
        summary: `Auto-labeled ${f.name?.slice(0, 40) || ""}`,
        suggestedPath: ["_Unsorted"],
        confidence: 0.65,
      }));
      return { labels };
    }

    const labelsWithFileIds = output.labels.map((label, i) => ({
        ...label,
        fileId: input.files[i].fileId,
    }));

    return { labels: labelsWithFileIds };
  }
);

export async function classifyFiles(
  input: ClassifyFilesInput
): Promise<ClassifyFilesOutput> {
  try {
    return await classifyFilesFlow(input);
  } catch (error: any) {
    console.error('Classification failed, falling back to stub data:', error);
    
    // If API key is missing or Genkit fails, return stub data
    const labels = input.files.map((f) => ({
      fileId: f.fileId,
      topics: (f.mimeType || "").includes("image") ? ["media", "photo"] : ["docs"],
      sensitivity: "low" as const,
      docType: (f.mimeType || "").includes("spreadsheet") ? "sheet" : ((f.mimeType || "").includes("image") ? "photo" : "document"),
      summary: `Auto-labeled ${f.name?.slice(0, 40) || ""}`,
      suggestedPath: ["_Unsorted"],
      confidence: 0.65,
    }));
    
    return { labels };
  }
}
