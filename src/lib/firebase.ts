/**
 * Firebase client initialization
 * Uses secure configuration from environment variables
 * ALPHA-CODENAME v1.8 compliant
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFirebaseConfig } from './firebase-config';
import { logger } from './logger';

// Get Firebase configuration
const firebaseConfig = (() => {
  const config = getFirebaseConfig();
  
  if (!config) {
    // Use fallback config for build/development if real config is not available
    logger.warn('Using fallback Firebase config for build');
    return {
      projectId: 'drivemind-q69b7',
      apiKey: 'AIzaSyCVbO-u__2o-AF6IAQYZVeJ14vuMssxGXk',
      authDomain: 'drivemind-q69b7.firebaseapp.com',
      storageBucket: 'drivemind-q69b7.firebasestorage.app',
      messagingSenderId: '687330755440',
      appId: '1:687330755440:web:3ce0727b1a2afc16fac5b5',
    };
  }
  
  return config;
})();

// Initialize Firebase with error handling
let app: FirebaseApp;
try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  logger.info('Firebase initialized successfully');
} catch (error) {
  logger.error('Failed to initialize Firebase', { error });
  throw error;
}

export { app };

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export configuration validator for health checks
export function isFirebaseInitialized(): boolean {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}
