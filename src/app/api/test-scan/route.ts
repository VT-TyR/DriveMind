import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    // Try to get user's Google Drive access token
    const { driveFor } = await import('@/lib/google-drive');
    const drive = await driveFor(decodedToken.uid);
    
    // Test basic API call
    const response = await drive.files.list({ 
      pageSize: 5,
      fields: 'files(id,name,mimeType,size,modifiedTime)' 
    });
    
    const files = response.data.files || [];
    
    return NextResponse.json({
      success: true,
      message: `Successfully accessed Google Drive for user ${decodedToken.email}`,
      sampleFiles: files.length,
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        type: f.mimeType,
        size: f.size,
        modified: f.modifiedTime
      }))
    });
    
  } catch (error) {
    console.error('Drive test error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to access Google Drive', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}