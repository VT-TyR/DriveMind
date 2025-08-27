// Server-only: User token persistence for Google Drive OAuth

import { getAdminFirestore } from '@/lib/admin';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
type CacheEntry = { token: string; ts: number };
const tokenCache: Map<string, CacheEntry> = new Map();

const collectionPathForUser = (uid: string) => `users/${uid}/secrets`;
const docId = 'googleDrive';

export async function saveUserRefreshToken(uid: string, refreshToken: string) {
  const db = getAdminFirestore();
  if (!db) throw new Error('Failed to initialize Firestore');
  const ref = db.collection(collectionPathForUser(uid)).doc(docId);
  await ref.set(
    {
      refreshToken,
      updatedAt: new Date(),
    },
    { merge: true }
  );
  tokenCache.set(uid, { token: refreshToken, ts: Date.now() });
}

export async function getUserRefreshToken(uid: string): Promise<string | null> {
  // Check cache first
  const cached = tokenCache.get(uid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.token;

  const db = getAdminFirestore();
  if (!db) throw new Error('Failed to initialize Firestore');
  const snap = await db.collection(collectionPathForUser(uid)).doc(docId).get();
  const data = snap.exists ? (snap.data() as any) : null;
  const token = data?.refreshToken ?? null;
  if (token) tokenCache.set(uid, { token, ts: Date.now() });
  return token;
}

export function clearTokenCache(uid?: string) {
  if (uid) tokenCache.delete(uid);
  else tokenCache.clear();
}

