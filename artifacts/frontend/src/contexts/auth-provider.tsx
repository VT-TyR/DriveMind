'use client';

/**
 * Enhanced authentication provider with OAuth 2.0 and route protection
 * Implements ALPHA-CODENAME v1.4 security standards
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import authService, { AuthState } from '@/lib/auth-service';
import { AuthenticationError } from '@/lib/error-handler';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType extends AuthState {
  // Firebase Auth methods
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  
  // OAuth Drive methods
  beginDriveOAuth: (userId?: string) => Promise<string>;
  syncDriveTokens: (userId: string) => Promise<void>;
  checkDriveAuth: () => Promise<void>;
  
  // Token management
  getIdToken: () => Promise<string | null>;
  refreshAuth: () => Promise<void>;
  
  // Scope validation
  hasRequiredScopes: (scopes: string[]) => boolean;
  getScopeStatus: () => { granted: string[]; missing: string[] };
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    authenticated: false,
    hasValidDriveToken: false,
  });
  
  const { toast } = useToast();

  // Initialize auth service listener
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange(setAuthState);
    return unsubscribe;
  }, []);

  // Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      authService.updateUser(user);
      
      if (user) {
        // Check Drive token status when Firebase user is available
        try {
          await authService.checkAuthStatus();
        } catch (error) {
          console.debug('Initial auth status check failed:', error);
        }
      }
    });

    return unsubscribe;
  }, []);

  // Firebase Google sign-in
  const signInWithGoogle = useCallback(async () => {
    try {
      // Import Firebase auth methods dynamically to avoid SSR issues
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      
      const result = await signInWithPopup(auth, provider);
      
      toast({
        title: 'Welcome!',
        description: `Signed in as ${result.user.displayName || result.user.email}`,
      });
    } catch (error) {
      console.error('Google sign-in failed:', error);
      
      let errorMessage = 'Sign-in failed. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('popup-closed-by-user')) {
          errorMessage = 'Sign-in was cancelled.';
        } else if (error.message.includes('popup-blocked')) {
          errorMessage = 'Please allow popups and try again.';
        }
      }
      
      toast({
        title: 'Sign-in Error',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw new AuthenticationError(errorMessage);
    }
  }, [toast]);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      const { signOut: firebaseSignOut } = await import('firebase/auth');
      await firebaseSignOut(auth);
      await authService.signOut();
      
      toast({
        title: 'Signed out',
        description: 'You have been signed out successfully.',
      });
    } catch (error) {
      console.error('Sign out failed:', error);
      
      toast({
        title: 'Sign-out Error',
        description: 'Failed to sign out. Please try again.',
        variant: 'destructive',
      });
      
      throw error;
    }
  }, [toast]);

  // Begin Google Drive OAuth flow
  const beginDriveOAuth = useCallback(async (userId?: string): Promise<string> => {
    try {
      const flow = await authService.beginOAuth(userId);
      return flow.beginUrl;
    } catch (error) {
      console.error('OAuth begin failed:', error);
      
      toast({
        title: 'OAuth Error',
        description: 'Failed to start Google Drive authorization. Please try again.',
        variant: 'destructive',
      });
      
      throw error;
    }
  }, [toast]);

  // Sync Drive tokens
  const syncDriveTokens = useCallback(async (userId: string) => {
    try {
      await authService.syncTokens(userId);
      
      toast({
        title: 'Success',
        description: 'Google Drive connected successfully!',
      });
    } catch (error) {
      console.error('Token sync failed:', error);
      
      toast({
        title: 'Sync Error',
        description: 'Failed to sync Google Drive tokens. Please try reconnecting.',
        variant: 'destructive',
      });
      
      throw error;
    }
  }, [toast]);

  // Check Drive authentication status
  const checkDriveAuth = useCallback(async () => {
    try {
      await authService.checkAuthStatus();
    } catch (error) {
      console.debug('Drive auth check failed:', error);
      // Don't show toast for routine auth checks
    }
  }, []);

  // Get Firebase ID token
  const getIdToken = useCallback(async (): Promise<string | null> => {
    return authService.getIdToken();
  }, []);

  // Refresh authentication status
  const refreshAuth = useCallback(async () => {
    try {
      await authService.refreshToken();
    } catch (error) {
      console.error('Auth refresh failed:', error);
      
      toast({
        title: 'Authentication Error',
        description: 'Please sign in again to continue.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Scope validation helpers
  const hasRequiredScopes = useCallback((scopes: string[]): boolean => {
    return authService.hasRequiredScopes(scopes);
  }, []);

  const getScopeStatus = useCallback(() => {
    return authService.getScopeStatus();
  }, []);

  const contextValue: AuthContextType = {
    ...authState,
    signInWithGoogle,
    signOut,
    beginDriveOAuth,
    syncDriveTokens,
    checkDriveAuth,
    getIdToken,
    refreshAuth,
    hasRequiredScopes,
    getScopeStatus,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Route protection hook
export function useRequireAuth(redirectTo?: string) {
  const { user, loading, authenticated } = useAuth();
  
  useEffect(() => {
    if (!loading && !authenticated) {
      if (redirectTo) {
        window.location.href = redirectTo;
      }
    }
  }, [loading, authenticated, redirectTo]);
  
  return {
    user,
    loading,
    authenticated,
    isReady: !loading && authenticated,
  };
}

// Drive token requirement hook
export function useRequireDriveAuth() {
  const { hasValidDriveToken, beginDriveOAuth, user } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  
  const connectDrive = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsConnecting(true);
      const authUrl = await beginDriveOAuth(user.uid);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Drive connection failed:', error);
      setIsConnecting(false);
    }
  }, [user, beginDriveOAuth]);
  
  return {
    hasValidDriveToken,
    isConnecting,
    connectDrive,
  };
}
