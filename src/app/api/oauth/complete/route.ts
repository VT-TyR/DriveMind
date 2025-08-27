import { NextResponse } from 'next/server';
import { completeOAuth } from '@/ai/flows/auth-complete-oauth';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code: string | undefined = body?.code;
    const state: string | undefined = body?.state;

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
    }

    // Satisfy flow schema; use state (uid) for auth context
    const result = await completeOAuth({ code, state, auth: { uid: state } });
    return NextResponse.json({ ok: result.ok, message: result.message });
  } catch (err: any) {
    const message = err?.message || 'Failed to complete OAuth';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

