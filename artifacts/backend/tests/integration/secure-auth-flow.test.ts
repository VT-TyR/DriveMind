/**
 * Secure Authentication Flow Integration Tests
 * 
 * End-to-end testing of PKCE-enhanced OAuth flow with token encryption.
 * Tests the complete security chain from OAuth initiation to token storage.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createServer } from 'http';
import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '../../services/auth/auth-service';
import { TokenEncryptionService } from '../../services/security/token-encryption-service';
import { SecurityMiddleware } from '../../services/security/security-middleware';
import { PIIRedactionService } from '../../services/security/pii-redaction-service';

// Mock external dependencies
jest.mock('@google-cloud/kms');
jest.mock('googleapis');
jest.mock('firebase-admin');

// Mock environment variables
const originalEnv = process.env;

beforeAll(() => {
  process.env = {
    ...originalEnv,
    GOOGLE_CLOUD_PROJECT: 'test-project',
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
    NEXT_PUBLIC_BASE_URL: 'https://test.drivemind.ai'
  };
});

afterAll(() => {
  process.env = originalEnv;
});

// Mock OAuth responses
const mockGoogleAuth = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  refreshAccessToken: jest.fn()
};

const mockFirestore = {
  doc: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        set: jest.fn(),
        get: jest.fn()
      })
    })
  }),
  collection: jest.fn()
};

// Mock KMS client
const mockKmsClient = {
  cryptoKeyPath: jest.fn(),
  keyRingPath: jest.fn(),
  locationPath: jest.fn(),
  createKeyRing: jest.fn(),
  createCryptoKey: jest.fn(),
  getCryptoKey: jest.fn(),
  generateDataKey: jest.fn().mockResolvedValue([{
    plaintext: Buffer.from('test-encryption-key-32-bytes-long!'),
    name: 'test-key-version'
  }])
};

describe('Secure Authentication Flow Integration', () => {
  let authService: AuthService;
  let tokenEncryptionService: TokenEncryptionService;
  let securityMiddleware: SecurityMiddleware;
  let piiRedactionService: PIIRedactionService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock implementations
    require('googleapis').google = {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => mockGoogleAuth)
      },
      oauth2: jest.fn().mockReturnValue({
        tokeninfo: jest.fn().mockResolvedValue({})
      })
    };

    require('firebase-admin').firestore = jest.fn().mockReturnValue(mockFirestore);
    require('@google-cloud/kms').KeyManagementServiceClient = jest.fn().mockImplementation(() => mockKmsClient);

    // Initialize services
    authService = new AuthService();
    tokenEncryptionService = new TokenEncryptionService();
    securityMiddleware = new SecurityMiddleware();
    piiRedactionService = new PIIRedactionService();
  });

  describe('PKCE OAuth Flow', () => {
    test('should initiate OAuth with PKCE parameters', async () => {
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&code_challenge=xyz&code_challenge_method=S256';
      mockGoogleAuth.generateAuthUrl.mockReturnValue(mockAuthUrl);

      const result = await authService.beginOAuth({ userId: 'test-user' });

      expect(result.url).toBe(mockAuthUrl);
      expect(result.state).toBeDefined();
      expect(result.codeChallenge).toBeDefined();
      expect(result.auditId).toBeDefined();
      expect(result.auditId).toMatch(/^auth_\d+_[a-f0-9]{16}$/);

      // Verify PKCE parameters were used
      expect(mockGoogleAuth.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          code_challenge: result.codeChallenge,
          code_challenge_method: 'S256',
          state: result.state
        })
      );
    });

    test('should handle OAuth callback with PKCE validation and token encryption', async () => {
      // First initiate OAuth to get PKCE data
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize';
      mockGoogleAuth.generateAuthUrl.mockReturnValue(mockAuthUrl);
      
      const initResult = await authService.beginOAuth({ userId: 'test-user' });
      
      // Mock token exchange response
      const mockTokens = {
        access_token: 'mock_access_token_12345',
        refresh_token: 'mock_refresh_token_67890',
        expiry_date: Date.now() + 3600000,
        id_token: 'mock.id.token'
      };
      
      mockGoogleAuth.getToken.mockResolvedValue({ tokens: mockTokens });

      // Handle callback with valid PKCE parameters
      const callbackParams = {
        code: 'mock_auth_code',
        state: initResult.state,
        codeVerifier: 'mock_code_verifier'
      };

      const result = await authService.handleCallback(callbackParams, {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test'
      });

      expect(result.secureTokens).toBeDefined();
      expect(result.secureTokens.encryptedAccessToken).toBeDefined();
      expect(result.secureTokens.encryptedRefreshToken).toBeDefined();
      expect(result.secureTokens.tokenMetadata).toBeDefined();
      expect(result.secureTokens.tokenMetadata.auditId).toBeDefined();
      expect(result.userId).toBeDefined();
      expect(result.auditId).toBeDefined();

      // Verify tokens are encrypted (not plaintext)
      expect(result.secureTokens.encryptedAccessToken.encryptedData).not.toBe(mockTokens.access_token);
      expect(result.secureTokens.encryptedRefreshToken.encryptedData).not.toBe(mockTokens.refresh_token);
    });

    test('should fail OAuth callback with invalid state', async () => {
      const callbackParams = {
        code: 'mock_auth_code',
        state: 'invalid_state',
        codeVerifier: 'mock_code_verifier'
      };

      await expect(authService.handleCallback(callbackParams)).rejects.toThrow('Invalid or expired state parameter');
    });

    test('should fail OAuth callback with expired PKCE data', async () => {
      // Mock expired PKCE data by manipulating the internal store
      const authServiceInternal = authService as any;
      const expiredPKCEData = {
        codeVerifier: 'test_verifier',
        codeChallenge: 'test_challenge',
        codeChallengeMethod: 'S256',
        state: 'expired_state',
        createdAt: Date.now() - 1200000, // 20 minutes ago
        expiresAt: Date.now() - 600000   // 10 minutes ago (expired)
      };
      
      authServiceInternal.pkceStore.set('expired_state', expiredPKCEData);

      const callbackParams = {
        code: 'mock_auth_code',
        state: 'expired_state',
        codeVerifier: 'test_verifier'
      };

      await expect(authService.handleCallback(callbackParams)).rejects.toThrow('PKCE data expired');
    });
  });

  describe('Token Encryption Integration', () => {
    test('should encrypt and decrypt tokens correctly', async () => {
      const testToken = 'test_oauth_token_data';
      const testUserId = 'test-user-123';

      // Encrypt token
      const encryptResult = await tokenEncryptionService.encryptToken(testToken, testUserId, 'access_token');
      expect(encryptResult.success).toBe(true);
      expect(encryptResult.encryptedToken).toBeDefined();

      // Decrypt token
      const decryptResult = await tokenEncryptionService.decryptToken(
        encryptResult.encryptedToken!,
        testUserId
      );
      
      expect(decryptResult.success).toBe(true);
      expect(decryptResult.decryptedData).toBe(testToken);
    });

    test('should maintain audit trail for encryption operations', async () => {
      const testToken = 'test_oauth_token_data';
      const testUserId = 'test-user-123';

      const encryptResult = await tokenEncryptionService.encryptToken(testToken, testUserId);
      expect(encryptResult.auditId).toBeDefined();
      expect(encryptResult.encryptedToken!.auditId).toBe(encryptResult.auditId);

      const decryptResult = await tokenEncryptionService.decryptToken(encryptResult.encryptedToken!);
      expect(decryptResult.auditId).toBeDefined();
      expect(decryptResult.auditId).not.toBe(encryptResult.auditId);
    });
  });

  describe('Security Middleware Integration', () => {
    test('should apply security headers to responses', async () => {
      const mockRequest = new NextRequest('https://test.drivemind.ai/api/auth/drive/begin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 Test Browser'
        }
      });

      const mockResponse = NextResponse.json({ success: true });
      const securityContext = {
        requestId: 'test-req-123',
        nonce: 'test-nonce-456',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
        timestamp: new Date().toISOString()
      };

      const securedResponse = securityMiddleware.applySecurityHeaders(mockResponse, securityContext);

      // Verify HSTS header
      expect(securedResponse.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
      expect(securedResponse.headers.get('Strict-Transport-Security')).toContain('includeSubDomains');
      expect(securedResponse.headers.get('Strict-Transport-Security')).toContain('preload');

      // Verify CSP header
      expect(securedResponse.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(securedResponse.headers.get('Content-Security-Policy')).toContain(`'nonce-${securityContext.nonce}'`);

      // Verify additional security headers
      expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(securedResponse.headers.get('X-Frame-Options')).toBe('DENY');
      expect(securedResponse.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    test('should validate request security', async () => {
      const validRequest = new NextRequest('https://test.drivemind.ai/api/auth/drive/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '100',
          'user-agent': 'Mozilla/5.0 Test Browser'
        },
        body: JSON.stringify({ userId: 'test-user' })
      });

      const result = await securityMiddleware.handleRequest(validRequest);
      expect(result).toBeNull(); // null means continue processing
    });

    test('should reject requests with security violations', async () => {
      const maliciousRequest = new NextRequest('https://test.drivemind.ai/api/../../../etc/passwd', {
        method: 'GET',
        headers: {
          'user-agent': 'AttackBot/1.0'
        }
      });

      const result = await securityMiddleware.handleRequest(maliciousRequest);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(400);
    });
  });

  describe('PII Redaction Integration', () => {
    test('should redact PII from OAuth error messages', async () => {
      const errorText = 'OAuth failed for user john.doe@example.com with phone 555-123-4567';
      const userId = 'test-user';
      const consent = {
        userId,
        purposes: ['pii_redaction', 'ai_processing'],
        dataTypes: ['text'],
        hasConsent: true
      };

      const result = await piiRedactionService.redactPII(errorText, userId, consent);

      expect(result.success).toBe(true);
      expect(result.redactedText).not.toContain('john.doe@example.com');
      expect(result.redactedText).not.toContain('555-123-4567');
      expect(result.detectedPII.length).toBeGreaterThan(0);
    });

    test('should respect user consent for PII processing', async () => {
      const textWithPII = 'Contact support at support@example.com';
      const userId = 'test-user';
      const noConsent = {
        userId,
        purposes: ['other_purpose'],
        dataTypes: ['text'],
        hasConsent: false
      };

      const result = await piiRedactionService.redactPII(textWithPII, userId, noConsent);
      expect(result.success).toBe(false);
      expect(result.error).toContain('User consent required');
    });
  });

  describe('Full Authentication Workflow', () => {
    test('should complete secure end-to-end OAuth flow', async () => {
      // Step 1: Initiate OAuth with PKCE
      mockGoogleAuth.generateAuthUrl.mockReturnValue('https://accounts.google.com/oauth/authorize?client_id=test&code_challenge=xyz');
      
      const initResult = await authService.beginOAuth({ userId: 'e2e-test-user' });
      expect(initResult.url).toBeDefined();
      expect(initResult.state).toBeDefined();
      expect(initResult.codeChallenge).toBeDefined();

      // Step 2: Simulate OAuth callback with valid tokens
      const mockTokens = {
        access_token: 'e2e_access_token_12345',
        refresh_token: 'e2e_refresh_token_67890',
        expiry_date: Date.now() + 3600000,
        id_token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJlMmUtdGVzdC11c2VyIn0.signature'
      };
      
      mockGoogleAuth.getToken.mockResolvedValue({ tokens: mockTokens });
      
      const callbackResult = await authService.handleCallback({
        code: 'e2e_auth_code',
        state: initResult.state
      });
      
      expect(callbackResult.secureTokens).toBeDefined();
      expect(callbackResult.userId).toBeDefined();

      // Step 3: Sync encrypted tokens to storage
      mockFirestore.doc().set.mockResolvedValue({});
      
      const syncResult = await authService.syncTokens(
        { userId: callbackResult.userId },
        callbackResult.secureTokens
      );
      
      expect(syncResult.success).toBe(true);
      expect(syncResult.auditId).toBeDefined();

      // Verify encrypted tokens were stored (not plaintext)
      const setCall = mockFirestore.doc().set.mock.calls[0];
      const storedData = setCall[0];
      
      expect(storedData.encrypted_access_token).toBeDefined();
      expect(storedData.encrypted_refresh_token).toBeDefined();
      expect(storedData.encrypted_access_token.encryptedData).not.toBe(mockTokens.access_token);
      expect(storedData.encrypted_refresh_token.encryptedData).not.toBe(mockTokens.refresh_token);
    });

    test('should handle OAuth errors securely', async () => {
      const errorParams = {
        error: 'access_denied',
        state: 'valid-state'
      };

      await expect(authService.handleCallback(errorParams)).rejects.toThrow('OAuth error: access_denied');
    });

    test('should maintain security context throughout flow', async () => {
      const userContext = {
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Test Browser)',
        requestId: 'test-req-789'
      };

      // Initiate OAuth
      const initResult = await authService.beginOAuth({ userId: 'security-test-user' });

      // Mock successful token exchange
      mockGoogleAuth.getToken.mockResolvedValue({
        tokens: {
          access_token: 'secure_test_token',
          refresh_token: 'secure_refresh_token',
          expiry_date: Date.now() + 3600000
        }
      });

      // Handle callback with user context
      const callbackResult = await authService.handleCallback({
        code: 'secure_auth_code',
        state: initResult.state
      }, userContext);

      expect(callbackResult.secureTokens.tokenMetadata.auditId).toBeDefined();
      expect(callbackResult.auditId).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle KMS encryption failures gracefully', async () => {
      // Mock KMS failure
      mockKmsClient.generateDataKey.mockRejectedValue(new Error('KMS service unavailable'));

      const testToken = 'test_token_data';
      const testUserId = 'test-user';

      const result = await tokenEncryptionService.encryptToken(testToken, testUserId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('KMS service unavailable');
    });

    test('should handle database failures during token sync', async () => {
      // Mock database failure
      mockFirestore.doc().set.mockRejectedValue(new Error('Database connection failed'));

      const mockSecureTokens = {
        encryptedAccessToken: {
          encryptedData: 'encrypted_data',
          iv: 'test_iv',
          authTag: 'test_auth_tag',
          keyVersion: 'test_key_version',
          encryptedAt: new Date().toISOString(),
          userId: 'test-user',
          auditId: 'test_audit_id'
        },
        encryptedRefreshToken: {
          encryptedData: 'encrypted_refresh_data',
          iv: 'test_iv_refresh',
          authTag: 'test_auth_tag_refresh',
          keyVersion: 'test_key_version',
          encryptedAt: new Date().toISOString(),
          userId: 'test-user',
          auditId: 'test_audit_id_refresh'
        },
        tokenMetadata: {
          expiry_date: Date.now() + 3600000,
          scope: ['https://www.googleapis.com/auth/drive'],
          tokenType: 'Bearer' as const,
          issuedAt: new Date().toISOString(),
          auditId: 'test_metadata_audit_id'
        }
      };

      await expect(authService.syncTokens(
        { userId: 'test-user' },
        mockSecureTokens
      )).rejects.toThrow('Failed to sync encrypted tokens');
    });

    test('should validate user context boundaries', async () => {
      const userATokens = {
        encryptedAccessToken: {
          encryptedData: 'encrypted_data',
          iv: 'test_iv',
          authTag: 'test_auth_tag',
          keyVersion: 'test_key_version',
          encryptedAt: new Date().toISOString(),
          userId: 'user-a',
          auditId: 'test_audit_id'
        },
        encryptedRefreshToken: {
          encryptedData: 'encrypted_refresh_data',
          iv: 'test_iv_refresh',
          authTag: 'test_auth_tag_refresh',
          keyVersion: 'test_key_version',
          encryptedAt: new Date().toISOString(),
          userId: 'user-a',
          auditId: 'test_audit_id_refresh'
        },
        tokenMetadata: {
          expiry_date: Date.now() + 3600000,
          scope: ['https://www.googleapis.com/auth/drive'],
          tokenType: 'Bearer' as const,
          issuedAt: new Date().toISOString(),
          auditId: 'test_metadata_audit_id'
        }
      };

      // Try to sync user-a's tokens as user-b (should fail)
      await expect(authService.syncTokens(
        { userId: 'user-b' },
        userATokens
      )).rejects.toThrow('User context mismatch');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle concurrent OAuth initiations', async () => {
      mockGoogleAuth.generateAuthUrl.mockImplementation(
        () => `https://accounts.google.com/oauth/authorize?client_id=test&code_challenge=${Math.random()}`
      );

      const promises = Array(10).fill(0).map((_, i) => 
        authService.beginOAuth({ userId: `concurrent-user-${i}` })
      );

      const results = await Promise.all(promises);

      results.forEach((result, i) => {
        expect(result.url).toBeDefined();
        expect(result.state).toBeDefined();
        expect(result.codeChallenge).toBeDefined();
        expect(result.auditId).toBeDefined();
      });

      // Verify all states are unique
      const states = results.map(r => r.state);
      const uniqueStates = [...new Set(states)];
      expect(uniqueStates.length).toBe(states.length);
    });

    test('should process token encryption efficiently', async () => {
      const testTokens = Array(5).fill(0).map((_, i) => `test_token_${i}`);
      const testUserId = 'performance-test-user';

      const startTime = Date.now();
      const promises = testTokens.map(token => 
        tokenEncryptionService.encryptToken(token, testUserId)
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.encryptedToken).toBeDefined();
      });
    });
  });
});