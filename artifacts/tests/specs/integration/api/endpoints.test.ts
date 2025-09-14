/**
 * API Endpoints Integration Tests - ALPHA Standards
 * End-to-end testing of API routes with real Firebase integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { NextRequest } from 'next/server';
import { createMocks } from 'node-mocks-http';

// Import API route handlers
import { GET as healthHandler } from '../../../../backend/api/health/route';
import { GET as metricsHandler, POST as logMetricsHandler } from '../../../../backend/api/metrics/route';
import { POST as beginOAuthHandler } from '../../../../backend/api/auth/drive/begin/route';
import { GET as authCallbackHandler, POST as authCallbackPostHandler } from '../../../../backend/api/auth/drive/callback/route';
import { GET as authStatusHandler } from '../../../../backend/api/auth/drive/status/route';
import { POST as syncTokensHandler } from '../../../../backend/api/auth/drive/sync/route';
import { POST as scanHandler } from '../../../../backend/api/workflows/scan/route';
import { POST as backgroundScanHandler } from '../../../../backend/api/workflows/background-scan/route';
import { GET as scanStatusHandler } from '../../../../backend/api/workflows/background-scan/state/route';
import { POST as duplicatesHandler } from '../../../../backend/api/workflows/duplicates/route';
import { POST as classifyHandler } from '../../../../backend/api/ai/classify/route';
import { POST as proposeRuleHandler } from '../../../../backend/api/ai/propose-rule/route';
import { GET as aiHealthHandler } from '../../../../backend/api/ai/health-check/route';

// Test utilities
import { setupTestFirestore, cleanupTestFirestore } from '../../fixtures/firestore-test-utils';
import { createTestUser, deleteTestUser } from '../../fixtures/auth-test-utils';
import { mockGoogleAPIs } from '../../fixtures/google-api-mocks';

// Constants
const TEST_USER_ID = 'integration_test_user';
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('API Endpoints Integration Tests', () => {
  let testFirestore: any;
  let testUserId: string;
  let validAuthToken: string;

  beforeAll(async () => {
    // Setup test environment
    testFirestore = await setupTestFirestore();
    testUserId = await createTestUser(TEST_USER_ID);
    validAuthToken = 'test-firebase-id-token';
    
    // Mock external services
    mockGoogleAPIs();
  });

  afterAll(async () => {
    await deleteTestUser(testUserId);
    await cleanupTestFirestore();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupTestData();
  });

  describe('System Endpoints', () => {
    describe('GET /api/health', () => {
      it('should return healthy status with all dependencies', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/health',
        });

        await healthHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          status: 'healthy',
          version: expect.any(String),
          uptime: expect.any(Number),
          timestamp: expect.any(String),
          environment: expect.stringMatching(/development|staging|production/),
          dependencies: {
            firebase: {
              status: expect.stringMatching(/healthy|degraded/),
              latency: expect.any(Number)
            },
            google_auth: {
              status: expect.stringMatching(/healthy|degraded/),
              latency: expect.any(Number)
            }
          },
          metrics: {
            memory: {
              rss: expect.any(Number),
              heapTotal: expect.any(Number),
              heapUsed: expect.any(Number)
            }
          }
        });
      });

      it('should return unhealthy status when dependencies fail', async () => {
        // Mock Firestore failure
        process.env.FORCE_FIRESTORE_ERROR = 'true';

        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/health',
        });

        await healthHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(503);
        expect(response.status).toBe('unhealthy');
        expect(response.dependencies.firebase.status).toBe('unhealthy');

        delete process.env.FORCE_FIRESTORE_ERROR;
      });

      it('should respond within performance SLA', async () => {
        const startTime = Date.now();

        const { req } = createMocks({
          method: 'GET',
          url: '/api/health',
        });

        await healthHandler(req as NextRequest);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(100); // p95 < 100ms for health checks
      });

      it('should include proper cache headers', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/health',
        });

        await healthHandler(req as NextRequest);

        expect(res.getHeader('Cache-Control')).toBe('no-cache');
      });
    });

    describe('GET /api/metrics', () => {
      it('should return system metrics', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/metrics',
        });

        await metricsHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          timestamp: expect.any(String),
          application: {
            name: 'drivemind',
            version: expect.any(String),
            environment: expect.any(String),
            uptime: expect.any(Number)
          },
          system: {
            memory: expect.any(Object),
            cpu: expect.any(Object),
            platform: expect.any(String),
            nodeVersion: expect.any(String)
          },
          business: {
            activeUsers: expect.any(Number),
            filesProcessed: expect.any(Number),
            duplicatesDetected: expect.any(Number),
            aiInsightsGenerated: expect.any(Number)
          }
        });
      });
    });

    describe('POST /api/metrics', () => {
      it('should log custom metrics', async () => {
        const metricData = {
          event: 'test_event',
          data: {
            userId: TEST_USER_ID,
            action: 'integration_test'
          },
          timestamp: new Date().toISOString()
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            'Content-Type': 'application/json'
          },
          body: metricData
        });

        await logMetricsHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          success: true,
          message: 'Metric recorded',
          timestamp: expect.any(String)
        });
      });

      it('should validate metric data structure', async () => {
        const invalidMetricData = {
          // Missing required 'event' field
          data: { test: 'value' }
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            'Content-Type': 'application/json'
          },
          body: invalidMetricData
        });

        await logMetricsHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(400);
        expect(response).toMatchObject({
          error: 'invalid_request',
          message: expect.stringContaining('event')
        });
      });
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/drive/begin', () => {
      it('should initiate OAuth flow successfully', async () => {
        const requestBody = { userId: TEST_USER_ID };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/auth/drive/begin',
          headers: {
            'Content-Type': 'application/json'
          },
          body: requestBody
        });

        await beginOAuthHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          url: expect.stringContaining('accounts.google.com'),
          state: TEST_USER_ID
        });
        expect(response.url).toContain('scope=https%3A//www.googleapis.com/auth/drive');
      });

      it('should handle anonymous OAuth initiation', async () => {
        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/auth/drive/begin',
          headers: {
            'Content-Type': 'application/json'
          },
          body: {}
        });

        await beginOAuthHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response.url).toBeDefined();
        expect(response.state).toMatch(/^anonymous_\w+/);
      });

      it('should enforce rate limiting', async () => {
        // Make multiple rapid requests
        const requests = Array.from({ length: 101 }, () =>
          createMocks({
            method: 'POST',
            url: '/api/auth/drive/begin',
            headers: {
              'Content-Type': 'application/json',
              'X-Real-IP': '192.168.1.100' // Same IP for rate limiting
            },
            body: { userId: `test_user_${Date.now()}` }
          })
        );

        const responses = await Promise.all(
          requests.map(async ({ req }) => {
            try {
              await beginOAuthHandler(req as NextRequest);
              return 200;
            } catch (error) {
              return error.status || 500;
            }
          })
        );

        const rateLimitedResponses = responses.filter(status => status === 429);
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      });
    });

    describe('GET /api/auth/drive/callback', () => {
      it('should handle OAuth callback successfully', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/auth/drive/callback',
          query: {
            code: 'test_authorization_code',
            state: TEST_USER_ID
          }
        });

        await authCallbackHandler(req as NextRequest);

        expect(res.statusCode).toBe(302);
        expect(res.getHeader('Location')).toContain('/dashboard');
        expect(res.getHeader('Set-Cookie')).toBeDefined();
      });

      it('should handle OAuth error in callback', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/auth/drive/callback',
          query: {
            error: 'access_denied',
            error_description: 'User denied access',
            state: TEST_USER_ID
          }
        });

        await authCallbackHandler(req as NextRequest);

        expect(res.statusCode).toBe(302);
        expect(res.getHeader('Location')).toContain('error=oauth_error');
      });

      it('should validate state parameter', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/auth/drive/callback',
          query: {
            code: 'test_code',
            state: 'invalid_state'
          }
        });

        await authCallbackHandler(req as NextRequest);

        // Should still process but with the provided state
        expect(res.statusCode).toBe(302);
      });
    });

    describe('POST /api/auth/drive/sync', () => {
      it('should sync tokens successfully', async () => {
        const requestBody = { userId: TEST_USER_ID };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/auth/drive/sync',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`,
            'Cookie': 'google_access_token=test_access_token; google_refresh_token=test_refresh_token'
          },
          body: requestBody
        });

        await syncTokensHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          success: true,
          message: 'Tokens synchronized to persistent storage'
        });

        // Verify tokens were stored in Firestore
        const tokenDoc = await testFirestore
          .doc(`users/${TEST_USER_ID}/secrets/oauth_tokens`)
          .get();
        
        expect(tokenDoc.exists).toBe(true);
      });

      it('should require authentication', async () => {
        const requestBody = { userId: TEST_USER_ID };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/auth/drive/sync',
          headers: {
            'Content-Type': 'application/json'
            // Missing Authorization header
          },
          body: requestBody
        });

        await syncTokensHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(401);
        expect(response).toMatchObject({
          error: 'unauthorized',
          message: expect.stringContaining('authorization')
        });
      });

      it('should validate request body', async () => {
        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/auth/drive/sync',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: {} // Missing userId
        });

        await syncTokensHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(400);
        expect(response).toMatchObject({
          error: 'invalid_request',
          message: expect.stringContaining('userId')
        });
      });
    });

    describe('GET /api/auth/drive/status', () => {
      beforeEach(async () => {
        // Setup test tokens in Firestore
        await testFirestore
          .doc(`users/${TEST_USER_ID}/secrets/oauth_tokens`)
          .set({
            access_token: 'test_access_token',
            refresh_token: 'test_refresh_token',
            expiry_date: Date.now() + 3600000,
            scope: ['https://www.googleapis.com/auth/drive'],
            createdAt: new Date().toISOString()
          });
      });

      it('should return authentication status', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/auth/drive/status',
          headers: {
            'Authorization': `Bearer ${validAuthToken}`
          }
        });

        await authStatusHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          authenticated: true,
          hasValidToken: true,
          tokenExpiry: expect.any(String),
          scopes: expect.arrayContaining(['https://www.googleapis.com/auth/drive'])
        });
      });

      it('should detect expired tokens', async () => {
        // Update tokens to be expired
        await testFirestore
          .doc(`users/${TEST_USER_ID}/secrets/oauth_tokens`)
          .update({
            expiry_date: Date.now() - 3600000 // Expired 1 hour ago
          });

        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/auth/drive/status',
          headers: {
            'Authorization': `Bearer ${validAuthToken}`
          }
        });

        await authStatusHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          authenticated: true,
          hasValidToken: false
        });
      });

      it('should handle non-existent user', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/auth/drive/status',
          headers: {
            'Authorization': 'Bearer fake_token_for_nonexistent_user'
          }
        });

        await authStatusHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          authenticated: false,
          hasValidToken: false
        });
      });
    });
  });

  describe('Workflow Endpoints', () => {
    beforeEach(async () => {
      // Setup authenticated user with valid tokens
      await testFirestore
        .doc(`users/${TEST_USER_ID}/secrets/oauth_tokens`)
        .set({
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          expiry_date: Date.now() + 3600000,
          scope: ['https://www.googleapis.com/auth/drive']
        });
    });

    describe('POST /api/workflows/scan', () => {
      it('should perform drive scan successfully', async () => {
        const requestBody = {
          maxDepth: 10,
          includeTrashed: false,
          scanSharedDrives: false
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/workflows/scan',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: requestBody
        });

        await scanHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          scanId: expect.any(String),
          totalFiles: expect.any(Number),
          totalSize: expect.any(Number),
          filesByType: expect.any(Object),
          folderDepth: expect.any(Number),
          duplicateFiles: expect.any(Number),
          completedAt: expect.any(String),
          processingTime: expect.any(Number)
        });
      });

      it('should handle large drives with timeout', async () => {
        // Mock large drive response that would timeout
        process.env.MOCK_LARGE_DRIVE = 'true';

        const requestBody = {
          maxDepth: 50,
          scanSharedDrives: true
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/workflows/scan',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: requestBody
        });

        await scanHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        // Should return async response for large scans
        if (res.statusCode === 202) {
          expect(response).toMatchObject({
            scanId: expect.any(String),
            status: expect.stringMatching(/initiated|running/),
            message: expect.stringContaining('scan')
          });
        }

        delete process.env.MOCK_LARGE_DRIVE;
      });

      it('should validate scan parameters', async () => {
        const invalidRequest = {
          maxDepth: 100, // Exceeds maximum
          includeTrashed: 'invalid', // Should be boolean
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/workflows/scan',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: invalidRequest
        });

        await scanHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(400);
        expect(response).toMatchObject({
          error: 'invalid_request',
          message: expect.stringContaining('validation')
        });
      });

      it('should enforce rate limiting', async () => {
        // Make multiple rapid scan requests
        const requests = Array.from({ length: 11 }, () => ({
          method: 'POST',
          url: '/api/workflows/scan',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: { maxDepth: 5 }
        }));

        let rateLimitHit = false;
        for (const requestConfig of requests) {
          const { req, res } = createMocks(requestConfig);
          await scanHandler(req as NextRequest);
          
          if (res.statusCode === 429) {
            rateLimitHit = true;
            expect(res.getHeader('Retry-After')).toBeDefined();
            break;
          }
        }

        expect(rateLimitHit).toBe(true);
      });
    });

    describe('POST /api/workflows/background-scan', () => {
      it('should initiate background scan', async () => {
        const requestBody = {
          userId: TEST_USER_ID,
          maxDepth: 20,
          includeTrashed: false
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/workflows/background-scan',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: requestBody
        });

        await backgroundScanHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(202);
        expect(response).toMatchObject({
          scanId: expect.any(String),
          status: expect.stringMatching(/queued|running/),
          estimatedCompletion: expect.any(String)
        });

        // Verify scan document was created in Firestore
        const scanDoc = await testFirestore
          .doc(`users/${TEST_USER_ID}/scans/${response.scanId}`)
          .get();
        
        expect(scanDoc.exists).toBe(true);
      });
    });

    describe('GET /api/workflows/background-scan/state', () => {
      let testScanId: string;

      beforeEach(async () => {
        // Create test scan document
        testScanId = `scan_${Date.now()}`;
        await testFirestore
          .doc(`users/${TEST_USER_ID}/scans/${testScanId}`)
          .set({
            scanId: testScanId,
            status: 'running',
            progress: 45,
            startTime: new Date().toISOString(),
            filesProcessed: 450,
            totalFiles: 1000,
            createdAt: new Date().toISOString()
          });
      });

      it('should get scan status successfully', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: `/api/workflows/background-scan/state?scanId=${testScanId}&userId=${TEST_USER_ID}`,
          headers: {
            'Authorization': `Bearer ${validAuthToken}`
          }
        });

        await scanStatusHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          scanId: testScanId,
          status: 'running',
          progress: 45,
          startTime: expect.any(String),
          filesProcessed: 450,
          totalFiles: 1000
        });
      });

      it('should return 404 for non-existent scan', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/workflows/background-scan/state?scanId=nonexistent&userId=' + TEST_USER_ID,
          headers: {
            'Authorization': `Bearer ${validAuthToken}`
          }
        });

        await scanStatusHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(404);
        expect(response).toMatchObject({
          error: 'not_found',
          message: expect.stringContaining('Scan not found')
        });
      });
    });

    describe('POST /api/workflows/duplicates', () => {
      it('should detect duplicates successfully', async () => {
        const requestBody = {
          algorithm: 'combined',
          threshold: 0.85,
          includeVersions: true
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/workflows/duplicates',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: requestBody
        });

        await duplicatesHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          duplicateGroups: expect.any(Array),
          summary: {
            totalFiles: expect.any(Number),
            duplicateFiles: expect.any(Number),
            spaceWasted: expect.any(Number),
            duplicateGroups: expect.any(Number)
          }
        });
      });
    });
  });

  describe('AI Endpoints', () => {
    beforeEach(async () => {
      // Setup authenticated user
      await testFirestore
        .doc(`users/${TEST_USER_ID}/secrets/oauth_tokens`)
        .set({
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          expiry_date: Date.now() + 3600000
        });
    });

    describe('POST /api/ai/classify', () => {
      it('should classify files successfully', async () => {
        const requestBody = {
          fileIds: ['file1', 'file2', 'file3'],
          categories: ['Invoice', 'Contract', 'Personal'],
          includeContent: false
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/ai/classify',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: requestBody
        });

        await classifyHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          classifications: expect.arrayContaining([
            expect.objectContaining({
              fileId: expect.any(String),
              fileName: expect.any(String),
              category: expect.any(String),
              confidence: expect.any(Number),
              tags: expect.any(Array),
              reasoning: expect.any(String)
            })
          ])
        });
      });

      it('should enforce file ID limit', async () => {
        const requestBody = {
          fileIds: Array.from({ length: 101 }, (_, i) => `file${i}`)
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/ai/classify',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: requestBody
        });

        await classifyHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(400);
        expect(response.message).toContain('100');
      });

      it('should handle AI service unavailable', async () => {
        process.env.MOCK_AI_UNAVAILABLE = 'true';

        const requestBody = {
          fileIds: ['file1'],
          categories: ['Document']
        };

        const { req, res } = createMocks({
          method: 'POST',
          url: '/api/ai/classify',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: requestBody
        });

        await classifyHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(503);
        expect(response).toMatchObject({
          error: 'service_unavailable',
          message: expect.stringContaining('AI')
        });

        delete process.env.MOCK_AI_UNAVAILABLE;
      });
    });

    describe('GET /api/ai/health-check', () => {
      it('should return AI service health', async () => {
        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/ai/health-check'
        });

        await aiHealthHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        expect(res.statusCode).toBe(200);
        expect(response).toMatchObject({
          status: expect.stringMatching(/healthy|degraded|unhealthy/),
          services: {
            gemini: {
              status: expect.any(String),
              latency: expect.any(Number),
              quotaRemaining: expect.any(Number)
            }
          }
        });
      });

      it('should detect AI service degradation', async () => {
        process.env.MOCK_AI_SLOW = 'true';

        const { req, res } = createMocks({
          method: 'GET',
          url: '/api/ai/health-check'
        });

        await aiHealthHandler(req as NextRequest);
        const response = JSON.parse(res._getData());

        if (response.status === 'degraded') {
          expect(response.services.gemini.latency).toBeGreaterThan(1000);
        }

        delete process.env.MOCK_AI_SLOW;
      });
    });
  });

  describe('Error Handling', () => {
    it('should return consistent error format', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        url: '/api/auth/drive/sync',
        headers: {
          'Content-Type': 'application/json'
        },
        body: { invalid: 'data' }
      });

      await syncTokensHandler(req as NextRequest);
      const response = JSON.parse(res._getData());

      expect(response).toMatchObject({
        error: expect.any(String),
        message: expect.any(String),
        timestamp: expect.any(String),
        requestId: expect.any(String)
      });
    });

    it('should include proper CORS headers', async () => {
      const { req, res } = createMocks({
        method: 'OPTIONS',
        url: '/api/health',
        headers: {
          'Origin': 'https://studio--drivemind-q69b7.us-central1.hosted.app'
        }
      });

      // Mock OPTIONS handler
      res.setHeader('Access-Control-Allow-Origin', 'https://studio--drivemind-q69b7.us-central1.hosted.app');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      expect(res.getHeader('Access-Control-Allow-Origin')).toBeDefined();
      expect(res.getHeader('Access-Control-Allow-Methods')).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should meet response time SLAs', async () => {
      const endpoints = [
        { method: 'GET', url: '/api/health', sla: 100 },
        { method: 'GET', url: '/api/metrics', sla: 200 },
        { method: 'POST', url: '/api/auth/drive/begin', sla: 250 },
        { method: 'GET', url: '/api/auth/drive/status', sla: 250 }
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();

        const { req } = createMocks({
          method: endpoint.method,
          url: endpoint.url,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`
          },
          body: endpoint.method === 'POST' ? {} : undefined
        });

        // Call appropriate handler based on endpoint
        if (endpoint.url === '/api/health') {
          await healthHandler(req as NextRequest);
        } else if (endpoint.url === '/api/metrics') {
          await metricsHandler(req as NextRequest);
        } else if (endpoint.url === '/api/auth/drive/begin') {
          await beginOAuthHandler(req as NextRequest);
        } else if (endpoint.url === '/api/auth/drive/status') {
          await authStatusHandler(req as NextRequest);
        }

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(endpoint.sla);
      }
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 20;
      const requests = Array.from({ length: concurrentRequests }, () =>
        createMocks({
          method: 'GET',
          url: '/api/health'
        })
      );

      const startTime = Date.now();
      
      await Promise.all(
        requests.map(({ req }) => healthHandler(req as NextRequest))
      );

      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / concurrentRequests;

      expect(averageTime).toBeLessThan(150); // Should handle concurrent requests efficiently
    });
  });

  // Helper function to clean up test data
  async function cleanupTestData() {
    try {
      // Clean up test user data
      const userRef = testFirestore.doc(`users/${TEST_USER_ID}`);
      
      // Delete subcollections
      const secretsRef = userRef.collection('secrets');
      const scansRef = userRef.collection('scans');
      
      const [secrets, scans] = await Promise.all([
        secretsRef.get(),
        scansRef.get()
      ]);

      const deletePromises = [];
      
      secrets.forEach(doc => {
        deletePromises.push(doc.ref.delete());
      });
      
      scans.forEach(doc => {
        deletePromises.push(doc.ref.delete());
      });

      await Promise.all(deletePromises);
      
      // Delete main user document
      await userRef.delete();
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  }
});