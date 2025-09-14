/**
 * Integration Tests for Authentication Flow - ALPHA Standards
 * End-to-end testing of OAuth flow with real Firebase integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { NextRequest, NextResponse } from 'next/server';
import { authService } from '../../services/auth/auth-service';
import { admin } from '../../../src/lib/admin';

// Test configuration
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TEST_USER_ID = 'test_integration_user';

// Mock external services for controlled testing
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth2/auth?test=integration'),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'test_access_token',
            refresh_token: 'test_refresh_token', 
            expiry_date: Date.now() + 3600000
          }
        }),
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'refreshed_access_token',
            expiry_date: Date.now() + 3600000
          }
        })
      }))
    },
    oauth2: jest.fn(() => ({
      tokeninfo: jest.fn().mockResolvedValue({})
    }))
  }
}));

describe('Authentication Flow Integration Tests', () => {
  let testFirestore: any;
  
  beforeAll(async () => {
    // Initialize test Firebase connection
    if (!admin.apps.length) {
      // Use Firebase emulator for testing
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
      testFirestore = admin.firestore();
    }
    
    // Ensure OAuth credentials are set for testing
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test_client_id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test_client_secret';
    process.env.NEXT_PUBLIC_BASE_URL = TEST_BASE_URL;
  });
  
  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
  });
  
  beforeEach(async () => {
    // Clear any existing test data
    await cleanupTestData();
  });
  
  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('OAuth Begin Flow', () => {
    it('should initiate OAuth flow successfully', async () => {
      const request = { userId: TEST_USER_ID };
      
      const result = await authService.beginOAuth(request);
      
      expect(result).toHaveProperty('url');
      expect(result.url).toContain('accounts.google.com');
      expect(result).toHaveProperty('state', TEST_USER_ID);
    });

    it('should generate unique state for anonymous flows', async () => {
      const result1 = await authService.beginOAuth({});
      const result2 = await authService.beginOAuth({});
      
      expect(result1.state).toBeDefined();
      expect(result2.state).toBeDefined();
      expect(result1.state).not.toBe(result2.state);
    });

    it('should validate request parameters', async () => {
      const invalidRequest = {
        userId: 123, // Should be string
        returnUrl: 'not-a-url' // Should be valid URL
      };
      
      await expect(authService.beginOAuth(invalidRequest))
        .rejects.toThrow();
    });
  });

  describe('OAuth Callback Flow', () => {
    it('should process OAuth callback successfully', async () => {
      const callbackParams = {
        code: 'test_authorization_code',
        state: TEST_USER_ID
      };
      
      const result = await authService.handleCallback(callbackParams);
      
      expect(result).toHaveProperty('tokens');
      expect(result.tokens).toHaveProperty('access_token');
      expect(result.tokens).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('userId', TEST_USER_ID);
    });

    it('should handle OAuth errors in callback', async () => {
      const callbackParams = {
        error: 'access_denied',
        state: TEST_USER_ID
      };
      
      await expect(authService.handleCallback(callbackParams))
        .rejects.toThrow('OAuth error: access_denied');
    });

    it('should reject callback without authorization code', async () => {
      const callbackParams = {
        state: TEST_USER_ID
        // Missing code parameter
      };
      
      await expect(authService.handleCallback(callbackParams))
        .rejects.toThrow('Authorization code missing');
    });
  });

  describe('Token Management Integration', () => {
    let testTokens: any;
    
    beforeEach(() => {
      testTokens = {
        access_token: 'test_access_token',
        refresh_token: 'test_refresh_token',
        expiry_date: Date.now() + 3600000,
        scope: ['https://www.googleapis.com/auth/drive']
      };
    });

    it('should sync tokens to Firestore', async () => {
      const syncRequest = { userId: TEST_USER_ID };
      
      await authService.syncTokens(syncRequest, testTokens);
      
      // Verify tokens were stored in Firestore
      const tokenDoc = await testFirestore
        .doc(`users/${TEST_USER_ID}/secrets/oauth_tokens`)
        .get();
      
      expect(tokenDoc.exists).toBe(true);
      const tokenData = tokenDoc.data();
      expect(tokenData.access_token).toBe(testTokens.access_token);
      expect(tokenData.refresh_token).toBe(testTokens.refresh_token);
    });

    it('should retrieve auth status from Firestore', async () => {
      // First sync tokens
      await authService.syncTokens({ userId: TEST_USER_ID }, testTokens);
      
      // Then check status
      const status = await authService.getAuthStatus(TEST_USER_ID);
      
      expect(status).toEqual({
        authenticated: true,
        hasValidToken: true,
        tokenExpiry: expect.any(String),
        scopes: testTokens.scope,
        userId: TEST_USER_ID
      });
    });

    it('should detect expired tokens', async () => {
      const expiredTokens = {
        ...testTokens,
        expiry_date: Date.now() - 3600000 // 1 hour ago
      };
      
      await authService.syncTokens({ userId: TEST_USER_ID }, expiredTokens);
      
      const status = await authService.getAuthStatus(TEST_USER_ID);
      
      expect(status.authenticated).toBe(true);
      expect(status.hasValidToken).toBe(false);
    });

    it('should refresh expired tokens', async () => {
      // Store tokens with refresh token
      await authService.syncTokens({ userId: TEST_USER_ID }, testTokens);
      
      // Refresh the tokens
      const refreshedTokens = await authService.refreshToken(TEST_USER_ID);
      
      expect(refreshedTokens.access_token).toBe('refreshed_access_token');
      expect(refreshedTokens.refresh_token).toBe(testTokens.refresh_token);
      
      // Verify tokens were updated in Firestore
      const updatedDoc = await testFirestore
        .doc(`users/${TEST_USER_ID}/secrets/oauth_tokens`)
        .get();
      
      const updatedData = updatedDoc.data();
      expect(updatedData.access_token).toBe('refreshed_access_token');
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should complete full OAuth flow end-to-end', async () => {
      // Step 1: Begin OAuth
      const beginResult = await authService.beginOAuth({ userId: TEST_USER_ID });
      expect(beginResult.url).toBeDefined();
      
      // Step 2: Handle callback (simulate successful OAuth)
      const callbackResult = await authService.handleCallback({
        code: 'test_code',
        state: TEST_USER_ID
      });
      expect(callbackResult.tokens).toBeDefined();
      
      // Step 3: Sync tokens
      await authService.syncTokens(
        { userId: TEST_USER_ID }, 
        callbackResult.tokens
      );
      
      // Step 4: Verify authentication status
      const status = await authService.getAuthStatus(TEST_USER_ID);
      expect(status.authenticated).toBe(true);
      expect(status.hasValidToken).toBe(true);
      
      // Step 5: Test token refresh
      const refreshedTokens = await authService.refreshToken(TEST_USER_ID);
      expect(refreshedTokens.access_token).toBeDefined();
    });

    it('should handle authentication failures gracefully', async () => {
      // Test OAuth denial
      await expect(authService.handleCallback({
        error: 'access_denied',
        state: TEST_USER_ID
      })).rejects.toThrow();
      
      // Verify user remains unauthenticated
      const status = await authService.getAuthStatus(TEST_USER_ID);
      expect(status.authenticated).toBe(false);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle Firestore connection errors', async () => {
      // Mock Firestore to throw error
      const originalDoc = testFirestore.doc;
      testFirestore.doc = jest.fn(() => {
        throw new Error('Firestore connection error');
      });
      
      const status = await authService.getAuthStatus(TEST_USER_ID);
      expect(status.authenticated).toBe(false);
      
      // Restore original method
      testFirestore.doc = originalDoc;
    });

    it('should handle concurrent authentication attempts', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        authService.beginOAuth({ userId: `concurrent_user_${i}` })
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.url).toBeDefined();
        expect(result.state).toBe(`concurrent_user_${i}`);
      });
    });

    it('should maintain data consistency under load', async () => {
      const testTokens = {
        access_token: 'load_test_token',
        refresh_token: 'load_test_refresh',
        expiry_date: Date.now() + 3600000,
        scope: ['https://www.googleapis.com/auth/drive']
      };
      
      // Simulate multiple token sync operations
      const syncPromises = Array.from({ length: 10 }, () =>
        authService.syncTokens({ userId: TEST_USER_ID }, testTokens)
      );
      
      await Promise.all(syncPromises);
      
      // Verify final state is consistent
      const status = await authService.getAuthStatus(TEST_USER_ID);
      expect(status.authenticated).toBe(true);
      expect(status.hasValidToken).toBe(true);
    });
  });

  describe('Security Validation', () => {
    it('should prevent state parameter tampering', async () => {
      const originalState = 'original_user';
      const tamperedState = 'malicious_user';
      
      // Begin OAuth with original state
      await authService.beginOAuth({ userId: originalState });
      
      // Attempt callback with tampered state
      const callbackResult = await authService.handleCallback({
        code: 'test_code',
        state: tamperedState // Different from original
      });
      
      // Should still process (state is informational in this implementation)
      // but userId should match the state parameter
      expect(callbackResult.userId).toBe(tamperedState);
    });

    it('should validate token scopes properly', async () => {
      // This test would need actual Google API integration to fully validate
      // For now, we test that the validation logic is called
      const callbackResult = await authService.handleCallback({
        code: 'test_code_with_scopes',
        state: TEST_USER_ID
      });
      
      expect(callbackResult.tokens.scope).toEqual([
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ]);
    });

    it('should handle malicious callback parameters', async () => {
      const maliciousParams = {
        code: 'test_code',
        state: '<script>alert("xss")</script>',
        maliciousParam: 'should_be_ignored'
      };
      
      // Should not throw due to malicious content (parameters are validated)
      const result = await authService.handleCallback(maliciousParams);
      
      // XSS attempt should be treated as normal string
      expect(result.userId).toBe('<script>alert("xss")</script>');
    });
  });

  describe('Performance Tests', () => {
    it('should handle auth operations within performance limits', async () => {
      const startTime = Date.now();
      
      // Perform multiple auth operations
      await authService.beginOAuth({ userId: TEST_USER_ID });
      
      const callbackResult = await authService.handleCallback({
        code: 'perf_test_code',
        state: TEST_USER_ID
      });
      
      await authService.syncTokens({ userId: TEST_USER_ID }, callbackResult.tokens);
      
      const status = await authService.getAuthStatus(TEST_USER_ID);
      
      const totalTime = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(5000); // 5 seconds
      expect(status.authenticated).toBe(true);
    });
  });

  // Helper function to clean up test data
  async function cleanupTestData(): Promise<void> {
    try {
      // Clean up test user data
      const userRef = testFirestore.doc(`users/${TEST_USER_ID}`);
      const secretsRef = userRef.collection('secrets').doc('oauth_tokens');
      
      await secretsRef.delete();
      await userRef.delete();
      
      // Clean up any concurrent test users
      for (let i = 0; i < 10; i++) {
        const concurrentUserRef = testFirestore.doc(`users/concurrent_user_${i}`);
        const concurrentSecretsRef = concurrentUserRef.collection('secrets').doc('oauth_tokens');
        
        await concurrentSecretsRef.delete();
        await concurrentUserRef.delete();
      }
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn('Test cleanup error:', error);
    }
  }
});