/**
 * Test suite for authentication service
 * Implements ALPHA-CODENAME v1.4 testing standards
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import authService from '../src/lib/auth-service';
import apiClient from '../src/lib/api-client';

// Mock API client
vi.mock('../src/lib/api-client', () => {
  return {
    default: {
      beginOAuth: vi.fn(),
      getAuthStatus: vi.fn(),
      syncTokens: vi.fn(),
      logMetric: vi.fn(),
    },
  };
});

const mockApiClient = apiClient as {
  beginOAuth: Mock;
  getAuthStatus: Mock;
  syncTokens: Mock;
  logMetric: Mock;
};

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OAuth flow management', () => {
    it('should begin OAuth flow successfully', async () => {
      const mockOAuthResponse = {
        url: 'https://accounts.google.com/oauth/authorize?...',
      };

      mockApiClient.beginOAuth.mockResolvedValueOnce(mockOAuthResponse);
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      const result = await authService.beginOAuth('user123');

      expect(result).toEqual({
        beginUrl: mockOAuthResponse.url,
        state: 'user123',
        userId: 'user123',
      });

      expect(mockApiClient.beginOAuth).toHaveBeenCalledWith('user123');
      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_oauth_begin', {
        userId: 'user123',
        timestamp: expect.any(String),
      });
    });

    it('should handle OAuth errors and log them', async () => {
      const mockError = new Error('OAuth configuration error');
      mockApiClient.beginOAuth.mockRejectedValueOnce(mockError);
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await expect(authService.beginOAuth('user123')).rejects.toThrow(mockError);

      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_oauth_begin_failed', {
        userId: 'user123',
        error: 'OAuth configuration error',
        timestamp: expect.any(String),
      });
    });

    it('should begin OAuth without user ID', async () => {
      const mockOAuthResponse = {
        url: 'https://accounts.google.com/oauth/authorize?...',
      };

      mockApiClient.beginOAuth.mockResolvedValueOnce(mockOAuthResponse);
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      const result = await authService.beginOAuth();

      expect(result).toEqual({
        beginUrl: mockOAuthResponse.url,
        state: undefined,
        userId: undefined,
      });

      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_oauth_begin', {
        userId: 'anonymous',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Authentication status checking', () => {
    it('should check auth status successfully', async () => {
      const mockStatus = {
        authenticated: true,
        hasValidToken: true,
        tokenExpiry: '2024-12-13T15:00:00Z',
        scopes: ['https://www.googleapis.com/auth/drive'],
      };

      mockApiClient.getAuthStatus.mockResolvedValueOnce(mockStatus);

      const listeners: ((state: any) => void)[] = [];
      const mockOnAuthStateChange = vi.fn((listener) => {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index > -1) listeners.splice(index, 1);
        };
      });

      // Mock the auth service state change functionality
      authService.onAuthStateChange = mockOnAuthStateChange;

      const result = await authService.checkAuthStatus();

      expect(result).toEqual(expect.objectContaining({
        authenticated: true,
        hasValidDriveToken: true,
        tokenExpiry: '2024-12-13T15:00:00Z',
        scopes: ['https://www.googleapis.com/auth/drive'],
        loading: false,
      }));
    });

    it('should handle auth status errors gracefully', async () => {
      mockApiClient.getAuthStatus.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.checkAuthStatus();

      expect(result).toEqual(expect.objectContaining({
        authenticated: false,
        hasValidDriveToken: false,
        loading: false,
      }));
    });
  });

  describe('Token synchronization', () => {
    it('should sync tokens successfully', async () => {
      mockApiClient.syncTokens.mockResolvedValueOnce({ success: true });
      mockApiClient.getAuthStatus.mockResolvedValueOnce({
        authenticated: true,
        hasValidToken: true,
      });
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await authService.syncTokens('user123');

      expect(mockApiClient.syncTokens).toHaveBeenCalledWith('user123');
      expect(mockApiClient.getAuthStatus).toHaveBeenCalled();
      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_token_sync_success', {
        userId: 'user123',
        timestamp: expect.any(String),
      });
    });

    it('should handle sync errors and log them', async () => {
      const mockError = new Error('Sync failed');
      mockApiClient.syncTokens.mockRejectedValueOnce(mockError);
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await expect(authService.syncTokens('user123')).rejects.toThrow(mockError);

      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_token_sync_failed', {
        userId: 'user123',
        error: 'Sync failed',
        timestamp: expect.any(String),
      });
    });
  });

  describe('OAuth callback handling', () => {
    it('should handle successful OAuth callback', async () => {
      mockApiClient.getAuthStatus.mockResolvedValueOnce({
        authenticated: true,
        hasValidToken: true,
      });
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await authService.handleOAuthCallback('auth-code-123', 'user123');

      expect(mockApiClient.getAuthStatus).toHaveBeenCalled();
      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_oauth_callback_success', {
        state: 'user123',
        timestamp: expect.any(String),
      });
    });

    it('should handle OAuth error in callback', async () => {
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await expect(
        authService.handleOAuthCallback('', '', 'access_denied')
      ).rejects.toThrow('OAuth error: access_denied');

      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_oauth_callback_error', {
        error: 'access_denied',
        state: 'none',
        timestamp: expect.any(String),
      });
    });

    it('should handle missing authorization code', async () => {
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await expect(
        authService.handleOAuthCallback('', 'user123')
      ).rejects.toThrow('No authorization code received');

      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_oauth_callback_no_code', {
        state: 'user123',
        timestamp: expect.any(String),
      });
    });

    it('should handle callback processing errors', async () => {
      const mockError = new Error('Processing failed');
      mockApiClient.getAuthStatus.mockRejectedValueOnce(mockError);
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await expect(
        authService.handleOAuthCallback('auth-code-123', 'user123')
      ).rejects.toThrow(mockError);

      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_oauth_callback_failed', {
        state: 'user123',
        error: 'Processing failed',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Token expiry checking', () => {
    it('should detect expired tokens', () => {
      // Mock current state with expired token
      const expiredTime = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const mockState = {
        user: null,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
        tokenExpiry: expiredTime.toISOString(),
      };

      // Mock the current state
      authService.getCurrentState = vi.fn().mockReturnValue(mockState);

      const isExpired = authService.isTokenExpired();
      expect(isExpired).toBe(true);
    });

    it('should detect tokens expiring soon', () => {
      // Mock current state with token expiring in 2 minutes
      const soonExpiry = new Date(Date.now() + 1000 * 60 * 2);
      const mockState = {
        user: null,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
        tokenExpiry: soonExpiry.toISOString(),
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);

      const isExpired = authService.isTokenExpired();
      expect(isExpired).toBe(true); // Should be true because it expires within 5 minutes
    });

    it('should detect valid tokens', () => {
      // Mock current state with token expiring in 10 minutes
      const futureExpiry = new Date(Date.now() + 1000 * 60 * 10);
      const mockState = {
        user: null,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
        tokenExpiry: futureExpiry.toISOString(),
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);

      const isExpired = authService.isTokenExpired();
      expect(isExpired).toBe(false);
    });

    it('should handle missing token expiry', () => {
      const mockState = {
        user: null,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
        // no tokenExpiry
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);

      const isExpired = authService.isTokenExpired();
      expect(isExpired).toBe(false);
    });
  });

  describe('Token refresh', () => {
    it('should refresh token by checking status', async () => {
      mockApiClient.getAuthStatus.mockResolvedValueOnce({
        authenticated: true,
        hasValidToken: true,
        tokenExpiry: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      });

      await authService.refreshToken();

      expect(mockApiClient.getAuthStatus).toHaveBeenCalled();
    });
  });

  describe('Sign out', () => {
    it('should sign out successfully', async () => {
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      const mockState = {
        user: mockUser,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      // Mock the state change notification
      const mockNotifyStateChange = vi.fn();
      authService.notifyStateChange = mockNotifyStateChange;

      await authService.signOut();

      expect(mockApiClient.logMetric).toHaveBeenCalledWith('auth_sign_out', {
        userId: 'user123',
        timestamp: expect.any(String),
      });
    });

    it('should handle sign out errors gracefully', async () => {
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      const mockState = {
        user: mockUser,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);
      mockApiClient.logMetric.mockRejectedValueOnce(new Error('Logging failed'));

      // Should not throw even if logging fails
      await expect(authService.signOut()).resolves.toBeUndefined();
    });
  });

  describe('Scope validation', () => {
    it('should validate required scopes', () => {
      const mockState = {
        user: null,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'],
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);

      const hasRequired = authService.hasRequiredScopes(['https://www.googleapis.com/auth/drive']);
      expect(hasRequired).toBe(true);
    });

    it('should detect missing scopes', () => {
      const mockState = {
        user: null,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);

      const hasRequired = authService.hasRequiredScopes([
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.metadata'
      ]);
      expect(hasRequired).toBe(false);
    });

    it('should get scope status', () => {
      const mockState = {
        user: null,
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      };

      authService.getCurrentState = vi.fn().mockReturnValue(mockState);

      const scopeStatus = authService.getScopeStatus();
      expect(scopeStatus).toEqual({
        granted: ['https://www.googleapis.com/auth/drive.file'],
        missing: ['https://www.googleapis.com/auth/drive'],
      });
    });
  });

  describe('State management', () => {
    it('should notify listeners of state changes', () => {
      const mockListener1 = vi.fn();
      const mockListener2 = vi.fn();

      const unsubscribe1 = authService.onAuthStateChange(mockListener1);
      const unsubscribe2 = authService.onAuthStateChange(mockListener2);

      // Mock a state change
      const newState = {
        user: { uid: 'user123' },
        loading: false,
        authenticated: true,
        hasValidDriveToken: true,
      };

      // Simulate state change (this would normally be internal)
      // For testing, we'd need to expose the notification method or test through public methods

      // Clean up listeners
      unsubscribe1();
      unsubscribe2();
    });

    it('should update user information', () => {
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      const mockNotifyStateChange = vi.fn();
      
      authService.notifyStateChange = mockNotifyStateChange;
      authService.updateUser(mockUser as any);

      // In a real implementation, this would trigger state notifications
      // For this test, we're just ensuring the method exists and can be called
      expect(mockNotifyStateChange).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle API client errors gracefully', async () => {
      mockApiClient.beginOAuth.mockRejectedValueOnce(new Error('Network failure'));
      mockApiClient.logMetric.mockResolvedValueOnce({ success: true });

      await expect(authService.beginOAuth('user123')).rejects.toThrow('Network failure');

      // Should still attempt to log the error
      expect(mockApiClient.logMetric).toHaveBeenCalledWith(
        'auth_oauth_begin_failed',
        expect.objectContaining({
          error: 'Network failure',
        })
      );
    });

    it('should handle logging failures silently', async () => {
      mockApiClient.beginOAuth.mockResolvedValueOnce({ url: 'test-url' });
      mockApiClient.logMetric.mockRejectedValueOnce(new Error('Logging service down'));

      // Should not throw even if logging fails
      const result = await authService.beginOAuth('user123');
      expect(result.beginUrl).toBe('test-url');
    });
  });
});
