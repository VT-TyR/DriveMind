// Server-only: Firebase Admin initialization
// Uses application default credentials in Firebase App Hosting/Cloud Run.

import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let adminFirestore: Firestore | null = null;
let adminAuth: Auth | null = null;

export function getAdminApp() {
  if (adminApp) return adminApp;
  // Lazy import to avoid bundling/admin requirement on client
  // and to keep this file server-only.
  const adminAppModule = require('firebase-admin/app');
  const { initializeApp, getApps, applicationDefault } = adminAppModule;

  adminApp = getApps().length
    ? adminAppModule.getApp()
    : initializeApp({
        credential: applicationDefault(),
      });
  return adminApp;
}

export function getAdminFirestore() {
  if (adminFirestore) return adminFirestore;
  const { getFirestore } = require('firebase-admin/firestore');
  adminFirestore = getFirestore(getAdminApp());
  return adminFirestore;
}

export function getAdminAuth() {
  if (adminAuth) return adminAuth;
  const { getAuth } = require('firebase-admin/auth');
  adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

// Export auth function for API routes to avoid null issues
export const auth = {
  verifyIdToken: async (token: string) => {
    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      throw new Error('Firebase Admin Auth not initialized');
    }
    return adminAuth.verifyIdToken(token);
  }
};

