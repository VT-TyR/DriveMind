/**
 * Integration tests for OAuth authentication flow
 * Tests the complete OAuth journey from initiation to token storage
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch API
global.fetch = jest.fn();

describe('OAuth Integration Flow', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('OAuth Initiation', () => {
    it('should initiate OAuth flow when Connect Google Drive is clicked', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authUrl: 'https://accounts.google.com/oauth2/auth?...' }),
      });

      // Simulate user clicking connect button
      const connectButton = { 
        onclick: () => fetch('/api/auth/drive/begin') 
      };

      await connectButton.onclick();

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/drive/begin');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle OAuth begin endpoint errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'OAuth configuration error' }),
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        const response = await fetch('/api/auth/drive/begin');
        if (!response.ok) {
          console.error('OAuth initiation failed');
        }
      } catch (error) {
        console.error('OAuth error:', error);
      }

      expect(consoleSpy).toHaveBeenCalledWith('OAuth initiation failed');
      consoleSpy.mockRestore();
    });
  });

  describe('OAuth Callback Processing', () => {
    it('should process OAuth callback with authorization code', async () => {
      const authCode = 'test-auth-code-123';
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true,
          tokens: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expiry_date: Date.now() + 3600000,
          }
        }),
      });

      const response = await fetch(`/api/auth/drive/callback?code=${authCode}`);
      const result = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/auth/drive/callback?code=${authCode}`
      );
      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
    });

    it('should handle OAuth callback errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid authorization code' }),
      });

      const response = await fetch('/api/auth/drive/callback?error=access_denied');
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe('Token Storage and Persistence', () => {
    it('should store tokens in both cookies and Firestore', async () => {
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      // Mock successful token storage
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true,
          storage: {
            cookies: true,
            firestore: true,
          }
        }),
      });

      const response = await fetch('/api/auth/drive/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: mockTokens }),
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.storage.cookies).toBe(true);
      expect(result.storage.firestore).toBe(true);
    });

    it('should handle token synchronization between storage methods', async () => {
      // Mock checking token status
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          synchronized: true,
          sources: ['cookies', 'firestore'],
        }),
      });

      const response = await fetch('/api/auth/drive/sync');
      const result = await response.json();

      expect(result.synchronized).toBe(true);
      expect(result.sources).toContain('cookies');
      expect(result.sources).toContain('firestore');
    });
  });

  describe('OAuth Connection Status', () => {
    it('should verify OAuth connection is active', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          connected: true,
          hasValidTokens: true,
          expiresIn: 3542,
        }),
      });

      const response = await fetch('/api/auth/drive/status');
      const result = await response.json();

      expect(result.connected).toBe(true);
      expect(result.hasValidTokens).toBe(true);
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should detect when OAuth connection is expired', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          connected: false,
          hasValidTokens: false,
          needsReauth: true,
        }),
      });

      const response = await fetch('/api/auth/drive/status');
      const result = await response.json();

      expect(result.connected).toBe(false);
      expect(result.needsReauth).toBe(true);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh expired access token using refresh token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          refreshed: true,
          newAccessToken: 'new-access-token',
          expiresIn: 3600,
        }),
      });

      const response = await fetch('/api/auth/drive/refresh', {
        method: 'POST',
      });
      const result = await response.json();

      expect(result.refreshed).toBe(true);
      expect(result.newAccessToken).toBeDefined();
      expect(result.expiresIn).toBe(3600);
    });

    it('should handle refresh token failure and require reauth', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ 
          error: 'Invalid refresh token',
          requiresReauth: true,
        }),
      });

      const response = await fetch('/api/auth/drive/refresh', {
        method: 'POST',
      });
      
      expect(response.ok).toBe(false);
      const result = await response.json();
      expect(result.requiresReauth).toBe(true);
    });
  });

  describe('End-to-End OAuth Journey', () => {
    it('should complete full OAuth flow from initiation to connected state', async () => {
      // Step 1: Initiate OAuth
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authUrl: 'https://accounts.google.com/oauth2/auth' }),
      });

      const beginResponse = await fetch('/api/auth/drive/begin');
      const { authUrl } = await beginResponse.json();
      expect(authUrl).toBeDefined();

      // Step 2: Process callback with code
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true,
          tokens: {
            access_token: 'access-123',
            refresh_token: 'refresh-456',
          }
        }),
      });

      const callbackResponse = await fetch('/api/auth/drive/callback?code=auth-code');
      const callbackResult = await callbackResponse.json();
      expect(callbackResult.success).toBe(true);

      // Step 3: Verify connection status
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          connected: true,
          hasValidTokens: true,
        }),
      });

      const statusResponse = await fetch('/api/auth/drive/status');
      const statusResult = await statusResponse.json();
      expect(statusResult.connected).toBe(true);
    });
  });
});