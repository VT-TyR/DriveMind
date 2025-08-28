import { NextResponse } from 'next/server';

// Deprecated: The OAuth callback is handled at /api/auth/drive/callback
export async function POST() {
  return NextResponse.json(
    {
      error: 'Deprecated endpoint. Use /api/auth/drive/callback',
      replacement: '/api/auth/drive/callback',
    },
    { status: 410 }
  );
}
