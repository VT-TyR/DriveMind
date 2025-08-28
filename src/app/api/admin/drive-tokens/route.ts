import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/admin';
import { deleteUserRefreshToken } from '@/lib/token-store';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function requireAdmin(req: NextRequest): boolean {
  const configured = process.env.ADMIN_API_TOKEN;
  if (!configured) return false;
  const header = req.headers.get('x-admin-token');
  return !!header && header === configured;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return unauthorized();
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid') || '';
  if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: 'Firestore unavailable' }, { status: 500 });

  const snap = await db.collection(`users/${uid}/secrets`).doc('googleDrive').get();
  if (!snap.exists) {
    return NextResponse.json({ uid, hasToken: false });
  }
  const data = snap.data() as any;
  return NextResponse.json({ uid, hasToken: !!data?.refreshToken, updatedAt: data?.updatedAt || null });
}

export async function DELETE(req: NextRequest) {
  if (!requireAdmin(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const uid: string | undefined = body?.uid;
  if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 });

  await deleteUserRefreshToken(uid);
  return NextResponse.json({ ok: true });
}

