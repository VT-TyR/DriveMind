/**
 * Firebase configuration helper
 * Securely reconstructs Firebase config from environment variables
 * ALPHA-CODENAME v1.8 compliant
 */

import { logger } from '@/lib/logger';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Get Firebase configuration from environment variables
 * Validates all required fields are present
 */
export function getFirebaseConfig(): FirebaseConfig | null {
  const config: Partial<FirebaseConfig> = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // Validate all required fields
  const missingFields = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    logger.error('Firebase configuration incomplete', {
      missingFields,
      environment: process.env.NODE_ENV,
    });
    return null;
  }

  return config as FirebaseConfig;
}

/**
 * Validate Firebase configuration at startup
 */
export function validateFirebaseConfig(): boolean {
  const config = getFirebaseConfig();
  
  if (!config) {
    logger.error('Firebase configuration validation failed');
    return false;
  }

  // Additional validation rules
  if (!config.projectId.match(/^[a-z0-9-]+$/)) {
    logger.error('Invalid Firebase project ID format');
    return false;
  }

  if (!config.authDomain.includes('.firebaseapp.com')) {
    logger.error('Invalid Firebase auth domain');
    return false;
  }

  logger.info('Firebase configuration validated successfully');
  return true;
}

/**
 * Get Firebase config for client-side initialization
 * Returns null if configuration is incomplete
 */
export function getClientFirebaseConfig(): FirebaseConfig | null {
  if (typeof window === 'undefined') {
    logger.warn('getClientFirebaseConfig called on server side');
    return null;
  }

  return getFirebaseConfig();
}