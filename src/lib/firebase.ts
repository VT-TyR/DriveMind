
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration - either from environment or default for development
const getFirebaseConfig = () => {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Client-side: use NEXT_PUBLIC environment variables
    if (process.env.NEXT_PUBLIC_FIREBASE_CONFIG) {
      try {
        return JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG);
      } catch (error) {
        console.error('Error parsing Firebase config:', error);
      }
    }
    
    // Fallback configuration for development
    return {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'draftcore-os',
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-key',
      authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'draftcore-os'}.firebaseapp.com`,
      appId: '1:123456789:web:abcdef',
      messagingSenderId: '123456789'
    };
  }
  
  // Server-side: can access all environment variables
  if (process.env.NEXT_PUBLIC_FIREBASE_CONFIG) {
    try {
      return JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG);
    } catch (error) {
      console.error('Error parsing Firebase config:', error);
    }
  }

  // Fallback configuration for development
  return {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'draftcore-os',
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-key',
    authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'draftcore-os'}.firebaseapp.com`,
    appId: '1:123456789:web:abcdef',
    messagingSenderId: '123456789'
  };
};

const firebaseConfig = getFirebaseConfig();

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
