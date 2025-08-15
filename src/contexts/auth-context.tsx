'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { logger } from '@/lib/logger';
import { mapFirebaseError, AuthenticationError } from '@/lib/error-handler';
import { storeGoogleAccessToken } from '@/lib/drive-auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    
    // Add scopes for Google Drive access
    provider.addScope('https://www.googleapis.com/auth/drive.readonly');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    
    try {
      logger.authEvent('sign_in_start');
      
      const result = await signInWithPopup(auth, provider);
      
      // Extract and store the Google access token for Drive API access
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        storeGoogleAccessToken(result.user.uid, credential.accessToken);
      }
      
      logger.authEvent('sign_in_success', result.user.uid, {
        email: result.user.email,
        displayName: result.user.displayName
      });
    } catch (error) {
      logger.authError('sign_in_failed', error as Error);
      throw mapFirebaseError(error);
    }
  };

  const signOut = async () => {
    try {
      logger.authEvent('sign_out_start', user?.uid);
      
      await firebaseSignOut(auth);
      
      logger.authEvent('sign_out_success');
    } catch (error) {
      logger.authError('sign_out_failed', error as Error, user?.uid);
      throw mapFirebaseError(error);
    }
  };

  const value = {
    user,
    loading,
    signInWithGoogle,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}