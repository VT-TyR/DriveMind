import { NextResponse } from 'next/server';
import { beginOAuth } from '@/ai/flows/auth-begin-oauth';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Bridge client payload to flow schema (expects auth)
    const result = await beginOAuth({ auth: { uid: userId } });
    return NextResponse.json({ url: result.url });
  } catch (err: any) {
    const message = err?.message || 'Failed to start OAuth';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

