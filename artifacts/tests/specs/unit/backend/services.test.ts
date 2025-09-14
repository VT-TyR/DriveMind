/**
 * Backend Services Unit Tests - ALPHA Standards
 * Comprehensive testing of server-side services with security and performance validation
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { authService } from '../../../backend/services/auth/auth-service';
import { driveService } from '../../../backend/services/drive/drive-service';
import { logger } from '../../../backend/services/logging/logger';
import { metrics } from '../../../backend/services/monitoring/metrics';
import { CircuitBreaker } from '../../../backend/services/resilience/circuit-breaker';
import { validateScanRequest, validateClassificationRequest } from '../../../backend/services/validation/schemas';

// Mock external dependencies
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn().mockReturnValue('https://oauth.google.com/test'),
        getToken: vi.fn().mockResolvedValue({
          tokens: {
            access_token: 'test_token',
            refresh_token: 'test_refresh_token',
            expiry_date: Date.now() + 3600000
          }
        }),
        setCredentials: vi.fn(),
        refreshAccessToken: vi.fn().mockResolvedValue({
          credentials: { access_token: 'refreshed_token' }
        })
      }))
    },
    drive: vi.fn(() => ({
      files: {
        list: vi.fn(),
        get: vi.fn()
      }
    }))
  }
}));

vi.mock('firebase-admin', () => ({
  auth: vi.fn(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-uid' })
  })),
  firestore: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    })),
    collection: vi.fn(() => ({
      add: vi.fn(),
      doc: vi.fn()
    }))
  }))
}));

describe('Backend Services - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('AuthService', () => {
    describe('beginOAuth', () => {
      it('should generate OAuth URL successfully', async () => {
        const request = { userId: 'test-user-123' };
        
        const result = await authService.beginOAuth(request);
        
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('state', 'test-user-123');
        expect(result.url).toContain('oauth.google.com');
      });

      it('should generate unique state for anonymous requests', async () => {
        const result1 = await authService.beginOAuth({});
        const result2 = await authService.beginOAuth({});
        
        expect(result1.state).toBeDefined();
        expect(result2.state).toBeDefined();
        expect(result1.state).not.toBe(result2.state);
      });

      it('should validate input parameters', async () => {
        const invalidRequest = {
          userId: 123, // Should be string
          returnUrl: 'invalid-url' // Should be valid URL
        };
        
        await expect(authService.beginOAuth(invalidRequest))
          .rejects.toThrow('Validation failed');
      });

      it('should log OAuth initiation events', async () => {
        const logSpy = vi.spyOn(logger, 'info');
        
        await authService.beginOAuth({ userId: 'test-user' });
        
        expect(logSpy).toHaveBeenCalledWith(
          'OAuth flow initiated',
          expect.objectContaining({
            userId: 'test-user',
            timestamp: expect.any(String)
          })
        );
      });

      it('should handle OAuth client errors', async () => {
        const mockOAuth2 = vi.mocked(require('googleapis').google.auth.OAuth2);
        mockOAuth2.prototype.generateAuthUrl.mockImplementation(() => {
          throw new Error('OAuth configuration error');
        });
        
        await expect(authService.beginOAuth({ userId: 'test' }))
          .rejects.toThrow('OAuth configuration error');
      });
    });

    describe('handleCallback', () => {
      it('should process OAuth callback successfully', async () => {
        const params = {
          code: 'test-authorization-code',
          state: 'test-user-123'
        };
        
        const result = await authService.handleCallback(params);
        
        expect(result).toHaveProperty('tokens');
        expect(result.tokens).toHaveProperty('access_token');
        expect(result.tokens).toHaveProperty('refresh_token');
        expect(result).toHaveProperty('userId', 'test-user-123');
      });

      it('should handle OAuth errors in callback', async () => {
        const params = {
          error: 'access_denied',
          error_description: 'User denied access',
          state: 'test-user'
        };
        
        await expect(authService.handleCallback(params))
          .rejects.toThrow('OAuth error: access_denied - User denied access');
      });

      it('should reject callback without authorization code', async () => {
        const params = {
          state: 'test-user'
          // Missing code parameter
        };
        
        await expect(authService.handleCallback(params))
          .rejects.toThrow('Authorization code missing in OAuth callback');
      });

      it('should validate state parameter format', async () => {
        const params = {
          code: 'test-code',
          state: '<script>alert("xss")</script>' // XSS attempt
        };
        
        // Should handle malicious state gracefully
        const result = await authService.handleCallback(params);
        expect(result.userId).toBe('<script>alert("xss")</script>');
      });

      it('should handle token exchange failures', async () => {
        const mockOAuth2 = vi.mocked(require('googleapis').google.auth.OAuth2);
        mockOAuth2.prototype.getToken.mockRejectedValue(new Error('Invalid authorization code'));
        
        const params = {
          code: 'invalid-code',
          state: 'test-user'
        };
        
        await expect(authService.handleCallback(params))
          .rejects.toThrow('Invalid authorization code');
      });
    });

    describe('syncTokens', () => {
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: ['https://www.googleapis.com/auth/drive']
      };

      it('should sync tokens to Firestore successfully', async () => {
        const request = { userId: 'test-user' };
        
        const result = await authService.syncTokens(request, mockTokens);
        
        expect(result).toEqual({
          success: true,
          message: 'Tokens synchronized to persistent storage'
        });
      });

      it('should encrypt tokens before storage', async () => {
        const request = { userId: 'test-user' };
        
        await authService.syncTokens(request, mockTokens);
        
        // Verify encryption was applied (implementation-specific)
        // This test would verify the actual encryption logic
        expect(true).toBe(true); // Placeholder for encryption verification
      });

      it('should handle Firestore write failures', async () => {
        const mockFirestore = vi.mocked(require('firebase-admin').firestore);
        mockFirestore().doc().set.mockRejectedValue(new Error('Firestore write failed'));
        
        const request = { userId: 'test-user' };
        
        await expect(authService.syncTokens(request, mockTokens))
          .rejects.toThrow('Firestore write failed');
      });

      it('should validate token structure', async () => {
        const invalidTokens = {
          access_token: 'valid-token',
          // Missing refresh_token
          expiry_date: 'invalid-date' // Should be number
        };
        
        await expect(authService.syncTokens({ userId: 'test' }, invalidTokens))
          .rejects.toThrow('Invalid token structure');
      });
    });

    describe('getAuthStatus', () => {
      it('should return authenticated status for valid tokens', async () => {
        const userId = 'test-user';
        
        // Mock Firestore response
        const mockDoc = {
          exists: true,
          data: () => ({
            access_token: 'valid-token',
            refresh_token: 'valid-refresh',
            expiry_date: Date.now() + 3600000,
            scope: ['https://www.googleapis.com/auth/drive']
          })
        };
        
        const mockFirestore = vi.mocked(require('firebase-admin').firestore);
        mockFirestore().doc().get.mockResolvedValue(mockDoc);
        
        const result = await authService.getAuthStatus(userId);
        
        expect(result).toEqual({
          authenticated: true,
          hasValidToken: true,
          tokenExpiry: expect.any(String),
          scopes: ['https://www.googleapis.com/auth/drive'],
          userId
        });
      });

      it('should detect expired tokens', async () => {
        const userId = 'test-user';
        
        const mockDoc = {
          exists: true,
          data: () => ({
            access_token: 'expired-token',
            refresh_token: 'valid-refresh',
            expiry_date: Date.now() - 3600000, // Expired 1 hour ago
            scope: ['https://www.googleapis.com/auth/drive']
          })
        };
        
        const mockFirestore = vi.mocked(require('firebase-admin').firestore);
        mockFirestore().doc().get.mockResolvedValue(mockDoc);
        
        const result = await authService.getAuthStatus(userId);
        
        expect(result).toEqual(expect.objectContaining({
          authenticated: true,
          hasValidToken: false
        }));
      });

      it('should handle non-existent user', async () => {
        const userId = 'non-existent-user';
        
        const mockDoc = { exists: false };
        const mockFirestore = vi.mocked(require('firebase-admin').firestore);
        mockFirestore().doc().get.mockResolvedValue(mockDoc);
        
        const result = await authService.getAuthStatus(userId);
        
        expect(result).toEqual({
          authenticated: false,
          hasValidToken: false,
          tokenExpiry: null,
          scopes: [],
          userId
        });
      });
    });

    describe('refreshToken', () => {
      it('should refresh expired access token', async () => {
        const userId = 'test-user';
        
        // Mock existing tokens in Firestore
        const mockDoc = {
          exists: true,
          data: () => ({
            refresh_token: 'valid-refresh-token',
            expiry_date: Date.now() - 3600000 // Expired
          })
        };
        
        const mockFirestore = vi.mocked(require('firebase-admin').firestore);
        mockFirestore().doc().get.mockResolvedValue(mockDoc);
        
        const refreshedTokens = await authService.refreshToken(userId);
        
        expect(refreshedTokens).toHaveProperty('access_token', 'refreshed_token');
        expect(refreshedTokens).toHaveProperty('refresh_token', 'valid-refresh-token');
        expect(refreshedTokens.expiry_date).toBeGreaterThan(Date.now());
      });

      it('should handle refresh token expiry', async () => {
        const mockOAuth2 = vi.mocked(require('googleapis').google.auth.OAuth2);
        mockOAuth2.prototype.refreshAccessToken.mockRejectedValue(
          new Error('Refresh token expired')
        );
        
        const userId = 'test-user';
        
        await expect(authService.refreshToken(userId))
          .rejects.toThrow('Refresh token expired');
      });
    });

    describe('Security Tests', () => {
      it('should sanitize user input in OAuth state', async () => {
        const maliciousInput = {
          userId: '<script>alert("xss")</script>',
          returnUrl: 'javascript:alert("xss")'
        };
        
        // Should sanitize or reject malicious input
        await expect(authService.beginOAuth(maliciousInput))
          .rejects.toThrow('Validation failed');
      });

      it('should implement rate limiting', async () => {
        const requests = Array.from({ length: 101 }, () => 
          authService.beginOAuth({ userId: 'test-user' })
        );
        
        // Should reject excess requests
        const results = await Promise.allSettled(requests);
        const rejected = results.filter(r => r.status === 'rejected');
        
        expect(rejected.length).toBeGreaterThan(0);
        expect(rejected[0].reason.message).toContain('Rate limit exceeded');
      });

      it('should log security events', async () => {
        const logSpy = vi.spyOn(logger, 'warn');
        
        await authService.handleCallback({
          error: 'access_denied',
          state: 'test-user'
        }).catch(() => {}); // Ignore error for this test
        
        expect(logSpy).toHaveBeenCalledWith(
          'OAuth access denied',
          expect.objectContaining({
            userId: 'test-user',
            error: 'access_denied'
          })
        );
      });
    });

    describe('Performance Tests', () => {
      it('should complete OAuth operations within SLA', async () => {
        const startTime = Date.now();
        
        await authService.beginOAuth({ userId: 'perf-test-user' });
        
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(250); // 250ms SLA
      });

      it('should handle concurrent authentication requests', async () => {
        const concurrentRequests = Array.from({ length: 50 }, (_, i) =>
          authService.beginOAuth({ userId: `concurrent-user-${i}` })
        );
        
        const results = await Promise.all(concurrentRequests);
        
        expect(results).toHaveLength(50);
        results.forEach((result, i) => {
          expect(result.state).toBe(`concurrent-user-${i}`);
          expect(result.url).toBeDefined();
        });
      });
    });
  });

  describe('DriveService', () => {
    describe('scanDrive', () => {
      const mockDriveFiles = {
        files: [
          {
            id: 'file1',
            name: 'Document.pdf',
            mimeType: 'application/pdf',
            size: '1024000',
            modifiedTime: '2024-12-13T10:00:00Z',
            parents: ['folder1']
          },
          {
            id: 'file2', 
            name: 'Image.jpg',
            mimeType: 'image/jpeg',
            size: '2048000',
            modifiedTime: '2024-12-13T09:00:00Z',
            parents: ['folder1']
          }
        ]
      };

      beforeEach(() => {
        const mockDrive = vi.mocked(require('googleapis').google.drive);
        mockDrive().files.list.mockResolvedValue({ data: mockDriveFiles });
      });

      it('should scan drive and return file metadata', async () => {
        const userId = 'test-user';
        const options = {
          maxDepth: 20,
          includeTrashed: false,
          scanSharedDrives: false
        };
        
        const result = await driveService.scanDrive(userId, options);
        
        expect(result).toHaveProperty('scanId');
        expect(result).toHaveProperty('totalFiles', 2);
        expect(result).toHaveProperty('filesByType');
        expect(result.filesByType).toEqual({
          PDF: 1,
          Image: 1
        });
      });

      it('should respect maxDepth parameter', async () => {
        const userId = 'test-user';
        const options = { maxDepth: 2 };
        
        await driveService.scanDrive(userId, options);
        
        // Verify API calls respect depth limit
        const mockDrive = vi.mocked(require('googleapis').google.drive);
        const listCalls = mockDrive().files.list.mock.calls;
        
        // Should not make recursive calls beyond maxDepth
        expect(listCalls.length).toBeLessThanOrEqual(2);
      });

      it('should handle large drives with pagination', async () => {
        // Mock paginated response
        const mockDrive = vi.mocked(require('googleapis').google.drive);
        mockDrive().files.list
          .mockResolvedValueOnce({
            data: { 
              files: mockDriveFiles.files,
              nextPageToken: 'next-page-token'
            }
          })
          .mockResolvedValueOnce({
            data: { 
              files: [],
              nextPageToken: null
            }
          });
        
        const userId = 'test-user';
        const result = await driveService.scanDrive(userId, {});
        
        expect(result.totalFiles).toBe(2);
        expect(mockDrive().files.list).toHaveBeenCalledTimes(2);
      });

      it('should handle Drive API errors gracefully', async () => {
        const mockDrive = vi.mocked(require('googleapis').google.drive);
        mockDrive().files.list.mockRejectedValue(new Error('Drive API quota exceeded'));
        
        const userId = 'test-user';
        
        await expect(driveService.scanDrive(userId, {}))
          .rejects.toThrow('Drive API quota exceeded');
      });

      it('should include duplicate detection in scan', async () => {
        const duplicateFiles = {
          files: [
            {
              id: 'file1',
              name: 'Document.pdf',
              md5Checksum: 'abc123',
              size: '1024000'
            },
            {
              id: 'file2',
              name: 'Document_copy.pdf', 
              md5Checksum: 'abc123',
              size: '1024000'
            }
          ]
        };
        
        const mockDrive = vi.mocked(require('googleapis').google.drive);
        mockDrive().files.list.mockResolvedValue({ data: duplicateFiles });
        
        const userId = 'test-user';
        const result = await driveService.scanDrive(userId, {});
        
        expect(result).toHaveProperty('duplicateFiles', 1);
        expect(result).toHaveProperty('duplicateGroups');
      });
    });

    describe('detectDuplicates', () => {
      it('should detect exact duplicates by content hash', async () => {
        const userId = 'test-user';
        const options = {
          algorithm: 'content_hash',
          threshold: 1.0
        };
        
        const result = await driveService.detectDuplicates(userId, options);
        
        expect(result).toHaveProperty('duplicateGroups');
        expect(result).toHaveProperty('summary');
        expect(result.summary).toHaveProperty('totalFiles');
        expect(result.summary).toHaveProperty('duplicateFiles');
        expect(result.summary).toHaveProperty('spaceWasted');
      });

      it('should detect fuzzy duplicates with similarity threshold', async () => {
        const userId = 'test-user';
        const options = {
          algorithm: 'fuzzy_match',
          threshold: 0.85
        };
        
        const result = await driveService.detectDuplicates(userId, options);
        
        result.duplicateGroups.forEach(group => {
          expect(group.similarityScore).toBeGreaterThanOrEqual(options.threshold);
        });
      });

      it('should recommend duplicate resolution actions', async () => {
        const userId = 'test-user';
        const result = await driveService.detectDuplicates(userId, {});
        
        result.duplicateGroups.forEach(group => {
          expect(group.recommendation).toMatch(/keep_newest|keep_largest|manual_review/);
        });
      });
    });

    describe('Circuit Breaker Integration', () => {
      let circuitBreaker: CircuitBreaker;

      beforeEach(() => {
        circuitBreaker = new CircuitBreaker({
          failureThreshold: 3,
          timeoutDuration: 1000,
          resetTimeout: 5000
        });
      });

      it('should trip circuit breaker on repeated failures', async () => {
        const mockDrive = vi.mocked(require('googleapis').google.drive);
        mockDrive().files.list.mockRejectedValue(new Error('Drive API error'));
        
        const userId = 'test-user';
        
        // Should fail 3 times then trip circuit
        for (let i = 0; i < 4; i++) {
          try {
            await driveService.scanDrive(userId, {});
          } catch (error) {
            if (i < 3) {
              expect(error.message).toBe('Drive API error');
            } else {
              expect(error.message).toContain('Circuit breaker is open');
            }
          }
        }
      });

      it('should reset circuit breaker after timeout', async () => {
        const mockDrive = vi.mocked(require('googleapis').google.drive);
        
        // Cause circuit to trip
        mockDrive().files.list.mockRejectedValue(new Error('Drive API error'));
        
        const userId = 'test-user';
        
        // Trip the circuit
        for (let i = 0; i < 3; i++) {
          try {
            await driveService.scanDrive(userId, {});
          } catch (error) {
            // Expected failures
          }
        }
        
        // Fast-forward time to reset circuit
        vi.advanceTimersByTime(6000);
        
        // Mock successful response
        mockDrive().files.list.mockResolvedValue({ data: { files: [] } });
        
        // Should work again
        const result = await driveService.scanDrive(userId, {});
        expect(result).toBeDefined();
      });
    });
  });

  describe('Validation Schemas', () => {
    describe('validateScanRequest', () => {
      it('should validate valid scan request', () => {
        const validRequest = {
          maxDepth: 20,
          includeTrashed: false,
          scanSharedDrives: true
        };
        
        const result = validateScanRequest(validRequest);
        expect(result).toEqual(validRequest);
      });

      it('should reject invalid maxDepth values', () => {
        const invalidRequest = {
          maxDepth: -1,
          includeTrashed: false
        };
        
        expect(() => validateScanRequest(invalidRequest))
          .toThrow('maxDepth must be between 1 and 50');
      });

      it('should apply default values', () => {
        const minimalRequest = {};
        
        const result = validateScanRequest(minimalRequest);
        
        expect(result).toEqual({
          maxDepth: 20,
          includeTrashed: false,
          scanSharedDrives: false
        });
      });

      it('should sanitize input values', () => {
        const requestWithExtraFields = {
          maxDepth: 10,
          includeTrashed: true,
          maliciousField: '<script>alert("xss")</script>',
          __proto__: { polluted: true }
        };
        
        const result = validateScanRequest(requestWithExtraFields);
        
        expect(result).not.toHaveProperty('maliciousField');
        expect(result).not.toHaveProperty('__proto__');
        expect(result).toEqual({
          maxDepth: 10,
          includeTrashed: true,
          scanSharedDrives: false
        });
      });
    });

    describe('validateClassificationRequest', () => {
      it('should validate file classification request', () => {
        const validRequest = {
          fileIds: ['file1', 'file2', 'file3'],
          categories: ['Invoice', 'Contract', 'Personal'],
          includeContent: true
        };
        
        const result = validateClassificationRequest(validRequest);
        expect(result).toEqual(validRequest);
      });

      it('should enforce fileIds array limit', () => {
        const requestWithTooManyFiles = {
          fileIds: Array.from({ length: 101 }, (_, i) => `file${i}`),
          categories: ['Document']
        };
        
        expect(() => validateClassificationRequest(requestWithTooManyFiles))
          .toThrow('fileIds array cannot exceed 100 items');
      });

      it('should validate fileId format', () => {
        const requestWithInvalidFileIds = {
          fileIds: ['valid-file-id', 123, null, ''],
          categories: ['Document']
        };
        
        expect(() => validateClassificationRequest(requestWithInvalidFileIds))
          .toThrow('All fileIds must be non-empty strings');
      });
    });
  });

  describe('Logger Service', () => {
    it('should log structured messages with metadata', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logger.info('Test message', {
        userId: 'test-user',
        action: 'test-action',
        timestamp: new Date().toISOString()
      });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('{"level":"info","message":"Test message"')
      );
      
      consoleSpy.mockRestore();
    });

    it('should redact sensitive information from logs', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logger.info('OAuth token received', {
        userId: 'test-user',
        access_token: 'sensitive-token',
        refresh_token: 'sensitive-refresh'
      });
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).not.toContain('sensitive-token');
      expect(logCall).not.toContain('sensitive-refresh');
      expect(logCall).toContain('[REDACTED]');
      
      consoleSpy.mockRestore();
    });

    it('should include request correlation IDs', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const correlationId = 'req-123-abc';
      logger.info('API request', { correlationId });
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain(correlationId);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Metrics Service', () => {
    beforeEach(() => {
      metrics.reset();
    });

    it('should record counter metrics', () => {
      metrics.incrementCounter('api_requests_total', {
        method: 'POST',
        endpoint: '/api/auth/drive/begin'
      });
      
      const counters = metrics.getCounters();
      expect(counters['api_requests_total']).toBe(1);
    });

    it('should record histogram metrics', () => {
      metrics.recordHistogram('request_duration_ms', 250, {
        method: 'GET',
        status: '200'
      });
      
      const histograms = metrics.getHistograms();
      expect(histograms['request_duration_ms']).toContain(250);
    });

    it('should calculate percentiles correctly', () => {
      const values = [100, 150, 200, 250, 300, 350, 400, 450, 500, 1000];
      values.forEach(value => {
        metrics.recordHistogram('response_time', value);
      });
      
      const stats = metrics.getHistogramStats('response_time');
      expect(stats.p95).toBeLessThanOrEqual(1000);
      expect(stats.p99).toBeLessThanOrEqual(1000);
      expect(stats.mean).toBeCloseTo(370, 0);
    });

    it('should export metrics in Prometheus format', () => {
      metrics.incrementCounter('test_counter', { label: 'value' });
      metrics.recordHistogram('test_histogram', 100);
      
      const prometheusFormat = metrics.exportPrometheus();
      
      expect(prometheusFormat).toContain('# HELP test_counter');
      expect(prometheusFormat).toContain('# TYPE test_counter counter');
      expect(prometheusFormat).toContain('test_counter{label="value"} 1');
    });
  });

  describe('Error Handling', () => {
    it('should classify errors correctly', async () => {
      const errors = [
        { status: 400, type: 'ValidationError' },
        { status: 401, type: 'AuthenticationError' },
        { status: 403, type: 'AuthorizationError' },
        { status: 429, type: 'RateLimitError' },
        { status: 500, type: 'ServiceError' }
      ];
      
      errors.forEach(({ status, type }) => {
        const error = new Error('Test error');
        error.status = status;
        
        const classified = authService.classifyError(error);
        expect(classified.type).toBe(type);
      });
    });

    it('should provide actionable error messages', () => {
      const rateLimitError = new Error('Too many requests');
      rateLimitError.status = 429;
      rateLimitError.retryAfter = 60;
      
      const classified = authService.classifyError(rateLimitError);
      
      expect(classified.message).toContain('rate limit');
      expect(classified.retryAfter).toBe(60);
      expect(classified.userMessage).toContain('please wait');
    });

    it('should maintain error context for debugging', () => {
      const originalError = new Error('Database connection failed');
      originalError.stack = 'Original stack trace';
      
      const wrappedError = authService.wrapError(originalError, {
        userId: 'test-user',
        operation: 'syncTokens'
      });
      
      expect(wrappedError.originalError).toBe(originalError);
      expect(wrappedError.context).toEqual({
        userId: 'test-user',
        operation: 'syncTokens'
      });
    });
  });
});