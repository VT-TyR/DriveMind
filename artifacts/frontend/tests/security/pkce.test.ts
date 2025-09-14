/**
 * PKCE Security Tests
 * 
 * Comprehensive test suite for PKCE implementation covering
 * security scenarios, edge cases, and compliance validation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/test';
import {
  generatePKCEChallenge,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  storePKCEData,
  retrievePKCEData,
  clearPKCEData,
  validateState,
  completePKCEFlow,
  generatePKCEOAuthUrl,
  parseStateParameter,
  validateOAuthCallback
} from '../../src/lib/security/pkce';

// Mock sessionStorage
const mockSessionStorage = {
  store: new Map<string, string>(),
  getItem: jest.fn((key: string) => mockSessionStorage.store.get(key) || null),
  setItem: jest.fn((key: string, value: string) => mockSessionStorage.store.set(key, value)),
  removeItem: jest.fn((key: string) => mockSessionStorage.store.delete(key)),
  clear: jest.fn(() => mockSessionStorage.store.clear())
};

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage
});

// Mock crypto.getRandomValues
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: jest.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
    subtle: {
      digest: jest.fn((algorithm: string, data: ArrayBuffer) => {
        // Mock SHA-256 digest
        const mockHash = new ArrayBuffer(32);
        const view = new Uint8Array(mockHash);
        for (let i = 0; i < 32; i++) {
          view[i] = i;
        }
        return Promise.resolve(mockHash);
      })
    }
  }
});

describe('PKCE Security Implementation', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearPKCEData();
  });

  describe('Code Verifier Generation', () => {
    it('should generate secure random code verifier', () => {
      const verifier = generateCodeVerifier();
      
      // RFC 7636: code verifier must be 43-128 characters
      expect(verifier).toBeDefined();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      
      // Should contain only unreserved characters
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('should generate unique verifiers', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      
      expect(verifier1).not.toBe(verifier2);
    });

    it('should generate cryptographically secure verifiers', () => {
      const verifiers = new Set<string>();
      
      // Generate 100 verifiers and check for uniqueness
      for (let i = 0; i < 100; i++) {
        const verifier = generateCodeVerifier();
        expect(verifiers.has(verifier)).toBe(false);
        verifiers.add(verifier);
      }
    });
  });

  describe('Code Challenge Generation', () => {
    it('should generate SHA256 code challenge', async () => {
      const verifier = 'test-verifier-123';
      const challenge = await generateCodeChallenge(verifier);
      
      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBeGreaterThan(0);
      
      // Should be base64url encoded (no padding)
      expect(challenge).not.toContain('=');
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('should generate consistent challenge for same verifier', async () => {
      const verifier = 'test-verifier-123';
      const challenge1 = await generateCodeChallenge(verifier);
      const challenge2 = await generateCodeChallenge(verifier);
      
      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', async () => {
      const challenge1 = await generateCodeChallenge('verifier1');
      const challenge2 = await generateCodeChallenge('verifier2');
      
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('PKCE Challenge Generation', () => {
    it('should generate complete PKCE challenge', async () => {
      const challenge = await generatePKCEChallenge();
      
      expect(challenge).toBeDefined();
      expect(challenge.codeVerifier).toBeDefined();
      expect(challenge.codeChallenge).toBeDefined();
      expect(challenge.codeChallengeMethod).toBe('S256');
      
      // Verify challenge matches verifier
      const expectedChallenge = await generateCodeChallenge(challenge.codeVerifier);
      expect(challenge.codeChallenge).toBe(expectedChallenge);
    });

    it('should generate unique PKCE challenges', async () => {
      const challenge1 = await generatePKCEChallenge();
      const challenge2 = await generatePKCEChallenge();
      
      expect(challenge1.codeVerifier).not.toBe(challenge2.codeVerifier);
      expect(challenge1.codeChallenge).not.toBe(challenge2.codeChallenge);
    });
  });

  describe('State Parameter Generation', () => {
    it('should generate secure state parameter', () => {
      const state = generateState();
      
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThanOrEqual(32);
      expect(state).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('should include user ID when provided', () => {
      const userId = 'user123';
      const state = generateState(userId);
      
      expect(state).toContain(':');
      expect(state.endsWith(`:${userId}`)).toBe(true);
    });

    it('should generate unique states', () => {
      const state1 = generateState();
      const state2 = generateState();
      
      expect(state1).not.toBe(state2);
    });
  });

  describe('PKCE Data Storage', () => {
    it('should store PKCE data securely', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      expect(() => storePKCEData(data)).not.toThrow();
      expect(mockSessionStorage.setItem).toHaveBeenCalled();
    });

    it('should retrieve stored PKCE data', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      storePKCEData(data);
      const retrieved = retrievePKCEData();
      
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent data', () => {
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
    });

    it('should return null for expired data', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now() - (6 * 60 * 1000) // 6 minutes ago (expired)
      };
      
      storePKCEData(data);
      const retrieved = retrievePKCEData();
      
      expect(retrieved).toBeNull();
    });

    it('should clear stored PKCE data', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      storePKCEData(data);
      clearPKCEData();
      
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
    });
  });

  describe('State Validation', () => {
    it('should validate correct state parameter', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      storePKCEData(data);
      const isValid = validateState('test-state');
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid state parameter', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      storePKCEData(data);
      const isValid = validateState('wrong-state');
      
      expect(isValid).toBe(false);
    });

    it('should reject state when no data stored', () => {
      const isValid = validateState('any-state');
      
      expect(isValid).toBe(false);
    });
  });

  describe('PKCE Flow Completion', () => {
    it('should complete PKCE flow successfully', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      storePKCEData(data);
      const verifier = completePKCEFlow('test-state');
      
      expect(verifier).toBe('test-verifier');
      
      // Should clear stored data after completion
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
    });

    it('should return null for invalid state', () => {
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      storePKCEData(data);
      const verifier = completePKCEFlow('wrong-state');
      
      expect(verifier).toBeNull();
    });
  });

  describe('OAuth URL Generation', () => {
    it('should generate PKCE-enabled OAuth URL', async () => {
      const params = {
        clientId: 'test-client-id',
        redirectUri: 'https://example.com/callback',
        scope: ['scope1', 'scope2'],
        userId: 'user123'
      };
      
      const url = await generatePKCEOAuthUrl(params);
      
      expect(url).toBeDefined();
      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('state=');
      expect(url).toContain(`client_id=${params.clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(params.redirectUri)}`);
      expect(url).toContain(`scope=${encodeURIComponent(params.scope.join(' '))}`);
    });

    it('should store PKCE data when generating URL', async () => {
      const params = {
        clientId: 'test-client-id',
        redirectUri: 'https://example.com/callback',
        scope: ['scope1'],
      };
      
      await generatePKCEOAuthUrl(params);
      
      const storedData = retrievePKCEData();
      expect(storedData).toBeDefined();
      expect(storedData?.codeVerifier).toBeDefined();
      expect(storedData?.state).toBeDefined();
    });
  });

  describe('State Parameter Parsing', () => {
    it('should parse state without user ID', () => {
      const state = 'random-state-123';
      const parsed = parseStateParameter(state);
      
      expect(parsed.state).toBe(state);
      expect(parsed.userId).toBeUndefined();
    });

    it('should parse state with user ID', () => {
      const state = 'random-state-123:user456';
      const parsed = parseStateParameter(state);
      
      expect(parsed.state).toBe('random-state-123');
      expect(parsed.userId).toBe('user456');
    });

    it('should handle complex user IDs', () => {
      const state = 'random-state:user@example.com';
      const parsed = parseStateParameter(state);
      
      expect(parsed.state).toBe('random-state');
      expect(parsed.userId).toBe('user@example.com');
    });
  });

  describe('OAuth Callback Validation', () => {
    beforeEach(() => {
      // Set up valid PKCE data for callback tests
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      storePKCEData(data);
    });

    it('should validate successful OAuth callback', () => {
      const result = validateOAuthCallback('auth-code-123', 'test-state');
      
      expect(result.isValid).toBe(true);
      expect(result.codeVerifier).toBe('test-verifier');
      expect(result.errors).toHaveLength(0);
    });

    it('should reject callback with OAuth error', () => {
      const result = validateOAuthCallback('', 'test-state', 'access_denied');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('OAuth error: access_denied');
    });

    it('should reject callback without authorization code', () => {
      const result = validateOAuthCallback('', 'test-state');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing authorization code');
    });

    it('should reject callback without state parameter', () => {
      const result = validateOAuthCallback('auth-code-123', '');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing state parameter');
    });

    it('should reject callback with invalid state', () => {
      const result = validateOAuthCallback('auth-code-123', 'wrong-state');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid state parameter');
    });

    it('should parse user ID from state', () => {
      const dataWithUser = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      clearPKCEData();
      storePKCEData(dataWithUser);
      
      const result = validateOAuthCallback('auth-code-123', 'test-state:user123');
      
      expect(result.isValid).toBe(true);
      expect(result.userId).toBe('user123');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle corrupted session storage data', () => {
      mockSessionStorage.setItem('drivemind_pkce', 'invalid-base64');
      
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
    });

    it('should handle malformed stored data', () => {
      const corruptedData = btoa('{"invalid": "json"');
      mockSessionStorage.setItem('drivemind_pkce', corruptedData);
      
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
    });

    it('should validate data structure integrity', () => {
      const incompleteData = btoa(JSON.stringify({
        codeVerifier: 'test',
        // Missing state and timestamp
      }));
      mockSessionStorage.setItem('drivemind_pkce', incompleteData);
      
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
    });

    it('should handle storage quota exceeded', () => {
      mockSessionStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      
      const data = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now()
      };
      
      expect(() => storePKCEData(data)).toThrow('Failed to store authentication state');
    });

    it('should prevent replay attacks with expired timestamps', () => {
      const oldData = {
        codeVerifier: 'test-verifier',
        state: 'test-state',
        timestamp: Date.now() - (10 * 60 * 1000) // 10 minutes ago
      };
      
      storePKCEData(oldData);
      
      // Should return null for expired data
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
      
      // Should reject validation
      const isValid = validateState('test-state');
      expect(isValid).toBe(false);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should clean up expired data automatically', () => {
      const expiredData = {
        codeVerifier: 'expired-verifier',
        state: 'expired-state',
        timestamp: Date.now() - (10 * 60 * 1000)
      };
      
      storePKCEData(expiredData);
      
      // Accessing expired data should trigger cleanup
      const retrieved = retrievePKCEData();
      expect(retrieved).toBeNull();
      
      // Storage should be cleared
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('drivemind_pkce');
    });

    it('should handle concurrent PKCE flows', async () => {
      const promises = Array(10).fill(null).map(() => generatePKCEChallenge());
      const challenges = await Promise.all(promises);
      
      // All challenges should be unique
      const verifiers = challenges.map(c => c.codeVerifier);
      const uniqueVerifiers = new Set(verifiers);
      expect(uniqueVerifiers.size).toBe(10);
      
      const challengeHashes = challenges.map(c => c.codeChallenge);
      const uniqueChallenges = new Set(challengeHashes);
      expect(uniqueChallenges.size).toBe(10);
    });
  });
});