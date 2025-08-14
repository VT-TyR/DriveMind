import { NextRequest, NextResponse } from 'next/server';
import { createFolder } from '@/lib/file-operations';

export async function POST(request: NextRequest) {
  try {
    const { uid, name, parentId } = await request.json();

    if (!uid || !name) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const folderId = await createFolder(uid, name, parentId);

    return NextResponse.json({ success: true, folderId });
  } catch (error) {
    console.error('Error in create folder API:', error);
    return NextResponse.json(
      { error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}