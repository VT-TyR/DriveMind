/**
 * Health & Monitoring Endpoint Integration Tests
 * Tests core health check and monitoring endpoints for production readiness
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'jest';
import { NextRequest } from 'next/server';
import { GET as healthHandler } from '../../../../src/app/api/health/route';
import { GET as metricsHandler } from '../../../../src/app/api/metrics/route';

// Mock Firebase dependencies
jest.mock('../../../../src/lib/firebase-config', () => ({
  getFirebaseConfig: jest.fn(() => ({
    projectId: 'drivemind-test',
    apiKey: 'test-api-key',
    authDomain: 'test.firebaseapp.com',
  })),
}));

jest.mock('../../../../src/lib/admin', () => ({
  getAdminFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ exists: true })),
      })),
    })),
  })),
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../../src/lib/logger', () => ({
  logger: mockLogger,
}));

describe('Health Endpoints Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment variables
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id-12345';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret-67890';
    process.env.NODE_ENV = 'test';
  });

  describe('/api/health', () => {
    it('should return healthy status with all dependencies healthy', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        build: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        environment: 'test',
        dependencies: {
          firebase: { status: 'healthy', latency_ms: expect.any(Number) },
          google_auth: { status: 'healthy', configured: true },
          database: expect.objectContaining({ status: expect.stringMatching(/healthy|degraded/) }),
        },
        metrics: {
          memory_used_mb: expect.any(Number),
          memory_total_mb: expect.any(Number),
          response_time_ms: expect.any(Number),
        },
        compliance: {
          alpha_codename: 'v1.8',
          aei21: 'compliant',
          security_headers: 'enabled',
          rate_limiting: 'enabled',
        },
      });
    });

    it('should return degraded status when dependencies unhealthy', async () => {
      // Remove OAuth config to simulate unhealthy state
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      expect(response.status).toBe(503);
      
      const body = await response.json();
      expect(body.status).toBe('degraded');
      expect(body.dependencies.google_auth.status).toBe('unhealthy');
    });

    it('should include proper security headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
      expect(response.headers.get('X-Request-ID')).toBeTruthy();
    });

    it('should handle errors gracefully', async () => {
      // Mock Firebase config to throw error
      const mockGetFirebaseConfig = require('../../../../src/lib/firebase-config').getFirebaseConfig;
      mockGetFirebaseConfig.mockImplementationOnce(() => {
        throw new Error('Firebase config error');
      });
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      expect(response.status).toBe(503);
      
      const body = await response.json();
      expect(body.status).toBe('unhealthy');
      expect(body.error).toBe('Health check failed');
    });

    it('should validate response time performance', async () => {
      const startTime = Date.now();
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Health check should respond within 1000ms
      expect(responseTime).toBeLessThan(1000);
      
      const body = await response.json();
      expect(body.metrics.response_time_ms).toBeLessThanOrEqual(responseTime);
    });

    it('should validate memory usage metrics', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      
      expect(body.metrics.memory_used_mb).toBeGreaterThan(0);
      expect(body.metrics.memory_total_mb).toBeGreaterThan(body.metrics.memory_used_mb);
    });

    it('should log health check events', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      await healthHandler(request);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Health check completed',
        expect.objectContaining({
          requestId: expect.any(String),
          status: expect.any(String),
          responseTime: expect.any(Number),
        })
      );
    });
  });

  describe('Firebase Dependencies', () => {
    it('should validate Firebase project ID format', async () => {
      const mockGetFirebaseConfig = require('../../../../src/lib/firebase-config').getFirebaseConfig;
      mockGetFirebaseConfig.mockReturnValueOnce({
        projectId: 'invalid_project_id!', // Invalid format
        apiKey: 'test-api-key',
      });
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.dependencies.firebase.status).toBe('unhealthy');
    });

    it('should handle missing Firebase config', async () => {
      const mockGetFirebaseConfig = require('../../../../src/lib/firebase-config').getFirebaseConfig;
      mockGetFirebaseConfig.mockReturnValueOnce(null);
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.dependencies.firebase.status).toBe('unhealthy');
    });
  });

  describe('Google Auth Dependencies', () => {
    it('should validate OAuth client ID and secret presence', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.dependencies.google_auth.status).toBe('healthy');
      expect(body.dependencies.google_auth.configured).toBe(true);
    });

    it('should detect missing OAuth configuration', async () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.dependencies.google_auth.status).toBe('unhealthy');
      expect(body.dependencies.google_auth.configured).toBe(false);
    });

    it('should validate OAuth credentials format', async () => {
      process.env.GOOGLE_OAUTH_CLIENT_ID = 'short'; // Too short
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'short'; // Too short
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.dependencies.google_auth.status).toBe('unhealthy');
    });
  });

  describe('Database Dependencies', () => {
    it('should handle database connection timeout', async () => {
      const mockGetAdminFirestore = require('../../../../src/lib/admin').getAdminFirestore;
      mockGetAdminFirestore.mockReturnValueOnce({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn(() => new Promise(() => {})), // Never resolves (timeout)
          })),
        })),
      });
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.dependencies.database.status).toBe('degraded');
      expect(body.dependencies.database.connected).toBe(false);
    });

    it('should handle database unavailable', async () => {
      const mockGetAdminFirestore = require('../../../../src/lib/admin').getAdminFirestore;
      mockGetAdminFirestore.mockReturnValueOnce(null);
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.dependencies.database.status).toBe('unhealthy');
      expect(body.dependencies.database.connected).toBe(false);
    });
  });

  describe('Performance Requirements', () => {
    it('should meet SLA response time requirements', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const request = new NextRequest('http://localhost:3000/api/health');
        const response = await healthHandler(request);
        const endTime = Date.now();
        
        expect(response.status).toBeLessThan(600); // Valid HTTP status
        responseTimes.push(endTime - startTime);
      }
      
      // Calculate P95 response time
      responseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(0.95 * responseTimes.length);
      const p95ResponseTime = responseTimes[p95Index];
      
      // P95 should be under 250ms as per ALPHA standards
      expect(p95ResponseTime).toBeLessThan(250);
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, () => {
        const request = new NextRequest('http://localhost:3000/api/health');
        return healthHandler(request);
      });
      
      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBeLessThan(600);
      });
      
      // Total time should be reasonable for concurrent requests
      expect(endTime - startTime).toBeLessThan(2000); // 2 seconds max
    });
  });

  describe('Security & Compliance', () => {
    it('should not expose sensitive information', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      const responseText = JSON.stringify(body);
      
      // Should not contain sensitive environment variables
      expect(responseText).not.toContain(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
      expect(responseText).not.toContain(process.env.GEMINI_API_KEY);
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('secret');
      expect(responseText).not.toContain('token');
    });

    it('should include ALPHA compliance markers', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await healthHandler(request);
      
      const body = await response.json();
      expect(body.compliance.alpha_codename).toBe('v1.8');
      expect(body.compliance.aei21).toBe('compliant');
    });

    it('should generate unique request IDs', async () => {
      const request1 = new NextRequest('http://localhost:3000/api/health');
      const request2 = new NextRequest('http://localhost:3000/api/health');
      
      const [response1, response2] = await Promise.all([
        healthHandler(request1),
        healthHandler(request2),
      ]);
      
      const requestId1 = response1.headers.get('X-Request-ID');
      const requestId2 = response2.headers.get('X-Request-ID');
      
      expect(requestId1).toBeTruthy();
      expect(requestId2).toBeTruthy();
      expect(requestId1).not.toBe(requestId2);
    });
  });
});