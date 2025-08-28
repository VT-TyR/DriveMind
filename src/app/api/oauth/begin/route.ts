import { NextResponse } from 'next/server';

// Deprecated: Use /api/auth/drive/begin instead
export async function POST() {
  return NextResponse.json(
    {
      error: 'Deprecated endpoint. Use /api/auth/drive/begin',
      replacement: '/api/auth/drive/begin',
    },
    { status: 410 }
  );
}
