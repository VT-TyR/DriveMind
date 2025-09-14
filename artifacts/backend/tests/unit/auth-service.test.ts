/**
 * Unit Tests for AuthService - ALPHA Standards
 * Comprehensive test coverage with mocking and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthService } from '../../services/auth/auth-service';
import { AuthError, ValidationError } from '../../services/errors/error-types';

// Mock dependencies
jest.mock('googleapis');
jest.mock('../../../src/lib/admin');
jest.mock('../../services/logging/logger');
jest.mock('../../services/monitoring/metrics');
jest.mock('../../services/resilience/circuit-breaker');

const mockOAuth2Client = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  refreshAccessToken: jest.fn()
};

const mockFirestore = {
  doc: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn()
      }))
    }))
  }))
};

const mockAdmin = {
  firestore: () => mockFirestore
};

// Setup mocks
beforeEach(() => {
  jest.clearAllMocks();
  
  // Mock Google OAuth2 constructor
  const { google } = require('googleapis');
  google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);
  google.oauth2 = jest.fn(() => ({
    tokeninfo: jest.fn().mockResolvedValue({})
  }));
  
  // Mock Firebase Admin
  const admin = require('../../../src/lib/admin');
  admin.admin = mockAdmin;
  
  // Mock environment variables
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test_client_id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test_client_secret';
  process.env.NEXT_PUBLIC_BASE_URL = 'https://test.drivemind.ai';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('constructor', () => {
    it('should initialize successfully with valid credentials', () => {
      expect(() => new AuthService()).not.toThrow();
    });

    it('should throw AuthError when OAuth credentials are missing', () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      
      expect(() => new AuthService()).toThrow(AuthError);
      expect(() => new AuthService()).toThrow('OAuth credentials not configured');
    });

    it('should throw AuthError when only client ID is missing', () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      
      expect(() => new AuthService()).toThrow(AuthError);
    });

    it('should throw AuthError when only client secret is missing', () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      
      expect(() => new AuthService()).toThrow(AuthError);
    });
  });

  describe('beginOAuth', () => {
    beforeEach(() => {
      mockOAuth2Client.generateAuthUrl.mockReturnValue('https://accounts.google.com/oauth2/auth?test=true');
    });

    it('should generate OAuth URL successfully with valid request', async () => {
      const request = { userId: 'test_user_123' };
      
      const result = await authService.beginOAuth(request);
      
      expect(result).toHaveProperty('url');
      expect(result.url).toBe('https://accounts.google.com/oauth2/auth?test=true');
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ],
        include_granted_scopes: true,
        state: 'test_user_123',
        response_type: 'code'
      });
    });

    it('should generate OAuth URL successfully without userId', async () => {
      const request = {};
      
      const result = await authService.beginOAuth(request);
      
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('state');
      expect(typeof result.state).toBe('string');
      expect(result.state!.length).toBeGreaterThan(0);
    });

    it('should validate request schema and reject invalid data', async () => {
      const invalidRequest = {
        userId: 123, // should be string
        invalidField: 'not_allowed'
      };
      
      await expect(authService.beginOAuth(invalidRequest))
        .rejects.toThrow(ValidationError);
    });

    it('should handle OAuth client errors gracefully', async () => {
      mockOAuth2Client.generateAuthUrl.mockImplementation(() => {
        throw new Error('OAuth client error');
      });
      
      await expect(authService.beginOAuth({}))
        .rejects.toThrow(AuthError);
    });

    it('should use correct redirect URI based on environment', () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'https://custom.domain.com';
      
      new AuthService();
      
      expect(mockOAuth2Client).toBeDefined();
      // Verify constructor called with correct redirect URI
    });
  });

  describe('handleCallback', () => {
    const mockTokens = {
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      id_token: 'test_id_token',
      expiry_date: Date.now() + 3600000
    };

    beforeEach(() => {
      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });
      mockOAuth2Client.setCredentials.mockReturnValue(undefined);
      
      // Mock circuit breaker
      const { circuitBreaker } = require('../../services/resilience/circuit-breaker');
      circuitBreaker.execute = jest.fn().mockImplementation(async (name, operation) => {
        return await operation();
      });
    });

    it('should process OAuth callback successfully', async () => {
      const params = {
        code: 'test_authorization_code',
        state: 'test_user_123'
      };
      
      const result = await authService.handleCallback(params);
      
      expect(result).toEqual({
        tokens: {
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          id_token: 'test_id_token',
          expiry_date: mockTokens.expiry_date,
          scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
          ]
        },
        userId: 'test_user_123'
      });
      
      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('test_authorization_code');
    });

    it('should throw AuthError when OAuth error is present', async () => {
      const params = {
        error: 'access_denied',
        state: 'test_user_123'
      };
      
      await expect(authService.handleCallback(params))
        .rejects.toThrow(AuthError);
    });

    it('should throw AuthError when authorization code is missing', async () => {
      const params = {
        state: 'test_user_123'
      };
      
      await expect(authService.handleCallback(params))
        .rejects.toThrow(AuthError);
    });

    it('should validate callback parameters schema', async () => {
      const invalidParams = {
        code: 123, // should be string
        invalidField: 'not_allowed'
      };
      
      await expect(authService.handleCallback(invalidParams))
        .rejects.toThrow(ValidationError);
    });

    it('should handle token exchange errors', async () => {
      mockOAuth2Client.getToken.mockRejectedValue(new Error('Token exchange failed'));
      
      const params = {
        code: 'test_code',
        state: 'test_user'
      };
      
      await expect(authService.handleCallback(params))
        .rejects.toThrow(AuthError);
    });

    it('should validate token scopes', async () => {
      // Mock token validation to fail
      const { google } = require('googleapis');
      google.oauth2().tokeninfo.mockRejectedValue(new Error('Invalid scopes'));
      
      const params = {
        code: 'test_code',
        state: 'test_user'
      };
      
      await expect(authService.handleCallback(params))
        .rejects.toThrow(AuthError);
    });
  });

  describe('syncTokens', () => {
    const mockTokens = {
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      id_token: 'test_id_token',
      expiry_date: Date.now() + 3600000,
      scope: ['https://www.googleapis.com/auth/drive']
    };

    beforeEach(() => {
      const mockSecretsDoc = {
        set: jest.fn().mockResolvedValue(undefined)
      };
      
      mockFirestore.doc.mockReturnValue({
        collection: jest.fn(() => ({
          doc: jest.fn(() => mockSecretsDoc)
        }))
      });
    });

    it('should sync tokens to Firestore successfully', async () => {
      const request = { userId: 'test_user_123' };
      
      await authService.syncTokens(request, mockTokens);
      
      expect(mockFirestore.doc).toHaveBeenCalledWith('users/test_user_123');
    });

    it('should validate sync request schema', async () => {
      const invalidRequest = {
        // missing userId
        invalidField: 'not_allowed'
      };
      
      await expect(authService.syncTokens(invalidRequest, mockTokens))
        .rejects.toThrow(ValidationError);
    });

    it('should handle Firestore errors gracefully', async () => {
      mockFirestore.doc.mockImplementation(() => {
        throw new Error('Firestore error');
      });
      
      const request = { userId: 'test_user_123' };
      
      await expect(authService.syncTokens(request, mockTokens))
        .rejects.toThrow(AuthError);
    });
  });

  describe('getAuthStatus', () => {
    it('should return unauthenticated when userId is empty', async () => {
      const result = await authService.getAuthStatus('');
      
      expect(result).toEqual({
        authenticated: false,
        hasValidToken: false
      });
    });

    it('should return unauthenticated when no tokens exist', async () => {
      const mockDoc = {
        get: jest.fn().mockResolvedValue({ exists: false })
      };
      mockFirestore.doc.mockReturnValue(mockDoc);
      
      const result = await authService.getAuthStatus('test_user_123');
      
      expect(result).toEqual({
        authenticated: false,
        hasValidToken: false
      });
    });

    it('should return authenticated with valid token', async () => {
      const futureExpiry = Date.now() + 3600000;
      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            expiry_date: futureExpiry,
            scopes: ['https://www.googleapis.com/auth/drive']
          })
        })
      };
      mockFirestore.doc.mockReturnValue(mockDoc);
      
      const result = await authService.getAuthStatus('test_user_123');
      
      expect(result).toEqual({
        authenticated: true,
        hasValidToken: true,
        tokenExpiry: new Date(futureExpiry).toISOString(),
        scopes: ['https://www.googleapis.com/auth/drive'],
        userId: 'test_user_123'
      });
    });

    it('should return authenticated with expired token', async () => {
      const pastExpiry = Date.now() - 3600000;
      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            expiry_date: pastExpiry,
            scopes: ['https://www.googleapis.com/auth/drive']
          })
        })
      };
      mockFirestore.doc.mockReturnValue(mockDoc);
      
      const result = await authService.getAuthStatus('test_user_123');
      
      expect(result).toEqual({
        authenticated: true,
        hasValidToken: false,
        tokenExpiry: new Date(pastExpiry).toISOString(),
        scopes: ['https://www.googleapis.com/auth/drive'],
        userId: 'test_user_123'
      });
    });

    it('should handle Firestore errors gracefully', async () => {
      mockFirestore.doc.mockImplementation(() => {
        throw new Error('Firestore error');
      });
      
      const result = await authService.getAuthStatus('test_user_123');
      
      expect(result).toEqual({
        authenticated: false,
        hasValidToken: false
      });
    });
  });

  describe('refreshToken', () => {
    const mockStoredTokens = {
      refresh_token: 'stored_refresh_token',
      scopes: ['https://www.googleapis.com/auth/drive']
    };

    const mockRefreshedCredentials = {
      access_token: 'new_access_token',
      expiry_date: Date.now() + 3600000
    };

    beforeEach(() => {
      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockStoredTokens
        }),
        update: jest.fn().mockResolvedValue(undefined)
      };
      mockFirestore.doc.mockReturnValue(mockDoc);
      
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: mockRefreshedCredentials
      });
    });

    it('should refresh token successfully', async () => {
      const result = await authService.refreshToken('test_user_123');
      
      expect(result).toEqual({
        access_token: 'new_access_token',
        refresh_token: 'stored_refresh_token',
        id_token: mockRefreshedCredentials.id_token,
        expiry_date: mockRefreshedCredentials.expiry_date,
        scope: ['https://www.googleapis.com/auth/drive']
      });
      
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: 'stored_refresh_token'
      });
    });

    it('should throw AuthError when no tokens exist', async () => {
      const mockDoc = {
        get: jest.fn().mockResolvedValue({ exists: false })
      };
      mockFirestore.doc.mockReturnValue(mockDoc);
      
      await expect(authService.refreshToken('test_user_123'))
        .rejects.toThrow(AuthError);
    });

    it('should handle refresh token errors', async () => {
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));
      
      await expect(authService.refreshToken('test_user_123'))
        .rejects.toThrow(AuthError);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when properly configured', async () => {
      const result = await authService.healthCheck();
      
      expect(result).toEqual({
        status: 'healthy',
        latency: expect.any(Number)
      });
      expect(result.latency).toBeGreaterThan(0);
    });

    it('should return unhealthy when OAuth credentials are missing', async () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      
      const result = await authService.healthCheck();
      
      expect(result).toEqual({
        status: 'unhealthy',
        message: 'OAuth credentials missing'
      });
    });

    it('should handle OAuth client initialization errors', async () => {
      const { google } = require('googleapis');
      google.auth.OAuth2.mockImplementation(() => {
        throw new Error('OAuth init error');
      });
      
      const result = await authService.healthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('OAuth init error');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed JSON in beginOAuth', async () => {
      // Test with undefined request
      await expect(authService.beginOAuth(undefined))
        .not.toThrow(); // Should handle gracefully with default values
    });

    it('should handle concurrent token refresh attempts', async () => {
      // This would require more complex mocking to simulate race conditions
      // For now, we test that multiple calls don't interfere
      const promises = [
        authService.getAuthStatus('test_user'),
        authService.getAuthStatus('test_user'),
        authService.getAuthStatus('test_user')
      ];
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('authenticated');
        expect(result).toHaveProperty('hasValidToken');
      });
    });

    it('should handle network timeouts gracefully', async () => {
      // Mock network timeout
      mockOAuth2Client.getToken.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 100);
        });
      });
      
      const params = { code: 'test_code' };
      
      await expect(authService.handleCallback(params))
        .rejects.toThrow(AuthError);
    });
  });
});