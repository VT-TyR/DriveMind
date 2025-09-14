/**
 * Comprehensive test suite for API client
 * Implements ALPHA-CODENAME v1.4 testing standards
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import apiClient, { createApiClient } from '../src/lib/api-client';
import { AuthenticationError, ValidationError, RateLimitError, ServiceError } from '../src/lib/error-handler';

// Mock fetch globally
global.fetch = vi.fn() as Mock;

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Authentication endpoints', () => {
    it('should begin OAuth flow successfully', async () => {
      const mockResponse = { url: 'https://accounts.google.com/oauth/authorize?...' };
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.beginOAuth('user123');

      expect(fetch).toHaveBeenCalledWith('/api/auth/drive/begin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: 'user123' }),
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should get auth status with proper token', async () => {
      const mockAuthToken = 'mock-firebase-token';
      const mockResponse = {
        authenticated: true,
        hasValidToken: true,
        tokenExpiry: '2024-12-13T12:00:00Z',
        scopes: ['https://www.googleapis.com/auth/drive'],
      };

      const client = createApiClient({
        getAuthToken: async () => mockAuthToken,
      });

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAuthStatus();

      expect(fetch).toHaveBeenCalledWith('/api/auth/drive/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAuthToken}`,
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should sync tokens successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Tokens synchronized to persistent storage',
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.syncTokens('user123');

      expect(fetch).toHaveBeenCalledWith('/api/auth/drive/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: 'user123' }),
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('Workflow endpoints', () => {
    it('should start background scan successfully', async () => {
      const mockResponse = {
        scanId: 'scan-123',
        status: 'queued' as const,
        estimatedCompletion: '2024-12-13T12:30:00Z',
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.startBackgroundScan('user123', {
        maxDepth: 20,
        includeTrashed: false,
        scanSharedDrives: false,
      });

      expect(fetch).toHaveBeenCalledWith('/api/workflows/background-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user123',
          maxDepth: 20,
          includeTrashed: false,
          scanSharedDrives: false,
        }),
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should get scan status with query parameters', async () => {
      const mockResponse = {
        scanId: 'scan-123',
        status: 'running' as const,
        progress: 45,
        startTime: '2024-12-13T12:00:00Z',
        filesProcessed: 450,
        totalFiles: 1000,
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.getScanStatus('scan-123', 'user123');

      expect(fetch).toHaveBeenCalledWith(
        '/api/workflows/background-scan/state?scanId=scan-123&userId=user123',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should detect duplicates with configuration', async () => {
      const mockResponse = {
        duplicateGroups: [],
        summary: {
          totalFiles: 1000,
          duplicateFiles: 25,
          spaceWasted: 1024000,
          duplicateGroups: 12,
        },
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.detectDuplicates({
        algorithm: 'combined',
        threshold: 0.85,
        includeVersions: true,
      });

      expect(fetch).toHaveBeenCalledWith('/api/workflows/duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          algorithm: 'combined',
          threshold: 0.85,
          includeVersions: true,
        }),
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('AI endpoints', () => {
    it('should classify files successfully', async () => {
      const mockResponse = {
        classifications: [
          {
            fileId: 'file-1',
            fileName: 'document.pdf',
            category: 'Invoice',
            confidence: 0.92,
            tags: ['finance', 'document'],
            reasoning: 'Document contains invoice-related content',
          },
        ],
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.classifyFiles(['file-1', 'file-2'], {
        categories: ['Invoice', 'Contract'],
        includeContent: true,
      });

      expect(fetch).toHaveBeenCalledWith('/api/ai/classify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileIds: ['file-1', 'file-2'],
          categories: ['Invoice', 'Contract'],
          includeContent: true,
        }),
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should check AI health status', async () => {
      const mockResponse = {
        status: 'healthy' as const,
        services: {
          gemini: {
            status: 'operational',
            latency: 250,
            quotaRemaining: 1000,
          },
        },
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.checkAiHealth();

      expect(fetch).toHaveBeenCalledWith('/api/ai/health-check', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('System endpoints', () => {
    it('should get health status', async () => {
      const mockResponse = {
        status: 'healthy' as const,
        version: '1.0.0',
        uptime: 3600,
        timestamp: '2024-12-13T12:00:00Z',
        environment: 'production' as const,
        dependencies: {
          firebase: { status: 'healthy' as const, latency: 50 },
          google_drive: { status: 'healthy' as const, latency: 150 },
        },
        metrics: {
          memory: { rss: 50000000, heapUsed: 30000000 },
          cpu: { user: 1000, system: 500 },
        },
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.getHealth();

      expect(fetch).toHaveBeenCalledWith('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should log custom metrics', async () => {
      const mockResponse = {
        success: true,
        message: 'Metric recorded',
        timestamp: '2024-12-13T12:00:00Z',
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.logMetric('user_action', {
        action: 'file_scan',
        userId: 'user123',
      });

      expect(fetch).toHaveBeenCalledWith('/api/metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'user_action',
          data: {
            action: 'file_scan',
            userId: 'user123',
          },
        }),
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('Error handling', () => {
    it('should handle 400 Bad Request errors', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'invalid_request',
          message: 'Request validation failed',
          details: 'Required field missing',
        }),
      });

      await expect(apiClient.beginOAuth()).rejects.toThrow(ValidationError);
    });

    it('should handle 401 Unauthorized errors', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'unauthorized',
          message: 'No authorization token provided',
        }),
      });

      await expect(apiClient.getAuthStatus()).rejects.toThrow(AuthenticationError);
    });

    it('should handle 429 Rate Limited errors', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 
          'content-type': 'application/json',
          'retry-after': '60'
        }),
        json: async () => ({
          error: 'rate_limit_exceeded',
          message: 'Too many requests',
        }),
      });

      await expect(apiClient.classifyFiles(['file1'])).rejects.toThrow(RateLimitError);
    });

    it('should handle 503 Service Unavailable errors', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'service_unavailable',
          message: 'Service temporarily unavailable',
        }),
      });

      await expect(apiClient.getHealth()).rejects.toThrow(ServiceError);
    });

    it('should handle network errors', async () => {
      (fetch as Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(apiClient.beginOAuth()).rejects.toThrow();
    });
  });

  describe('Request configuration', () => {
    it('should use custom base URL', () => {
      const client = createApiClient({ baseUrl: 'https://api.custom.com' });
      expect(client).toBeDefined();
    });

    it('should use custom timeout', async () => {
      const client = createApiClient({ timeout: 5000 });
      
      (fetch as Mock).mockImplementationOnce(() => 
        new Promise(resolve => {
          setTimeout(() => resolve({
            ok: true,
            json: async () => ({ url: 'test' })
          }), 10000);
        })
      );

      // This should timeout before the 10 second mock delay
      await expect(client.beginOAuth()).rejects.toThrow();
    });

    it('should retry on retryable errors', async () => {
      const client = createApiClient({ retries: 2 });
      
      // First two calls fail, third succeeds
      (fetch as Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'success' })
        });

      const result = await client.beginOAuth();
      
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ url: 'success' });
    });

    it('should not retry on non-retryable errors', async () => {
      const client = createApiClient({ retries: 3 });
      
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'bad_request', message: 'Bad request' }),
      });

      await expect(client.beginOAuth()).rejects.toThrow(ValidationError);
      
      // Should only be called once, no retries
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Schema validation', () => {
    it('should validate scan result schema', async () => {
      const validScanResult = {
        scanId: 'scan-123',
        totalFiles: 1000,
        totalSize: 1024000,
        filesByType: { Document: 500, Image: 300 },
        folderDepth: 5,
        duplicateFiles: 25,
        unusedFiles: 100,
        largestFiles: [],
        completedAt: '2024-12-13T12:00:00Z',
        processingTime: 120.5,
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => validScanResult,
      });

      const result = await apiClient.scanDrive();
      expect(result).toEqual(validScanResult);
    });

    it('should reject invalid schema', async () => {
      const invalidScanResult = {
        scanId: 'scan-123',
        // Missing required fields
      };

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => invalidScanResult,
      });

      await expect(apiClient.scanDrive()).rejects.toThrow();
    });
  });

  describe('Authentication token handling', () => {
    it('should include auth token when available', async () => {
      const mockToken = 'firebase-id-token';
      const client = createApiClient({
        getAuthToken: async () => mockToken,
      });

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true }),
      });

      await client.getAuthStatus();

      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/drive/status',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`,
          }),
        })
      );
    });

    it('should work without auth token', async () => {
      const client = createApiClient({
        getAuthToken: async () => null,
      });

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'oauth-url' }),
      });

      await client.beginOAuth();

      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/drive/begin',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.any(String),
          }),
        })
      );
    });
  });
});
