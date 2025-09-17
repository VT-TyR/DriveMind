/**
 * @fileoverview Auth hook for accessing user authentication state with token management
 */

import { useContext, useEffect, useState, useCallback } from 'react';
import { AuthContext } from '@/contexts/auth-context';

export function useAuth() {
  const context = useContext(AuthContext);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const refreshToken = useCallback(async () => {
    if (context.user) {
      try {
        setTokenError(null);
        const idToken = await context.user.getIdToken(true); // Force refresh
        setToken(idToken);
        return idToken;
      } catch (error) {
        console.error('Failed to get ID token:', error);
        setTokenError(error instanceof Error ? error.message : 'Token refresh failed');
        setToken(null);
        return null;
      }
    } else {
      setToken(null);
      setTokenError(null);
      return null;
    }
  }, [context.user]);

  useEffect(() => {
    refreshToken();
  }, [refreshToken]);
  
  return {
    ...context,
    token,
    tokenError,
    refreshToken,
  };
}