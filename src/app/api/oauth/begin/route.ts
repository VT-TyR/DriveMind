import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient } from '@/lib/google-auth';

export async function POST(request: NextRequest) {
  try {
    console.log('API OAuth begin called');
    
    // Get user ID from request body
    const { userId } = await request.json();
    console.log('User ID:', userId);
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }
    
    // Create OAuth client
    const client = getOAuthClient();
    console.log('OAuth client created');
    
    // Generate the authentication URL
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file'
      ],
      state: userId,
    });
    
    console.log('Generated OAuth URL:', url);
    
    return NextResponse.json({ url });
  } catch (error) {
    console.error('OAuth API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL' }, 
      { status: 500 }
    );
  }
}