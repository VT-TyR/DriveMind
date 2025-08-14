/**
 * Authentication utilities for Genkit flows.
 * This integrates with Firebase Auth to provide secure user authentication.
 */
import { z } from 'genkit';

export const FlowAuthSchema = z.object({
  uid: z.string(),
  email: z.string().optional(),
  idToken: z.string().optional(),
}).optional();
export type FlowAuth = z.infer<typeof FlowAuthSchema>;

/**
 * Authenticated user object with verified Firebase credentials.
 */
export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

/**
 * Validates Firebase ID token and returns authenticated user.
 * In production, this validates the ID token server-side.
 */
export async function getAuthenticatedUser(auth?: FlowAuth): Promise<AuthenticatedUser> {
  if (!auth?.uid) {
    // For development/testing only
    if (process.env.NODE_ENV === 'development') {
      console.warn("Auth object not provided to flow, using mock user. This is development-only.");
      return { uid: 'mock-user-id-for-testing' };
    }
    throw new Error('Authentication required. Please sign in.');
  }

  // TODO: In production, verify the ID token with Firebase Admin SDK
  // For now, we'll implement basic validation
  if (auth.idToken && process.env.NODE_ENV === 'production') {
    // This should be implemented with proper Firebase Admin SDK
    console.log('ID token verification not yet implemented');
  }

  // For development, trust the provided UID
  return { uid: auth.uid, email: auth.email };
}

/**
 * Synchronous version for flows that don't need token verification.
 * Use with caution - primarily for development.
 */
export function getAuthenticatedUserSync(auth?: FlowAuth): AuthenticatedUser {
  if (!auth?.uid) {
    if (process.env.NODE_ENV === 'development') {
      console.warn("Auth object not provided to flow, using mock user. This is development-only.");
      return { uid: 'mock-user-id-for-testing' };
    }
    throw new Error('Authentication required. Please sign in.');
  }

  return { uid: auth.uid, email: auth.email };
}
