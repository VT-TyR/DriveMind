/**
 * Security-Aware React Hooks
 * 
 * Custom hooks for security-related functionality including authentication,
 * consent management, and secure data handling.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  generatePKCEChallenge,
  generatePKCEOAuthUrl,
  validateOAuthCallback,
  PKCEChallenge,
  OAuthCallbackValidation
} from '@/lib/security/pkce';
import {
  checkConsentStatus,
  grantConsent,
  revokeConsent,
  hasConsentForPurpose,
  ConsentStatus,
  ConsentRecord
} from '@/lib/security/consent-manager';
import {
  oauthManager,
  OAuthTokenManager
} from '@/lib/security/token-encryption';
import {
  SecurityNotification,
  SecurityAction
} from '@/components/security/security-notification';

/**
 * PKCE-enhanced OAuth authentication hook
 */
export function usePKCEAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PKCEChallenge | null>(null);

  const generateAuthUrl = useCallback(async (params: {
    clientId: string;
    redirectUri: string;
    scope: string[];
    userId?: string;
  }): Promise<string> => {
    setLoading(true);
    setError(null);
    
    try {
      const url = await generatePKCEOAuthUrl(params);
      return url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate OAuth URL';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const initiateAuth = useCallback(async (userId?: string): Promise<string> => {
    try {
      const response = await fetch('/api/auth/drive/begin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        throw new Error('Failed to initiate OAuth flow');
      }

      const data = await response.json();
      
      // Store challenge data if provided
      if (data.codeChallenge) {
        setChallenge({
          codeVerifier: '', // Not returned for security
          codeChallenge: data.codeChallenge,
          codeChallengeMethod: 'S256'
        });
      }

      return data.url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initiate authentication';
      setError(errorMessage);
      throw err;
    }
  }, []);

  const handleCallback = useCallback(async (
    code: string,
    state: string,
    error?: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Validate callback parameters
      const validation = validateOAuthCallback(code, state, error);
      
      if (!validation.isValid) {
        setError(validation.errors.join(', '));
        return false;
      }

      // Send to backend for token exchange
      const response = await fetch('/api/auth/drive/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          state,
          codeVerifier: validation.codeVerifier
        })
      });

      if (!response.ok) {
        throw new Error('Token exchange failed');
      }

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Callback processing failed';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    challenge,
    generateAuthUrl,
    initiateAuth,
    handleCallback
  };
}

/**
 * Consent management hook
 */
export function useConsentManagement(userId: string) {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConsentStatus = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const status = await checkConsentStatus(userId);
      setConsentStatus(status);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load consent status';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const grantUserConsent = useCallback(async (
    purposes: string[],
    dataTypes: string[],
    expirationMonths?: number
  ): Promise<ConsentRecord | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const record = await grantConsent(userId, purposes, dataTypes, expirationMonths);
      await loadConsentStatus(); // Refresh status
      return record;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to grant consent';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, loadConsentStatus]);

  const revokeUserConsent = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      await revokeConsent(userId);
      await loadConsentStatus(); // Refresh status
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to revoke consent';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId, loadConsentStatus]);

  const checkPurposeConsent = useCallback(async (purpose: string): Promise<boolean> => {
    try {
      return await hasConsentForPurpose(userId, purpose);
    } catch {
      return false;
    }
  }, [userId]);

  // Load initial status
  useEffect(() => {
    loadConsentStatus();
  }, [loadConsentStatus]);

  return {
    consentStatus,
    loading,
    error,
    loadConsentStatus,
    grantConsent: grantUserConsent,
    revokeConsent: revokeUserConsent,
    checkPurposeConsent
  };
}

/**
 * Secure token management hook
 */
export function useSecureTokens() {
  const [tokenManager] = useState(() => new OAuthTokenManager());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const checkAuthStatus = useCallback(async () => {
    setLoading(true);
    try {
      const authenticated = await tokenManager.isAuthenticated();
      setIsAuthenticated(authenticated);
      return authenticated;
    } catch {
      setIsAuthenticated(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [tokenManager]);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    try {
      return await tokenManager.getValidAccessToken();
    } catch {
      setIsAuthenticated(false);
      return null;
    }
  }, [tokenManager]);

  const clearTokens = useCallback(() => {
    tokenManager.clearTokens();
    setIsAuthenticated(false);
  }, [tokenManager]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const success = await tokenManager.refreshAccessToken();
      if (success) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      return success;
    } catch {
      setIsAuthenticated(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [tokenManager]);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  return {
    isAuthenticated,
    loading,
    checkAuthStatus,
    getValidToken,
    clearTokens,
    refreshToken
  };
}

/**
 * Security notifications hook
 */
export function useSecurityNotifications() {
  const [notifications, setNotifications] = useState<SecurityNotification[]>([]);
  const notificationId = useRef(0);

  const addNotification = useCallback((
    notification: Omit<SecurityNotification, 'id' | 'timestamp'>
  ) => {
    const id = `security_${++notificationId.current}_${Date.now()}`;
    const newNotification: SecurityNotification = {
      ...notification,
      id,
      timestamp: new Date()
    };

    setNotifications(prev => [newNotification, ...prev]);

    // Auto-hide notifications if specified
    if (notification.autoHide) {
      const timeout = notification.severity === 'critical' ? 10000 : 5000;
      setTimeout(() => {
        dismissNotification(id);
      }, timeout);
    }

    return id;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const addAuthError = useCallback((message: string) => {
    return addNotification({
      type: 'error',
      severity: 'high',
      title: 'Authentication Failed',
      message,
      category: 'authentication',
      actions: [
        {
          id: 'retry',
          label: 'Retry',
          variant: 'default',
          onClick: () => window.location.reload()
        }
      ]
    });
  }, [addNotification]);

  const addConsentWarning = useCallback((purpose: string) => {
    return addNotification({
      type: 'warning',
      severity: 'medium',
      title: 'Consent Required',
      message: `You need to grant consent for ${purpose} to use this feature.`,
      category: 'privacy',
      actions: [
        {
          id: 'grant',
          label: 'Manage Consent',
          variant: 'default',
          onClick: () => {
            // This would be handled by the parent component
          }
        }
      ]
    });
  }, [addNotification]);

  const addSecuritySuccess = useCallback((message: string) => {
    return addNotification({
      type: 'success',
      severity: 'low',
      title: 'Security Update',
      message,
      category: 'system',
      autoHide: true
    });
  }, [addNotification]);

  const addDataProtectionAlert = useCallback((message: string, details?: string) => {
    return addNotification({
      type: 'warning',
      severity: 'high',
      title: 'Data Protection Alert',
      message,
      details,
      category: 'data-protection',
      persistent: true,
      learnMoreUrl: 'https://drivemind.ai/privacy'
    });
  }, [addNotification]);

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAllNotifications,
    addAuthError,
    addConsentWarning,
    addSecuritySuccess,
    addDataProtectionAlert
  };
}

/**
 * Secure API request hook with token management
 */
export function useSecureApi() {
  const { getValidToken } = useSecureTokens();
  const { addNotification } = useSecurityNotifications();

  const secureRequest = useCallback(async <T = any>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> => {
    try {
      // Get valid access token
      const token = await getValidToken();
      
      if (!token) {
        throw new Error('No valid access token available');
      }

      // Add authorization header
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      };

      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle authentication errors
      if (response.status === 401) {
        addNotification({
          type: 'error',
          severity: 'high',
          title: 'Authentication Required',
          message: 'Your session has expired. Please sign in again.',
          category: 'authentication'
        });
        throw new Error('Authentication required');
      }

      // Handle authorization errors
      if (response.status === 403) {
        addNotification({
          type: 'error',
          severity: 'medium',
          title: 'Access Denied',
          message: 'You do not have permission to access this resource.',
          category: 'authorization'
        });
        throw new Error('Access denied');
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text() as T;
      }
    } catch (error) {
      console.error('Secure API request failed:', error);
      throw error;
    }
  }, [getValidToken, addNotification]);

  return { secureRequest };
}

/**
 * Authentication status hook with security monitoring
 */
export function useAuthStatus() {
  const [status, setStatus] = useState<{
    isAuthenticated: boolean;
    isLoading: boolean;
    lastCheck: Date | null;
    error: string | null;
  }>({
    isAuthenticated: false,
    isLoading: true,
    lastCheck: null,
    error: null
  });

  const checkStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await fetch('/api/auth/drive/status');
      const data = await response.json();
      
      setStatus({
        isAuthenticated: response.ok && data.authenticated,
        isLoading: false,
        lastCheck: new Date(),
        error: null
      });
    } catch (error) {
      setStatus({
        isAuthenticated: false,
        isLoading: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Status check failed'
      });
    }
  }, []);

  // Check status on mount and periodically
  useEffect(() => {
    checkStatus();
    
    // Refresh status every 5 minutes
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [checkStatus]);

  return {
    ...status,
    refresh: checkStatus
  };
}

/**
 * Security audit hook for monitoring security events
 */
export function useSecurityAudit() {
  const [auditLog, setAuditLog] = useState<Array<{
    id: string;
    timestamp: Date;
    event: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details?: string;
  }>>([]);

  const logEvent = useCallback((
    event: string,
    category: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low',
    details?: string
  ) => {
    const entry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      event,
      category,
      severity,
      details
    };

    setAuditLog(prev => [entry, ...prev.slice(0, 99)]); // Keep last 100 entries
    
    // Send to backend for persistent storage
    fetch('/api/security/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(entry)
    }).catch(console.error);
  }, []);

  const logAuthEvent = useCallback((event: string, success: boolean, details?: string) => {
    logEvent(
      event,
      'authentication',
      success ? 'low' : 'high',
      details
    );
  }, [logEvent]);

  const logConsentEvent = useCallback((event: string, details?: string) => {
    logEvent(event, 'privacy', 'medium', details);
  }, [logEvent]);

  const logDataAccess = useCallback((resource: string, action: string) => {
    logEvent(
      `${action} access to ${resource}`,
      'data-protection',
      'low'
    );
  }, [logEvent]);

  return {
    auditLog,
    logEvent,
    logAuthEvent,
    logConsentEvent,
    logDataAccess
  };
}