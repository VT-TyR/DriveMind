import { NextRequest, NextResponse } from 'next/server';
import { restoreFile } from '@/lib/file-operations';

export async function POST(request: NextRequest) {
  try {
    const { uid, fileId } = await request.json();

    if (!uid || !fileId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    await restoreFile(uid, fileId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in restore file API:', error);
    return NextResponse.json(
      { error: 'Failed to restore file' },
      { status: 500 }
    );
  }
}