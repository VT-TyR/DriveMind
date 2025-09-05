

/**
 * @fileOverview Shared types and schemas for AI flows.
 * This file contains the Zod schemas and TypeScript types used across multiple AI-related server actions.
 * By centralizing them here, we avoid violating the "use server" directive which requires
 * that server modules only export async functions.
 */

import { z } from 'zod';
import { FlowAuthSchema } from '@/lib/flow-auth';


// Types for: ai-classify.ts
const AILabelSchema = z.object({
  topics: z.array(z.string()).describe("Array of tags (e.g., [\"finance\",\"invoice\"])"),
  sensitivity: z.enum(["low", "med", "high"]).describe("Sensitivity level (detect PII from names if obvious; else low)"),
  docType: z.string().describe("Semantic document type (e.g., invoice, receipt, contract, photo, note)"),
  summary: z.string().optional().describe("A summary of 20 words or less."),
  suggestedPath: z.array(z.string()).optional().describe("Array of short folder names for organization."),
  confidence: z.number().min(0).max(1).describe("Confidence score from 0 to 1."),
});

export const FileMetadataSchema = z.object({
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().optional(),
  path: z.array(z.string()).optional(),
  modifiedTime: z.string().optional(),
});

export const ClassifyFilesInputSchema = z.object({
  files: z.array(FileMetadataSchema).describe("An array of file metadata to classify."),
  redact: z.boolean().optional().default(true).describe("Whether to redact sensitive information from filenames."),
});
export type ClassifyFilesInput = z.infer<typeof ClassifyFilesInputSchema>;

export const ClassifyFilesOutputSchema = z.object({
  labels: z.array(AILabelSchema.extend({ fileId: z.string() })).describe("An array of labels for the provided files."),
});
export type ClassifyFilesOutput = z.infer<typeof ClassifyFilesOutputSchema>;


// Types for: ai-propose-rules.ts
const CompiledRuleSchema = z.object({
  filter: z.object({
    nameRegex: z.string().optional().describe("Regex to match file name."),
    mimeTypes: z.array(z.string()).optional().describe("List of allowed MIME types."),
    olderThanDays: z.number().optional().describe("File must be older than this many days."),
    minSizeBytes: z.number().optional().describe("Minimum file size in bytes."),
  }),
  action: z.object({
    type: z.enum(["move", "trash", "archive", "rename", "delete"]).describe("Action to perform."),
    dest: z.array(z.string()).optional().describe("Destination path for 'move' action."),
  }),
});

export const ProposeRulesInputSchema = z.object({
  prompt: z.string().describe("Natural language instruction for the rule."),
  auth: FlowAuthSchema,
});
export type ProposeRulesInput = z.infer<typeof ProposeRulesInputSchema>;

export const ProposeRulesOutputSchema = z.object({
  ruleId: z.string(),
  humanPrompt: z.string(),
  compiledRule: CompiledRuleSchema,
  uid: z.string(),
});
export type ProposeRulesOutput = z.infer<typeof ProposeRulesOutputSchema>;


// Types for: ai-simulate-actions.ts
export const FileSchema = z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string(),
    size: z.number(),
    lastModified: z.date(),
    path: z.array(z.string()),
});

export const SimulateActionsInputSchema = z.object({
  rule: CompiledRuleSchema.describe("The compiled rule to simulate."),
  limit: z.number().optional().default(200).describe("Maximum number of proposals to generate."),
  auth: FlowAuthSchema.describe("Authentication context for the user."),
});
export type SimulateActionsInput = z.infer<typeof SimulateActionsInputSchema>;

export const ProposalSchema = z.object({
  type: z.enum(["move", "trash", "archive", "rename"]),
  fileId: z.string(),
  name: z.string(),
  destFolderId: z.string().nullable(),
  reason: z.string(),
  confidence: z.number(),
});

export const SimulateActionsOutputSchema = z.object({
  batchId: z.string(),
  proposals: z.array(ProposalSchema),
});
export type SimulateActionsOutput = z.infer<typeof SimulateActionsOutputSchema>;


// Types for: ai-summarize-folder.ts
export const SummarizeFolderInputSchema = z.object({
  folderId: z.string(),
  files: z.array(FileSchema).describe("An array of file metadata within the folder."),
  limit: z.number().optional().default(200),
});
export type SummarizeFolderInput = z.infer<typeof SummarizeFolderInputSchema>;

export const SummarizeFolderOutputSchema = z.object({
  folderId: z.string(),
  summary: z.string(),
});
export type SummarizeFolderOutput = z.infer<typeof SummarizeFolderOutputSchema>;


// (Removed) Legacy OAuth flow types are no longer used.


// Types for: drive-list-sample.ts
const FileSampleSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  modifiedTime: z.string().optional().nullable(),
});

export const ListSampleFilesInputSchema = z.object({
  auth: FlowAuthSchema,
});
export type ListSampleFilesInput = z.infer<typeof ListSampleFilesInputSchema>;

export const ListSampleFilesOutputSchema = z.object({
  files: z.array(FileSampleSchema),
});
export type ListSampleFilesOutput = z.infer<typeof ListSampleFilesOutputSchema>;


// Types for: propose-cleanup-actions.ts
export const ProposeCleanupActionsInputSchema = z.object({
  fileDescription: z.string().describe('A detailed description of the file, including its content, age, access history, and any other relevant information.'),
});
export type ProposeCleanupActionsInput = z.infer<typeof ProposeCleanupActionsInputSchema>;

export const ProposeCleanupActionsOutputSchema = z.object({
  suggestedAction: z.enum(['trash', 'move', 'archive', 'no_action']).describe('The AI-suggested action to take on the file.'),
  reason: z.string().describe('The AI\'s reasoning for suggesting the action.'),
  confidenceScore: z.number().min(0).max(1).describe('A score between 0 and 1 indicating the AI\'s confidence in the suggested action.'),
});
export type ProposeCleanupActionsOutput = z.infer<typeof ProposeCleanupActionsOutputSchema>;


// Types for: vault-candidate-scoring.ts
export const VaultCandidateScoringInputSchema = z.object({
  fileDescription: z
    .string()
    .describe('The description of the file to be scored.'),
  scoringCriteria: z
    .string()
    .describe('The criteria to use when scoring the file as a vault candidate.'),
});
export type VaultCandidateScoringInput = z.infer<typeof VaultCandidateScoringInputSchema>;

export const VaultCandidateScoringOutputSchema = z.object({
  score: z
    .number()
    .describe(
      'The score of the file as a vault candidate, based on the scoring criteria.'
    ),
  reasoning: z
    .string()
    .describe('The reasoning behind the score assigned to the file.'),
});
export type VaultCandidateScoringOutput = z.infer<typeof VaultCandidateScoringOutputSchema>;

// Types for Action Flows
const ActionConfirmationSchema = z.object({
    required: z.boolean(),
    challenge: z.string(),
    approved: z.boolean(),
    approvedBy: z.string().nullable(),
    approvedAt: z.date().nullable(),
    reauthRequired: z.boolean(),
});
export const ActionPreflightSchema = z.object({
    files: z.array(z.object({
        fileId: z.string(),
        name: z.string(),
        size: z.number(),
        currentParents: z.array(z.string()),
        suggestedParents: z.array(z.string()),
    })),
    tallies: z.object({
        count: z.number(),
        bytes: z.number(),
    }),
    risks: z.array(z.enum(["shared_public"])),
    createdAt: z.date(),
});
const RestorePlanSchema = z.object({
    mode: z.string(),
    parentsByFile: z.record(z.array(z.string())),
    expiresAt: z.date(),
});
const ExecutionResultSchema = z.object({
    fileId: z.string(),
    op: z.string(),
    ok: z.boolean(),
    error: z.string().nullable(),
});
const ExecutionSchema = z.object({
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  results: z.array(ExecutionResultSchema),
});

export const ActionBatchSchema = z.object({
    uid: z.string(),
    source: z.string(),
    proposals: z.array(ProposalSchema),
    status: z.enum(["simulated", "awaiting-confirm", "executing", "executed", "revoked", "failed"]),
    preflight: ActionPreflightSchema.nullable(),
    confirmation: ActionConfirmationSchema.nullable(),
    restorePlan: RestorePlanSchema.nullable(),
    execution: ExecutionSchema.nullable(),
    createdAt: z.date(),
    executedAt: z.date().nullable(),
    error: z.string().nullable(),
});

export const PreflightActionsInputSchema = z.object({
  batchId: z.string(),
  auth: FlowAuthSchema,
});
export type PreflightActionsInput = z.infer<typeof PreflightActionsInputSchema>;

export const PreflightActionsOutputSchema = z.object({
  status: z.string(),
  challenge: z.string(),
});
export type PreflightActionsOutput = z.infer<typeof PreflightActionsOutputSchema>;

export const ConfirmActionsInputSchema = z.object({
  batchId: z.string(),
  challengeResponse: z.string(),
  auth: FlowAuthSchema,
});
export type ConfirmActionsInput = z.infer<typeof ConfirmActionsInputSchema>;

export const ConfirmActionsOutputSchema = z.object({
  status: z.string(),
  message: z.string(),
});
export type ConfirmActionsOutput = z.infer<typeof ConfirmActionsOutputSchema>;

export const ExecuteActionsInputSchema = z.object({
  batchId: z.string(),
  auth: FlowAuthSchema,
});
export type ExecuteActionsInput = z.infer<typeof ExecuteActionsInputSchema>;

export const ExecuteActionsOutputSchema = z.object({
  status: z.string(),
  results: z.array(ExecutionResultSchema),
});
export type ExecuteActionsOutput = z.infer<typeof ExecuteActionsOutputSchema>;

export const RestoreActionsInputSchema = z.object({
  batchId: z.string(),
  fileIds: z.array(z.string()).optional(),
  auth: FlowAuthSchema,
});
export type RestoreActionsInput = z.infer<typeof RestoreActionsInputSchema>;

export const RestoreActionsOutputSchema = z.object({
  status: z.string(),
  restored: z.array(z.string()),
});
export type RestoreActionsOutput = z.infer<typeof RestoreActionsOutputSchema>;


// Types for: ai-propose-folders.ts
export const ProposeFoldersInputSchema = z.object({
  files: z.array(FileSchema).describe("An array of files to organize."),
});
export type ProposeFoldersInput = z.infer<typeof ProposeFoldersInputSchema>;

const FolderSuggestionSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  currentPath: z.string(),
  suggestedPath: z.string(),
  reason: z.string(),
  confidence: z.number(),
});

export const ProposeFoldersOutputSchema = z.object({
  suggestions: z.array(FolderSuggestionSchema),
});
export type ProposeFoldersOutput = z.infer<typeof ProposeFoldersOutputSchema>;


// Types for: local-vault-export.ts
export const ExportToLocalVaultInputSchema = z.object({
  proposals: z.array(ProposalSchema).describe('A list of proposed file cleanup actions.'),
  totalBytes: z.number().describe('Total bytes that will be saved.'),
});
export type ExportToLocalVaultInput = z.infer<typeof ExportToLocalVaultInputSchema>;

export const ExportToLocalVaultOutputSchema = z.object({
  markdownReport: z.string().describe('A summary report of the cleanup actions in Markdown format.'),
});
export type ExportToLocalVaultOutput = z.infer<typeof ExportToLocalVaultOutputSchema>;

// Types for: detect-near-duplicate-files.ts
export const DetectNearDuplicateFilesInputSchema = z.object({
  fileMetadatas: z.array(z.object({
    name: z.string(),
    size: z.number(),
    hash: z.string().optional(),
  })).describe('An array of file metadata to check for near-duplicates.'),
});
export type DetectNearDuplicateFilesInput = z.infer<typeof DetectNearDuplicateFilesInputSchema>;

export const DetectNearDuplicateFilesOutputSchema = z.object({
  nearDuplicateGroups: z.array(z.array(z.string())).describe('Groups of file names that are near-duplicates.'),
});
export type DetectNearDuplicateFilesOutput = z.infer<typeof DetectNearDuplicateFilesOutputSchema>;

// Types for: rules-run.ts
export const RulesRunInputSchema = z.object({
  ruleId: z.string(),
  auth: FlowAuthSchema,
});
export type RulesRunInput = z.infer<typeof RulesRunInputSchema>;

export const RulesRunOutputSchema = z.object({
    batchId: z.string(),
    count: z.number(),
});
export type RulesRunOutput = z.infer<typeof RulesRunOutputSchema>;


// Types for: analytics-build.ts
export const BuildAnalyticsInputSchema = z.object({
    files: z.array(FileSchema),
    auth: FlowAuthSchema,
});
export type BuildAnalyticsInput = z.infer<typeof BuildAnalyticsInputSchema>;

export const BuildAnalyticsOutputSchema = z.object({
    ok: z.boolean(),
    count: z.number(),
});
export type BuildAnalyticsOutput = z.infer<typeof BuildAnalyticsOutputSchema>;


// Types for: risk.ts
export const RiskSensitiveInputSchema = z.object({
    files: z.array(FileSchema),
    auth: FlowAuthSchema,
});
export type RiskSensitiveInput = z.infer<typeof RiskSensitiveInputSchema>;

export const ScanSharesInputSchema = z.object({
  auth: FlowAuthSchema,
});
export type ScanSharesInput = z.infer<typeof ScanSharesInputSchema>;

export const RiskSensitiveOutputSchema = z.object({
  flagged: z.number(),
});
export type RiskSensitiveOutput = z.infer<typeof RiskSensitiveOutputSchema>;

export const ScanSharesOutputSchema = z.object({
  risks: z.number(),
});
export type ScanSharesOutput = z.infer<typeof ScanSharesOutputSchema>;


// Types for: similarity-cluster.ts
export const SimilarityClusterInputSchema = z.object({
  files: z.array(FileSchema),
  auth: FlowAuthSchema,
});
export type SimilarityClusterInput = z.infer<typeof SimilarityClusterInputSchema>;

export const SimilarityClusterOutputSchema = z.object({
  clusters: z.number(),
});
export type SimilarityClusterOutput = z.infer<typeof SimilarityClusterOutputSchema>;

// Types for: snapshots-capture.ts
export const SnapshotCaptureInputSchema = z.object({
  fileId: z.string(),
  batchId: z.string(),
  auth: FlowAuthSchema,
});
export type SnapshotCaptureInput = z.infer<typeof SnapshotCaptureInputSchema>;

export const SnapshotCaptureOutputSchema = z.object({
  snapshotPath: z.string(),
});
export type SnapshotCaptureOutput = z.infer<typeof SnapshotCaptureOutputSchema>;


// Types for: validate-health.ts
export const ValidateHealthInputSchema = z.object({
  auth: FlowAuthSchema,
});
export type ValidateHealthInput = z.infer<typeof ValidateHealthInputSchema>;


// Types for: versions-link.ts
export const VersionsLinkInputSchema = z.object({
  files: z.array(FileSchema),
  auth: FlowAuthSchema,
});
export type VersionsLinkInput = z.infer<typeof VersionsLinkInputSchema>;

export const VersionsLinkOutputSchema = z.object({
    chains: z.number(),
});
export type VersionsLinkOutput = z.infer<typeof VersionsLinkOutputSchema>;
