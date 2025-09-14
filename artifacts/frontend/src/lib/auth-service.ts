/**
 * Authentication service with OAuth 2.0 flow management
 * Implements ALPHA-CODENAME v1.4 security standards
 */

import { User } from 'firebase/auth';
import apiClient from './api-client';
import { AuthenticationError } from './error-handler';

export interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
  hasValidDriveToken: boolean;
  tokenExpiry?: string;
  scopes?: string[];
}

export interface OAuthFlow {
  beginUrl: string;
  state?: string;
  userId?: string;
}

class AuthService {
  private authStateListeners: Set<(state: AuthState) => void> = new Set();
  private currentAuthState: AuthState = {
    user: null,
    loading: true,
    authenticated: false,
    hasValidDriveToken: false,
  };

  // Subscribe to auth state changes
  onAuthStateChange(listener: (state: AuthState) => void): () => void {
    this.authStateListeners.add(listener);
    return () => this.authStateListeners.delete(listener);
  }

  // Notify listeners of state changes
  private notifyStateChange(newState: Partial<AuthState>) {
    this.currentAuthState = { ...this.currentAuthState, ...newState };
    this.authStateListeners.forEach(listener => listener(this.currentAuthState));
  }

  // Get current auth state
  getCurrentState(): AuthState {
    return { ...this.currentAuthState };
  }

  // Initialize OAuth flow
  async beginOAuth(userId?: string): Promise<OAuthFlow> {
    try {
      const response = await apiClient.beginOAuth(userId);
      
      // Log OAuth initiation for analytics
      await this.logAuthEvent('oauth_begin', {
        userId: userId || 'anonymous',
        timestamp: new Date().toISOString(),
      }).catch(() => {}); // Don't let logging errors break auth flow

      return {
        beginUrl: response.url,
        state: userId,
        userId,
      };
    } catch (error) {
      await this.logAuthEvent('oauth_begin_failed', {
        userId: userId || 'anonymous',
        error: error instanceof Error ? error.message : 'unknown',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      
      throw error;
    }
  }

  // Check authentication status
  async checkAuthStatus(): Promise<AuthState> {
    try {
      this.notifyStateChange({ loading: true });
      
      const status = await apiClient.getAuthStatus();
      
      const newState: Partial<AuthState> = {
        authenticated: status.authenticated,
        hasValidDriveToken: status.hasValidToken,
        tokenExpiry: status.tokenExpiry,
        scopes: status.scopes,
        loading: false,
      };
      
      this.notifyStateChange(newState);
      return this.getCurrentState();
    } catch (error) {
      const newState: Partial<AuthState> = {
        authenticated: false,
        hasValidDriveToken: false,
        loading: false,
      };
      
      this.notifyStateChange(newState);
      return this.getCurrentState();
    }
  }

  // Sync tokens to persistent storage
  async syncTokens(userId: string): Promise<void> {
    try {
      await apiClient.syncTokens(userId);
      
      // Refresh auth status after sync
      await this.checkAuthStatus();
      
      await this.logAuthEvent('token_sync_success', {
        userId,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    } catch (error) {
      await this.logAuthEvent('token_sync_failed', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      
      throw error;
    }
  }

  // Handle OAuth callback (for frontend processing)
  async handleOAuthCallback(code: string, state?: string, error?: string): Promise<void> {
    if (error) {
      await this.logAuthEvent('oauth_callback_error', {
        error,
        state: state || 'none',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      
      throw new AuthenticationError(`OAuth error: ${error}`);
    }

    if (!code) {
      await this.logAuthEvent('oauth_callback_no_code', {
        state: state || 'none',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      
      throw new AuthenticationError('No authorization code received');
    }

    try {
      // The actual token exchange happens on the server-side callback
      // This method is for frontend state management
      await this.checkAuthStatus();
      
      await this.logAuthEvent('oauth_callback_success', {
        state: state || 'none',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    } catch (error) {
      await this.logAuthEvent('oauth_callback_failed', {
        state: state || 'none',
        error: error instanceof Error ? error.message : 'unknown',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      
      throw error;
    }
  }

  // Check if token needs refresh
  isTokenExpired(): boolean {
    if (!this.currentAuthState.tokenExpiry) return false;
    
    const expiry = new Date(this.currentAuthState.tokenExpiry);
    const now = new Date();
    const bufferMinutes = 5; // Refresh 5 minutes before expiry
    
    return expiry.getTime() - now.getTime() < bufferMinutes * 60 * 1000;
  }

  // Force token refresh by re-checking status
  async refreshToken(): Promise<void> {
    await this.checkAuthStatus();
  }

  // Sign out (clear auth state)
  async signOut(): Promise<void> {
    try {
      // Log sign out event
      await this.logAuthEvent('sign_out', {
        userId: this.currentAuthState.user?.uid || 'unknown',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      
      // Clear local state
      this.notifyStateChange({
        user: null,
        authenticated: false,
        hasValidDriveToken: false,
        tokenExpiry: undefined,
        scopes: undefined,
        loading: false,
      });
      
      // Clear cookies by making a request to sign out endpoint
      // (This would need to be implemented in the API)
      // await apiClient.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      // Still clear local state even if server sign out fails
      this.notifyStateChange({
        user: null,
        authenticated: false,
        hasValidDriveToken: false,
        tokenExpiry: undefined,
        scopes: undefined,
        loading: false,
      });
    }
  }

  // Update user information (from Firebase Auth)
  updateUser(user: User | null): void {
    this.notifyStateChange({ user });
  }

  // Get auth headers for API requests
  async getAuthHeaders(): Promise<Record<string, string>> {
    const user = this.currentAuthState.user;
    
    if (!user) {
      return {};
    }

    try {
      const token = await user.getIdToken();
      return {
        Authorization: `Bearer ${token}`,
      };
    } catch (error) {
      console.error('Failed to get ID token:', error);
      return {};
    }
  }

  // Get Firebase ID token for API requests
  async getIdToken(): Promise<string | null> {
    const user = this.currentAuthState.user;
    
    if (!user) {
      return null;
    }

    try {
      return await user.getIdToken();
    } catch (error) {
      console.error('Failed to get ID token:', error);
      return null;
    }
  }

  // Log authentication events for monitoring
  private async logAuthEvent(event: string, data: Record<string, any>): Promise<void> {
    try {
      await apiClient.logMetric(`auth_${event}`, {
        ...data,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Logging errors should not break auth flow
      console.debug('Auth event logging failed:', error);
    }
  }

  // Validate required scopes
  hasRequiredScopes(requiredScopes: string[]): boolean {
    const currentScopes = this.currentAuthState.scopes || [];
    return requiredScopes.every(scope => currentScopes.includes(scope));
  }

  // Get scope status
  getScopeStatus(): { granted: string[]; missing: string[] } {
    const currentScopes = this.currentAuthState.scopes || [];
    const requiredScopes = ['https://www.googleapis.com/auth/drive'];
    
    return {
      granted: currentScopes,
      missing: requiredScopes.filter(scope => !currentScopes.includes(scope)),
    };
  }
}

// Create singleton instance
const authService = new AuthService();
export default authService;
