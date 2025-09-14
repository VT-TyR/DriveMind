/**
 * Firebase client initialization
 * Uses secure configuration from environment variables
 * ALPHA-CODENAME v1.8 compliant
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFirebaseConfig } from './firebase-config';
import { logger } from './logger';

// Get Firebase configuration
const firebaseConfig = (() => {
  const config = getFirebaseConfig();
  
  if (!config) {
    // Use mock config for development if real config is not available
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Using mock Firebase config for development');
      return {
        projectId: 'drivemind-dev',
        apiKey: 'mock-api-key',
        authDomain: 'drivemind-dev.firebaseapp.com',
        storageBucket: 'drivemind-dev.firebasestorage.app',
        messagingSenderId: '000000000000',
        appId: '1:000000000000:web:mock',
      };
    }
    
    logger.error('Firebase configuration not available');
    throw new Error('Firebase configuration is required');
  }
  
  return config;
})();

// Initialize Firebase with error handling
let app;
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
