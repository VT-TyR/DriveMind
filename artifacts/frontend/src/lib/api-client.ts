/**
 * Production-ready API client with schema-safe types and comprehensive error handling
 * Implements ALPHA-CODENAME v1.4 standards for DriveMind
 */

import { z } from 'zod';
import { AuthenticationError, ValidationError, RateLimitError, ServiceError } from './error-handler';

// OpenAPI Schema Types
const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.string().optional(),
  timestamp: z.string(),
  requestId: z.string().optional(),
});

const DependencyHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  message: z.string().optional(),
  latency: z.number().optional(),
  lastCheck: z.string().optional(),
});

const FileInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['Document', 'Spreadsheet', 'Presentation', 'Image', 'Video', 'PDF', 'Folder', 'Other']),
  size: z.number(),
  lastModified: z.string(),
  path: z.array(z.string()),
  isDuplicate: z.boolean(),
  vaultScore: z.number().nullable(),
  mimeType: z.string(),
  webViewLink: z.string().url(),
});

const ScanResultSchema = z.object({
  scanId: z.string(),
  totalFiles: z.number(),
  totalSize: z.number(),
  filesByType: z.record(z.number()),
  folderDepth: z.number(),
  duplicateFiles: z.number(),
  unusedFiles: z.number(),
  largestFiles: z.array(FileInfoSchema),
  completedAt: z.string(),
  processingTime: z.number(),
});

const DuplicateGroupSchema = z.object({
  groupId: z.string(),
  files: z.array(FileInfoSchema).min(2),
  duplicateType: z.enum(['exact_match', 'content_hash', 'fuzzy_match', 'version_series']),
  similarityScore: z.number().min(0).max(1),
  recommendation: z.enum(['keep_newest', 'keep_largest', 'manual_review']),
  spaceWasted: z.number(),
});

const OrganizationSuggestionSchema = z.object({
  id: z.string(),
  type: z.enum(['folder_creation', 'file_move', 'folder_rename', 'structure_optimization']),
  title: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  impact: z.enum(['low', 'medium', 'high']),
  affectedFiles: z.number(),
  estimatedTimeMinutes: z.number(),
  prerequisites: z.array(z.string()),
});

const OrganizationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  pattern: z.string(),
  action: z.enum(['move', 'rename', 'tag', 'organize']),
  target: z.string(),
  conditions: z.object({
    fileTypes: z.array(z.string()).optional(),
    namePattern: z.string().optional(),
    sizeRange: z.object({
      min: z.number(),
      max: z.number(),
    }).optional(),
    dateRange: z.object({
      after: z.string(),
      before: z.string(),
    }).optional(),
  }),
  isActive: z.boolean(),
  priority: z.number().min(1).max(100),
  createdAt: z.string(),
  lastApplied: z.string().nullable(),
});

// Export types
export type ApiError = z.infer<typeof ErrorSchema>;
export type DependencyHealth = z.infer<typeof DependencyHealthSchema>;
export type FileInfo = z.infer<typeof FileInfoSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;
export type OrganizationSuggestion = z.infer<typeof OrganizationSuggestionSchema>;
export type OrganizationRule = z.infer<typeof OrganizationRuleSchema>;

// API Client Configuration
interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  getAuthToken?: () => Promise<string | null>;
}

class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private getAuthToken: () => Promise<string | null>;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || '/api';
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.getAuthToken = config.getAuthToken || (() => Promise.resolve(null));
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    schema?: z.ZodSchema<T>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const authToken = await this.getAuthToken();
        const headers = {
          'Content-Type': 'application/json',
          ...options.headers,
        };

        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        const data = await response.json();
        
        if (schema) {
          return schema.parse(data);
        }
        
        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry certain error types
        if (error instanceof AuthenticationError || 
            error instanceof ValidationError ||
            (error instanceof Error && error.name === 'AbortError')) {
          throw error;
        }
        
        // Exponential backoff for retries
        if (attempt < this.retries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const contentType = response.headers.get('content-type');
    let errorData: any;

    if (contentType?.includes('application/json')) {
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: 'unknown', message: 'Failed to parse error response' };
      }
    } else {
      errorData = { error: 'unknown', message: await response.text() };
    }

    switch (response.status) {
      case 400:
        throw new ValidationError(errorData.message || 'Validation failed', errorData.details);
      case 401:
        throw new AuthenticationError(errorData.message || 'Authentication required');
      case 429:
        const retryAfter = response.headers.get('retry-after');
        throw new RateLimitError(
          errorData.message || 'Rate limit exceeded',
          retryAfter ? parseInt(retryAfter) : 60
        );
      case 503:
        throw new ServiceError(errorData.message || 'Service temporarily unavailable');
      default:
        throw new ServiceError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
    }
  }

  // Authentication endpoints
  async beginOAuth(userId?: string) {
    const response = await this.makeRequest('/auth/drive/begin', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return response as { url: string };
  }

  async getAuthStatus() {
    return this.makeRequest('/auth/drive/status', { method: 'GET' }) as Promise<{
      authenticated: boolean;
      hasValidToken: boolean;
      tokenExpiry?: string;
      scopes?: string[];
    }>;
  }

  async syncTokens(userId: string) {
    return this.makeRequest('/auth/drive/sync', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }) as Promise<{ success: boolean; message: string }>;
  }

  // Workflow endpoints
  async scanDrive(config?: {
    maxDepth?: number;
    includeTrashed?: boolean;
    scanSharedDrives?: boolean;
  }) {
    return this.makeRequest(
      '/workflows/scan',
      {
        method: 'POST',
        body: JSON.stringify(config || {}),
      },
      ScanResultSchema
    );
  }

  async startBackgroundScan(userId: string, config?: {
    maxDepth?: number;
    includeTrashed?: boolean;
    scanSharedDrives?: boolean;
  }) {
    return this.makeRequest('/workflows/background-scan', {
      method: 'POST',
      body: JSON.stringify({ userId, ...config }),
    }) as Promise<{
      scanId: string;
      status: 'queued' | 'running';
      estimatedCompletion?: string;
    }>;
  }

  async getScanStatus(scanId?: string, userId?: string) {
    const params = new URLSearchParams();
    if (scanId) params.append('scanId', scanId);
    if (userId) params.append('userId', userId);
    
    return this.makeRequest(
      `/workflows/background-scan/state?${params.toString()}`,
      { method: 'GET' }
    ) as Promise<{
      scanId: string;
      status: 'queued' | 'running' | 'completed' | 'failed';
      progress: number;
      startTime: string;
      completedAt?: string;
      filesProcessed: number;
      totalFiles: number;
      error?: string;
      results?: ScanResult;
    }>;
  }

  async detectDuplicates(config?: {
    algorithm?: 'content_hash' | 'fuzzy_match' | 'combined';
    threshold?: number;
    includeVersions?: boolean;
  }) {
    return this.makeRequest(
      '/workflows/duplicates',
      {
        method: 'POST',
        body: JSON.stringify(config || {}),
      }
    ) as Promise<{
      duplicateGroups: DuplicateGroup[];
      summary: {
        totalFiles: number;
        duplicateFiles: number;
        spaceWasted: number;
        duplicateGroups: number;
      };
    }>;
  }

  async organizeFiles(config?: {
    analysisType?: 'structure' | 'content' | 'both';
    maxSuggestions?: number;
    focusArea?: 'downloads' | 'documents' | 'media' | 'all';
  }) {
    return this.makeRequest(
      '/workflows/organize',
      {
        method: 'POST',
        body: JSON.stringify(config || {}),
      }
    ) as Promise<{
      suggestions: OrganizationSuggestion[];
      folderStructure: Record<string, any>;
      rules: OrganizationRule[];
    }>;
  }

  // AI endpoints
  async classifyFiles(fileIds: string[], config?: {
    categories?: string[];
    includeContent?: boolean;
  }) {
    return this.makeRequest('/ai/classify', {
      method: 'POST',
      body: JSON.stringify({ fileIds, ...config }),
    }) as Promise<{
      classifications: Array<{
        fileId: string;
        fileName: string;
        category: string;
        confidence: number;
        tags: string[];
        reasoning: string;
      }>;
    }>;
  }

  async proposeRule(description: string, config?: {
    sampleFiles?: string[];
    targetFolder?: string;
  }) {
    return this.makeRequest(
      '/ai/propose-rule',
      {
        method: 'POST',
        body: JSON.stringify({ description, ...config }),
      },
      OrganizationRuleSchema
    );
  }

  async checkAiHealth() {
    return this.makeRequest('/ai/health-check', { method: 'GET' }) as Promise<{
      status: 'healthy' | 'degraded' | 'unhealthy';
      services: {
        gemini: {
          status: string;
          latency?: number;
          quotaRemaining?: number;
        };
      };
    }>;
  }

  // System endpoints
  async getHealth() {
    return this.makeRequest('/health', { method: 'GET' }) as Promise<{
      status: 'healthy' | 'degraded' | 'unhealthy';
      version: string;
      uptime: number;
      timestamp: string;
      environment: 'development' | 'staging' | 'production';
      dependencies: Record<string, DependencyHealth>;
      metrics: {
        memory: Record<string, number>;
        cpu: Record<string, number>;
      };
    }>;
  }

  async getMetrics() {
    return this.makeRequest('/metrics', { method: 'GET' }) as Promise<{
      timestamp: string;
      application: {
        name: string;
        version: string;
        environment: string;
        uptime: number;
      };
      system: {
        memory: Record<string, number>;
        cpu: Record<string, number>;
        platform: string;
        nodeVersion: string;
      };
      business: {
        activeUsers: number;
        filesProcessed: number;
        duplicatesDetected: number;
        aiInsightsGenerated: number;
      };
    }>;
  }

  async logMetric(event: string, data: Record<string, any>, timestamp?: string) {
    return this.makeRequest('/metrics', {
      method: 'POST',
      body: JSON.stringify({ event, data, timestamp }),
    }) as Promise<{
      success: boolean;
      message: string;
      timestamp: string;
    }>;
  }
}

// Create singleton instance
const apiClient = new ApiClient();
export default apiClient;

// Export factory for custom configurations
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
