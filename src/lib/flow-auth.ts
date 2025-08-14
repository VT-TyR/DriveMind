/**
 * This is a temporary solution to simulate authentication in Genkit flows.
 * In a real application, you would replace this with a proper authentication
 * and authorization mechanism.
 *
 * It is NOT secure and should not be used in production.
 */
import { z } from 'genkit';

export const FlowAuthSchema = z.object({
  uid: z.string(),
  email: z.string().optional(),
}).optional();
export type FlowAuth = z.infer<typeof FlowAuthSchema>;

/**
 * A mock user object.
 */
export interface AuthenticatedUser {
  uid: string;
}

/**
 * In a real application, this function would validate the auth object
 * and return the authenticated user.
 *
 * For now, it just returns a mock user. If no auth is provided, it
 * returns a default mock user to allow flows to run.
 */
export function getAuthenticatedUser(auth?: FlowAuth): AuthenticatedUser {
  if (!auth?.uid) {
    // Allows running flows without full auth for local dev/testing
    console.warn("Auth object not provided to flow, using mock user. In production, this would fail.");
    return { uid: 'mock-user-id-for-testing' };
  }
  return { uid: auth.uid };
}
