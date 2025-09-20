/**
 * Firebase Admin SDK initialization
 * Handles server-side Firebase operations
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let adminApp: App | null = null;

/**
 * Initialize Firebase Admin SDK
 */
export async function initAdmin(): Promise<App> {
  // Check if already initialized
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  try {
    // Initialize with service account credentials
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'drivemind-q69b7',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    // Check if we have all required credentials
    if (serviceAccount.clientEmail && serviceAccount.privateKey) {
      adminApp = initializeApp({
        credential: cert(serviceAccount as any),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'drivemind-q69b7.appspot.com',
      });
    } else {
      // Fall back to application default credentials (for deployed environments)
      adminApp = initializeApp({
        projectId: serviceAccount.projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'drivemind-q69b7.appspot.com',
      });
    }

    return adminApp;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw error;
  }
}

/**
 * Get Firebase Admin Auth instance
 */
export async function getAdminAuth() {
  await initAdmin();
  return getAuth(adminApp!);
}

/**
 * Get Firebase Admin Firestore instance
 */
export async function getAdminFirestore() {
  await initAdmin();
  return getFirestore(adminApp!);
}

/**
 * Get Firebase Admin Storage instance
 */
export async function getAdminStorage() {
  await initAdmin();
  return getStorage(adminApp!);
}

/**
 * Verify ID token
 */
export async function verifyIdToken(token: string) {
  const auth = await getAdminAuth();
  try {
    return await auth.verifyIdToken(token);
  } catch (error) {
    console.error('Failed to verify ID token:', error);
    return null;
  }
}

/**
 * Create custom token
 */
export async function createCustomToken(uid: string, claims?: Record<string, any>) {
  const auth = await getAdminAuth();
  try {
    return await auth.createCustomToken(uid, claims);
  } catch (error) {
    console.error('Failed to create custom token:', error);
    return null;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  const auth = await getAdminAuth();
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    console.error('Failed to get user by email:', error);
    return null;
  }
}

/**
 * Set custom user claims
 */
export async function setCustomUserClaims(uid: string, claims: Record<string, any>) {
  const auth = await getAdminAuth();
  try {
    await auth.setCustomUserClaims(uid, claims);
    return true;
  } catch (error) {
    console.error('Failed to set custom user claims:', error);
    return false;
  }
}