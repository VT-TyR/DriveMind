import { NextRequest, NextResponse } from 'next/server';
import { renameFile } from '@/lib/file-operations';

export async function POST(request: NextRequest) {
  try {
    const { uid, fileId, newName } = await request.json();

    if (!uid || !fileId || !newName) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    await renameFile(uid, { fileId, newName });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in rename file API:', error);
    return NextResponse.json(
      { error: 'Failed to rename file' },
      { status: 500 }
    );
  }
}