import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    url: request.url,
    params: Object.fromEntries(searchParams.entries()),
    env: {
      hasClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      hasBaseUrl: !!process.env.NEXT_PUBLIC_BASE_URL,
      nodeEnv: process.env.NODE_ENV
    },
    headers: Object.fromEntries(request.headers.entries())
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    body,
    url: request.url,
    env: {
      clientIdLength: process.env.GOOGLE_OAUTH_CLIENT_ID?.length,
      clientSecretLength: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.length,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
      nodeEnv: process.env.NODE_ENV
    }
  });
}