/**
 * API Integration Tests
 * End-to-end testing of complete API workflows with security validation
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { RouterService } from '../../services/api/router-service';
import { admin } from '../../../src/lib/admin';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock Next.js components
jest.mock('next/server');
jest.mock('../../../src/lib/admin');
jest.mock('googleapis');
jest.mock('@google/generative-ai');
jest.mock('../../services/logging/logger');
jest.mock('../../services/monitoring/metrics');

// Test configuration
const TEST_BASE_URL = 'https://api.example.com';
const TEST_USER_ID = 'test-user-123';
const TEST_ACCESS_TOKEN = 'test-access-token';
const TEST_REFRESH_TOKEN = 'test-refresh-token';

describe('API Integration Tests', () => {
  let routerService: RouterService;
  let mockFirestore: any;
  let mockAuth: any;
  let mockOAuth2: any;
  let mockDrive: any;
  let mockGenAI: any;

  beforeAll(async () => {
    // Setup environment
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.NEXT_PUBLIC_BASE_URL = TEST_BASE_URL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (RouterService as any).instance = null;

    // Mock Firebase Admin
    mockFirestore = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ id: 'doc', exists: true, data: () => ({}) }),
          set: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        }),
        add: jest.fn().mockResolvedValue({ id: 'new-doc' }),
      }),
    };

    mockAuth = {
      getUser: jest.fn().mockResolvedValue({ uid: TEST_USER_ID }),
      verifyIdToken: jest.fn().mockResolvedValue({ uid: TEST_USER_ID }),
    };

    (admin.firestore as jest.Mock).mockReturnValue(mockFirestore);
    (admin.auth as jest.Mock).mockReturnValue(mockAuth);

    // Mock Google APIs
    mockOAuth2 = {
      generateAuthUrl: jest.fn().mockReturnValue('https://oauth.google.com/auth'),
      getToken: jest.fn().mockResolvedValue({
        tokens: {
          access_token: TEST_ACCESS_TOKEN,
          refresh_token: TEST_REFRESH_TOKEN,
          expiry_date: Date.now() + 3600000,
        },
      }),
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn().mockResolvedValue({
        credentials: {
          access_token: TEST_ACCESS_TOKEN,
          expiry_date: Date.now() + 3600000,
        },
      }),
    };

    mockDrive = {
      files: {
        list: jest.fn().mockResolvedValue({
          data: {
            files: [
              { id: 'file1', name: 'test1.pdf', mimeType: 'application/pdf', size: 1024 },
              { id: 'file2', name: 'test2.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 2048 },
            ],
          },
        }),
        get: jest.fn().mockResolvedValue({
          data: { id: 'file1', name: 'test1.pdf', mimeType: 'application/pdf' },
        }),
      },
      about: {
        get: jest.fn().mockResolvedValue({
          data: { user: { emailAddress: 'test@example.com' } },
        }),
      },
    };

    (google.auth.OAuth2 as jest.Mock).mockImplementation(() => mockOAuth2);
    (google.drive as jest.Mock).mockReturnValue(mockDrive);

    // Mock Gemini AI
    const mockModel = {
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            category: 'Document',
            confidence: 0.95,
            tags: ['pdf', 'business'],
            reasoning: 'PDF business document',
          }),
        },
      }),
    };

    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    };

    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => mockGenAI);

    // Mock metrics service
    const { metrics } = require('../../services/monitoring/metrics');
    metrics.recordEvent = jest.fn();
    metrics.recordLatency = jest.fn();
    metrics.recordStatusCode = jest.fn();
    metrics.getSystemMetrics = jest.fn().mockResolvedValue({
      timestamp: new Date(),
      application: { name: 'drivemind', version: '1.0.0' },
      system: { memory: {}, cpu: {} },
      business: { activeUsers: 10, filesProcessed: 100 },
    });
    metrics.getRecentMetrics = jest.fn().mockResolvedValue({
      p50: 50, p95: 95, p99: 150, requestCount: 1000, errorRate: 2.5,
    });

    // Create router service instance
    routerService = RouterService.getInstance();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.NODE_ENV;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GEMINI_API_KEY;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Health Check Endpoints', () => {
    it('should return healthy status for /health endpoint', async () => {
      const request = createMockRequest('GET', '/api/health');
      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        uptime: expect.any(Number),
        dependencies: {
          firebase: { status: 'healthy' },
          google_auth: { status: 'healthy' },
          google_drive: { status: 'healthy' },
          gemini: { status: 'healthy' },
        },
      });
    });

    it('should return metrics data for /metrics endpoint', async () => {
      const request = createMockRequest('GET', '/api/metrics');
      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        timestamp: expect.any(String),
        application: { name: 'drivemind' },
        business: { activeUsers: 10 },
      });
    });
  });

  describe('Authentication Flow', () => {
    it('should initiate OAuth flow successfully', async () => {
      const request = createMockRequest('POST', '/api/auth/drive/begin', {
        userId: TEST_USER_ID,
      });

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        url: expect.stringContaining('oauth.google.com'),
        state: expect.any(String),
        codeChallenge: expect.any(String),
      });
    });

    it('should handle OAuth callback successfully', async () => {
      const request = createMockRequest('GET', '/api/auth/drive/callback?code=test-code&state=test-state');

      const response = await routerService.handleRequest(request);

      // Should redirect on success
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/dashboard');
    });

    it('should handle OAuth callback POST', async () => {
      const request = createMockRequest('POST', '/api/auth/drive/callback', {
        code: 'test-code',
        state: 'test-state',
      });

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        success: expect.any(Boolean),
        message: expect.any(String),
      });
    });

    it('should check authentication status', async () => {
      const request = createMockRequest('GET', '/api/auth/drive/status', null, {
        authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      });

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        authenticated: expect.any(Boolean),
        hasValidToken: expect.any(Boolean),
      });
    });
  });

  describe('Drive Workflows', () => {
    it('should perform drive scan successfully', async () => {
      const request = createMockRequest('POST', '/api/workflows/scan', {
        maxDepth: 10,
        includeTrashed: false,
      }, {
        authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      });

      const response = await routerService.handleRequest(request);

      expect([200, 202]).toContain(response.status);
      
      const responseData = await response.json();
      
      if (response.status === 202) {
        expect(responseData).toHaveProperty('scanId');
        expect(responseData).toHaveProperty('status');
      } else {
        expect(responseData).toHaveProperty('totalFiles');
        expect(responseData).toHaveProperty('scanId');
      }
    });

    it('should detect duplicates successfully', async () => {
      const request = createMockRequest('POST', '/api/workflows/duplicates', {
        algorithm: 'combined',
        threshold: 0.8,
      }, {
        authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      });

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('duplicateGroups');
      expect(responseData).toHaveProperty('summary');
    });
  });

  describe('AI Services', () => {
    it('should classify files with PII protection', async () => {
      const request = createMockRequest('POST', '/api/ai/classify', {
        userId: TEST_USER_ID,
        fileIds: ['file1', 'file2'],
        consentConfirmed: true,
        redactionLevel: 'comprehensive',
      }, {
        authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      });

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('classifications');
      expect(responseData).toHaveProperty('redactionSummary');
      
      expect(responseData.classifications).toBeInstanceOf(Array);
      expect(responseData.redactionSummary).toMatchObject({
        filesProcessed: expect.any(Number),
        piiInstancesRedacted: expect.any(Number),
        auditId: expect.any(String),
      });
    });

    it('should check AI service health', async () => {
      const request = createMockRequest('GET', '/api/ai/health-check');

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        status: expect.any(String),
        services: { gemini: expect.any(Object) },
        capabilities: expect.any(Object),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const request = createMockRequest('GET', '/api/unknown/route');

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(404);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        error: 'not_found',
        message: expect.stringContaining('Route not found'),
        correlationId: expect.any(String),
      });
    });

    it('should handle validation errors', async () => {
      const request = createMockRequest('POST', '/api/auth/drive/begin', {
        userId: 123, // Should be string
      });

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        error: 'validation_error',
        message: expect.stringContaining('validation failed'),
      });
    });

    it('should handle authentication errors', async () => {
      const request = createMockRequest('GET', '/api/auth/drive/status');

      const response = await routerService.handleRequest(request);

      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData).toMatchObject({
        error: 'unauthorized',
        message: expect.stringContaining('authentication'),
      });
    });

    it('should handle rate limiting', async () => {
      const requests = [];
      
      // Make 51 requests to exceed rate limit (50/minute for auth begin)
      for (let i = 0; i < 51; i++) {
        const request = createMockRequest('POST', '/api/auth/drive/begin', {});
        requests.push(routerService.handleRequest(request));
      }

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      if (rateLimitedResponses.length > 0) {
        const responseData = await rateLimitedResponses[0].json();
        expect(responseData).toMatchObject({
          error: 'rate_limit_exceeded',
          message: expect.stringContaining('Rate limit exceeded'),
        });
      }
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const request = createMockRequest('GET', '/api/health');
      const response = await routerService.handleRequest(request);

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should include HSTS header in production', async () => {
      process.env.NODE_ENV = 'production';
      
      const request = createMockRequest('GET', '/api/health');
      const response = await routerService.handleRequest(request);

      expect(response.headers.get('Strict-Transport-Security')).toBe(
        'max-age=31536000; includeSubDomains; preload'
      );
    });

    it('should include correlation ID in responses', async () => {
      const request = createMockRequest('GET', '/api/health');
      const response = await routerService.handleRequest(request);

      const correlationId = response.headers.get('X-Correlation-ID');
      expect(correlationId).toBeTruthy();
      expect(correlationId).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe('Performance and Metrics', () => {
    it('should record request metrics', async () => {
      const { metrics } = require('../../services/monitoring/metrics');
      
      const request = createMockRequest('GET', '/api/health');
      await routerService.handleRequest(request);

      expect(metrics.recordEvent).toHaveBeenCalledWith('api_request_completed', {
        method: 'GET',
        route: '/health',
        status: 200,
        duration: expect.any(Number),
        authenticated: false,
        rateLimited: false,
        correlationId: expect.any(String),
      });

      expect(metrics.recordLatency).toHaveBeenCalledWith('/health', expect.any(Number));
      expect(metrics.recordStatusCode).toHaveBeenCalledWith(200);
    });

    it('should record error metrics on failure', async () => {
      const { metrics } = require('../../services/monitoring/metrics');
      
      const request = createMockRequest('GET', '/api/unknown');
      await routerService.handleRequest(request);

      expect(metrics.recordEvent).toHaveBeenCalledWith('api_request_failed', {
        method: 'GET',
        route: '/unknown',
        status: 404,
        duration: expect.any(Number),
        errorType: 'NotFoundError',
        correlationId: expect.any(String),
      });
    });
  });

  describe('Integration with External Services', () => {
    it('should integrate with Firebase for health checks', async () => {
      const request = createMockRequest('GET', '/api/health');
      await routerService.handleRequest(request);

      expect(mockFirestore.collection).toHaveBeenCalledWith('_system');
    });

    it('should integrate with Google APIs for OAuth', async () => {
      const request = createMockRequest('POST', '/api/auth/drive/begin', {});
      await routerService.handleRequest(request);

      expect(google.auth.OAuth2).toHaveBeenCalled();
      expect(mockOAuth2.generateAuthUrl).toHaveBeenCalled();
    });

    it('should integrate with Gemini AI for file classification', async () => {
      const request = createMockRequest('POST', '/api/ai/classify', {
        userId: TEST_USER_ID,
        fileIds: ['file1'],
        consentConfirmed: true,
      }, {
        authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      });

      await routerService.handleRequest(request);

      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
    });
  });

  // Helper function to create mock requests
  function createMockRequest(
    method: string, 
    url: string, 
    body?: any, 
    headers: Record<string, string> = {}
  ): NextRequest {
    const fullUrl = url.startsWith('http') ? url : `${TEST_BASE_URL}${url}`;
    
    const mockHeaders = new Map<string, string>();
    Object.entries({
      'content-type': 'application/json',
      'user-agent': 'test-agent',
      ...headers,
    }).forEach(([key, value]) => {
      mockHeaders.set(key, value);
    });

    const mockRequest = {
      method,
      url: fullUrl,
      headers: {
        get: (key: string) => mockHeaders.get(key.toLowerCase()) || null,
        entries: () => Array.from(mockHeaders.entries()),
      },
      json: jest.fn().mockResolvedValue(body || {}),
    } as any;

    return mockRequest as NextRequest;
  }
});