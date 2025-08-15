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
    
    try {
      console.log('Starting Google sign-in...');
      
      const result = await signInWithPopup(auth, provider);
      
      console.log('Google sign-in successful:', {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName
      });
    } catch (error) {
      console.error('Google sign-in failed:', error);
      throw mapFirebaseError(error);
    }
  };

  const signOut = async () => {
    try {
      console.log('Starting sign out...');
      
      await firebaseSignOut(auth);
      
      console.log('Sign out successful');
    } catch (error) {
      console.error('Sign out failed:', error);
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