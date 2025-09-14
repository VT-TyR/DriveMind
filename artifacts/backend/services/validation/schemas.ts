/**
 * Comprehensive Request/Response Validation Schemas - ALPHA Standards
 * Zod schemas for all API endpoints with strict validation
 */

import { z } from 'zod';

// Common validation patterns
export const IdSchema = z.string().min(1, 'ID cannot be empty');
export const UserIdSchema = z.string().min(1, 'User ID is required');
export const TimestampSchema = z.string().datetime();
export const UrlSchema = z.string().url('Must be a valid URL');
export const EmailSchema = z.string().email('Must be a valid email');

// Authentication Schemas
export const OAuthBeginRequestSchema = z.object({
  userId: z.string().optional(),
  returnUrl: UrlSchema.optional(),
}).strict();

export const OAuthBeginResponseSchema = z.object({
  url: UrlSchema,
  state: z.string().optional(),
});

export const OAuthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const OAuthCallbackRequestSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
  error: z.string().optional(),
}).strict();

export const OAuthCallbackResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userId: z.string().optional(),
});

export const AuthStatusResponseSchema = z.object({
  authenticated: z.boolean(),
  hasValidToken: z.boolean(),
  tokenExpiry: TimestampSchema.optional(),
  scopes: z.array(z.string()).optional(),
  userId: z.string().optional(),
});

export const TokenSyncRequestSchema = z.object({
  userId: UserIdSchema,
}).strict();

export const TokenSyncResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Drive Scan Schemas
export const ScanRequestSchema = z.object({
  maxDepth: z.number().int().min(1).max(50).default(20),
  includeTrashed: z.boolean().default(false),
  scanSharedDrives: z.boolean().default(false),
  parentId: z.string().optional(),
}).strict();

export const BackgroundScanRequestSchema = z.object({
  userId: UserIdSchema,
  maxDepth: z.number().int().min(1).max(50).default(20),
  includeTrashed: z.boolean().default(false),
  scanSharedDrives: z.boolean().default(false),
}).strict();

export const BackgroundScanResponseSchema = z.object({
  scanId: z.string(),
  status: z.enum(['queued', 'running']),
  estimatedCompletion: TimestampSchema.optional(),
});

export const ScanStatusQuerySchema = z.object({
  scanId: z.string().optional(),
  userId: UserIdSchema,
});

export const FileInfoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  type: z.enum(['Document', 'Spreadsheet', 'Presentation', 'Image', 'Video', 'PDF', 'Folder', 'Other']),
  size: z.number().int().min(0),
  lastModified: TimestampSchema,
  path: z.array(z.string()),
  isDuplicate: z.boolean().optional(),
  vaultScore: z.number().min(0).max(100).nullable().optional(),
  mimeType: z.string(),
  webViewLink: UrlSchema,
});

export const ScanResultSchema = z.object({
  scanId: z.string(),
  totalFiles: z.number().int().min(0),
  totalSize: z.number().int().min(0),
  filesByType: z.record(z.string(), z.number().int().min(0)),
  folderDepth: z.number().int().min(0),
  duplicateFiles: z.number().int().min(0),
  unusedFiles: z.number().int().min(0),
  largestFiles: z.array(FileInfoSchema),
  completedAt: TimestampSchema,
  processingTime: z.number().min(0),
});

export const ScanStatusResponseSchema = z.object({
  scanId: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  startTime: TimestampSchema,
  completedAt: TimestampSchema.nullable().optional(),
  filesProcessed: z.number().int().min(0),
  totalFiles: z.number().int().min(0),
  error: z.string().nullable().optional(),
  results: ScanResultSchema.nullable().optional(),
});

// Duplicate Detection Schemas
export const DuplicateDetectionRequestSchema = z.object({
  algorithm: z.enum(['content_hash', 'fuzzy_match', 'combined']).default('combined'),
  threshold: z.number().min(0.1).max(1.0).default(0.85),
  includeVersions: z.boolean().default(true),
}).strict();

export const DuplicateGroupSchema = z.object({
  groupId: z.string(),
  files: z.array(FileInfoSchema).min(2),
  duplicateType: z.enum(['exact_match', 'content_hash', 'fuzzy_match', 'version_series']),
  similarityScore: z.number().min(0).max(1),
  recommendation: z.enum(['keep_newest', 'keep_largest', 'manual_review']),
  spaceWasted: z.number().int().min(0),
});

export const DuplicateDetectionResponseSchema = z.object({
  duplicateGroups: z.array(DuplicateGroupSchema),
  summary: z.object({
    totalFiles: z.number().int().min(0),
    duplicateFiles: z.number().int().min(0),
    spaceWasted: z.number().int().min(0),
    duplicateGroups: z.number().int().min(0),
  }),
});

// AI Classification Schemas
export const AIClassificationRequestSchema = z.object({
  fileIds: z.array(IdSchema).min(1).max(100),
  categories: z.array(z.string()).optional(),
  includeContent: z.boolean().default(false),
}).strict();

export const FileClassificationSchema = z.object({
  fileId: IdSchema,
  fileName: z.string(),
  category: z.string(),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
  reasoning: z.string(),
});

export const AIClassificationResponseSchema = z.object({
  classifications: z.array(FileClassificationSchema),
});

export const AIRuleProposalRequestSchema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters'),
  sampleFiles: z.array(IdSchema).optional(),
  targetFolder: z.string().optional(),
}).strict();

export const OrganizationRuleConditionsSchema = z.object({
  fileTypes: z.array(z.string()).optional(),
  namePattern: z.string().optional(),
  sizeRange: z.object({
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
  }).optional(),
  dateRange: z.object({
    after: TimestampSchema.optional(),
    before: TimestampSchema.optional(),
  }).optional(),
});

export const OrganizationRuleSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string(),
  pattern: z.string(),
  action: z.enum(['move', 'rename', 'tag', 'organize']),
  target: z.string(),
  conditions: OrganizationRuleConditionsSchema,
  isActive: z.boolean(),
  priority: z.number().int().min(1).max(100),
  createdAt: TimestampSchema,
  lastApplied: TimestampSchema.nullable().optional(),
});

export const OrganizationSuggestionSchema = z.object({
  id: IdSchema,
  type: z.enum(['folder_creation', 'file_move', 'folder_rename', 'structure_optimization']),
  title: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  impact: z.enum(['low', 'medium', 'high']),
  affectedFiles: z.number().int().min(0),
  estimatedTimeMinutes: z.number().int().min(0),
  prerequisites: z.array(z.string()),
});

export const OrganizeRequestSchema = z.object({
  analysisType: z.enum(['structure', 'content', 'both']).default('both'),
  maxSuggestions: z.number().int().min(1).max(50).default(10),
  focusArea: z.enum(['downloads', 'documents', 'media', 'all']).default('all'),
}).strict();

export const OrganizeResponseSchema = z.object({
  suggestions: z.array(OrganizationSuggestionSchema),
  folderStructure: z.record(z.any()),
  rules: z.array(OrganizationRuleSchema),
});

// File Operations Schemas
export const BatchFileOperationRequestSchema = z.object({
  fileIds: z.array(IdSchema).min(1).max(100),
  operation: z.enum(['move', 'copy', 'delete', 'restore']),
  targetFolderId: z.string().optional(),
}).strict();

export const BatchOperationResultSchema = z.object({
  successful: z.array(IdSchema),
  failed: z.array(z.object({
    fileId: IdSchema,
    error: z.string(),
  })),
});

// System Health Schemas
export const DependencyHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  message: z.string().optional(),
  latency: z.number().optional(),
  lastCheck: TimestampSchema.optional(),
});

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  timestamp: TimestampSchema,
  environment: z.string(),
  dependencies: z.object({
    firebase: DependencyHealthSchema,
    google_auth: DependencyHealthSchema,
    google_drive: DependencyHealthSchema,
    gemini: DependencyHealthSchema.optional(),
  }),
  metrics: z.object({
    memory: z.object({
      rss: z.number().int(),
      heapTotal: z.number().int(),
      heapUsed: z.number().int(),
      external: z.number().int(),
    }),
    cpu: z.object({
      user: z.number().int(),
      system: z.number().int(),
    }),
  }),
});

export const MetricsResponseSchema = z.object({
  timestamp: TimestampSchema,
  application: z.object({
    name: z.string(),
    version: z.string(),
    environment: z.string(),
    uptime: z.number(),
  }),
  system: z.object({
    memory: z.object({
      rss: z.number().int(),
      heapTotal: z.number().int(),
      heapUsed: z.number().int(),
    }),
    cpu: z.object({
      user: z.number().int(),
      system: z.number().int(),
    }),
    platform: z.string(),
    nodeVersion: z.string(),
  }),
  business: z.object({
    activeUsers: z.number().int(),
    filesProcessed: z.number().int(),
    duplicatesDetected: z.number().int(),
    aiInsightsGenerated: z.number().int(),
  }),
});

export const CustomMetricRequestSchema = z.object({
  event: z.string(),
  data: z.record(z.any()),
  timestamp: TimestampSchema.optional(),
}).strict();

export const CustomMetricResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  timestamp: TimestampSchema,
});

// Error Response Schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.string().optional(),
  timestamp: TimestampSchema,
  requestId: z.string().optional(),
});

// Validation helper functions
export const validateRequest = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
};

export const validateResponse = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error('Response validation failed:', error);
    // In production, log this but don't throw to avoid breaking API responses
    return data as T;
  }
};

// Request context schema for logging
export const RequestContextSchema = z.object({
  requestId: z.string(),
  userId: z.string().optional(),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
  method: z.string(),
  path: z.string(),
  timestamp: TimestampSchema,
});

export type RequestContext = z.infer<typeof RequestContextSchema>;

// Type exports for use in services
export type OAuthBeginRequest = z.infer<typeof OAuthBeginRequestSchema>;
export type OAuthCallbackRequest = z.infer<typeof OAuthCallbackRequestSchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type BackgroundScanRequest = z.infer<typeof BackgroundScanRequestSchema>;
export type DuplicateDetectionRequest = z.infer<typeof DuplicateDetectionRequestSchema>;
export type AIClassificationRequest = z.infer<typeof AIClassificationRequestSchema>;
export type OrganizeRequest = z.infer<typeof OrganizeRequestSchema>;
export type BatchFileOperationRequest = z.infer<typeof BatchFileOperationRequestSchema>;
export type CustomMetricRequest = z.infer<typeof CustomMetricRequestSchema>;
export type DriveFile = z.infer<typeof FileInfoSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;
export type OrganizationRule = z.infer<typeof OrganizationRuleSchema>;
export type OrganizationSuggestion = z.infer<typeof OrganizationSuggestionSchema>;