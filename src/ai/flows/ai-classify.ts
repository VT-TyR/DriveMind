

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
    console.warn('Classification using AI failed, using fallback classification:', error.message);
    
    // Create intelligent fallback labels based on file metadata
    const labels = input.files.map((f) => {
      const mimeType = f.mimeType || "";
      const fileName = (f.name || "").toLowerCase();
      
      // Determine topics based on file name and type
      let topics = ["documents"];
      if (mimeType.includes("image")) topics = ["media", "images"];
      else if (mimeType.includes("video")) topics = ["media", "videos"];
      else if (mimeType.includes("spreadsheet")) topics = ["data", "spreadsheets"];
      else if (mimeType.includes("presentation")) topics = ["presentations"];
      else if (fileName.includes("invoice")) topics = ["finance", "invoices"];
      else if (fileName.includes("receipt")) topics = ["finance", "receipts"];
      else if (fileName.includes("contract")) topics = ["legal", "contracts"];
      else if (fileName.includes("photo") || fileName.includes("img")) topics = ["media", "photos"];
      
      // Determine document type
      let docType = "document";
      if (mimeType.includes("image")) docType = "photo";
      else if (mimeType.includes("video")) docType = "video";
      else if (mimeType.includes("spreadsheet")) docType = "spreadsheet";
      else if (mimeType.includes("presentation")) docType = "presentation";
      else if (mimeType === "application/pdf") docType = "pdf";
      
      // Simple sensitivity detection
      const sensitivity = (fileName.includes("confidential") || fileName.includes("private") || 
                          fileName.includes("ssn") || fileName.includes("personal")) ? "high" : "low";
      
      return {
        fileId: f.fileId,
        topics,
        sensitivity: sensitivity as const,
        docType,
        summary: `Classified based on file metadata: ${f.name?.slice(0, 30) || "Unknown file"}`,
        suggestedPath: topics[0] === "media" ? ["Media", topics[1] || "Files"] : 
                      topics[0] === "finance" ? ["Documents", "Finance", topics[1] || "General"] :
                      ["Documents", "General"],
        confidence: 0.6, // Moderate confidence for metadata-based classification
      };
    });
    
    return { labels };
  }
}
