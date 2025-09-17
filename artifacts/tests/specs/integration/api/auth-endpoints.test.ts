/**
 * Authentication Endpoint Integration Tests
 * Tests OAuth flow, token management, and authentication security
 */

import { describe, it, expect, beforeEach, jest } from 'jest';
import { NextRequest } from 'next/server';
import { POST as authBeginHandler } from '../../../../src/app/api/auth/drive/begin/route';
import { GET as authStatusHandler } from '../../../../src/app/api/auth/drive/status/route';

// Mock dependencies
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth/authorize?mock=true'),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expiry_date: Date.now() + 3600000,
          },
        }),
      })),
    },
  },
}));

jest.mock('../../../../src/lib/security/rate-limiter', () => ({
  rateLimiters: {
    auth: jest.fn((req, handler) => handler(req)),
  },
}));

jest.mock('../../../../src/lib/security/middleware', () => ({
  securityMiddleware: jest.fn((req, handler) => handler(req)),
  validateCSRFToken: jest.fn(() => true),
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

describe('Authentication Endpoints Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up OAuth environment variables
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id-12345';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret-67890';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://test.example.com';
  });

  describe('/api/auth/drive/begin', () => {
    it('should initiate OAuth flow successfully', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user-123',
          csrfToken: 'valid-csrf-token',
        }),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body).toEqual({
        url: expect.stringContaining('https://accounts.google.com/oauth/authorize'),
      });
    });

    it('should handle missing OAuth configuration', async () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error).toBe('Service configuration error');
    });

    it('should validate request parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalidParam: 'invalid' }),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid request parameters');
    });

    it('should reject invalid CSRF tokens', async () => {
      const mockValidateCSRFToken = require('../../../../src/lib/security/middleware').validateCSRFToken;
      mockValidateCSRFToken.mockReturnValueOnce(false);

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user-123',
          csrfToken: 'invalid-csrf-token',
        }),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(403);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid security token');
    });

    it('should generate secure state parameter', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/oauth/authorize?state=encoded-state');
      mockOAuth2.mockImplementationOnce(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
      }));

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      await authBeginHandler(request);

      expect(mockGenerateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive'],
        include_granted_scopes: true,
        state: expect.any(String),
      });
    });

    it('should use correct redirect URI', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      let capturedRedirectUri: string;

      mockOAuth2.mockImplementationOnce((clientId: string, clientSecret: string, redirectUri: string) => {
        capturedRedirectUri = redirectUri;
        return {
          generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth/authorize'),
        };
      });

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      await authBeginHandler(request);

      expect(capturedRedirectUri).toBe('https://test.example.com/api/auth/drive/callback');
    });

    it('should handle malformed JSON requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{',
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid request parameters');
    });

    it('should log OAuth events securely', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      await authBeginHandler(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'OAuth flow initiated',
        expect.objectContaining({
          hasUserId: true,
          redirectUri: expect.stringContaining('[REDACTED]'),
        })
      );

      // Should not log sensitive data
      const logCalls = mockLogger.info.mock.calls;
      const logData = JSON.stringify(logCalls);
      expect(logData).not.toContain(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
      expect(logData).not.toContain('test-client-secret');
    });
  });

  describe('Security Validation', () => {
    it('should apply rate limiting', async () => {
      const mockRateLimiter = require('../../../../src/lib/security/rate-limiter').rateLimiters.auth;
      
      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      await authBeginHandler(request);

      expect(mockRateLimiter).toHaveBeenCalledWith(request, expect.any(Function));
    });

    it('should apply security middleware', async () => {
      const mockSecurityMiddleware = require('../../../../src/lib/security/middleware').securityMiddleware;
      
      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      await authBeginHandler(request);

      expect(mockSecurityMiddleware).toHaveBeenCalledWith(request, expect.any(Function));
    });

    it('should handle security middleware errors', async () => {
      const mockSecurityMiddleware = require('../../../../src/lib/security/middleware').securityMiddleware;
      mockSecurityMiddleware.mockImplementationOnce(() => {
        throw new Error('Security check failed');
      });

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error).toBe('Authentication service unavailable');
    });
  });

  describe('Error Handling', () => {
    it('should handle OAuth2 client initialization errors', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      mockOAuth2.mockImplementationOnce(() => {
        throw new Error('OAuth2 initialization failed');
      });

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error).toBe('Authentication service unavailable');
    });

    it('should handle generateAuthUrl errors', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      mockOAuth2.mockImplementationOnce(() => ({
        generateAuthUrl: jest.fn().mockImplementation(() => {
          throw new Error('URL generation failed');
        }),
      }));

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error).toBe('Authentication service unavailable');
    });

    it('should log errors without exposing stack traces', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      mockOAuth2.mockImplementationOnce(() => {
        throw new Error('Test error message');
      });

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      await authBeginHandler(request);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'OAuth begin failed',
        { error: 'Test error message' }
      );

      // Should not log full stack trace
      const errorCalls = mockLogger.error.mock.calls;
      const errorData = JSON.stringify(errorCalls);
      expect(errorData).not.toContain('stack');
      expect(errorData).not.toContain('at ');
    });
  });

  describe('State Parameter Security', () => {
    it('should include timestamp in state parameter', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      let capturedState: string;

      mockOAuth2.mockImplementationOnce(() => ({
        generateAuthUrl: jest.fn().mockImplementation((options) => {
          capturedState = options.state;
          return 'https://accounts.google.com/oauth/authorize';
        }),
      }));

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      await authBeginHandler(request);

      // Decode and verify state parameter
      const decodedState = JSON.parse(Buffer.from(capturedState, 'base64').toString());
      expect(decodedState).toMatchObject({
        userId: 'test-user-123',
        timestamp: expect.any(Number),
        nonce: expect.any(String),
      });

      // Timestamp should be recent
      expect(decodedState.timestamp).toBeGreaterThan(Date.now() - 5000);
      expect(decodedState.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should include random nonce in state parameter', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      const capturedStates: string[] = [];

      mockOAuth2.mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockImplementation((options) => {
          capturedStates.push(options.state);
          return 'https://accounts.google.com/oauth/authorize';
        }),
      }));

      // Generate multiple requests
      for (let i = 0; i < 3; i++) {
        const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: `test-user-${i}` }),
        });

        await authBeginHandler(request);
      }

      // All states should be different due to nonce
      expect(capturedStates).toHaveLength(3);
      expect(new Set(capturedStates).size).toBe(3);

      // Verify nonces are different
      const nonces = capturedStates.map(state => {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        return decoded.nonce;
      });
      
      expect(new Set(nonces).size).toBe(3);
    });

    it('should handle requests without userId', async () => {
      const mockOAuth2 = require('googleapis').google.auth.OAuth2;
      let capturedState: string | undefined;

      mockOAuth2.mockImplementationOnce(() => ({
        generateAuthUrl: jest.fn().mockImplementation((options) => {
          capturedState = options.state;
          return 'https://accounts.google.com/oauth/authorize';
        }),
      }));

      const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await authBeginHandler(request);
      
      expect(response.status).toBe(200);
      expect(capturedState).toBeUndefined();
    });
  });

  describe('Performance Requirements', () => {
    it('should respond within SLA timeframes', async () => {
      const iterations = 5;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: `test-user-${i}` }),
        });

        const response = await authBeginHandler(request);
        const endTime = Date.now();
        
        expect(response.status).toBe(200);
        responseTimes.push(endTime - startTime);
      }

      // P95 should be under 250ms
      responseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(0.95 * responseTimes.length);
      const p95ResponseTime = responseTimes[p95Index];
      
      expect(p95ResponseTime).toBeLessThan(250);
    });

    it('should handle concurrent OAuth initiations', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, (_, i) => {
        const request = new NextRequest('http://localhost:3000/api/auth/drive/begin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: `concurrent-user-${i}` }),
        });
        return authBeginHandler(request);
      });

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });
});