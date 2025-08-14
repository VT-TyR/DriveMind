import { NextRequest, NextResponse } from 'next/server';
import { moveFile } from '@/lib/file-operations';
import { logger } from '@/lib/logger';
import { isAppError, ValidationError } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  try {
    logger.apiRequest('POST', '/api/files/move');
    
    const { uid, fileId, newParentId, oldParentId } = await request.json();

    if (!uid || !fileId || !newParentId) {
      const error = new ValidationError('Missing required parameters: uid, fileId, newParentId');
      logger.apiError('POST', '/api/files/move', error);
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    await moveFile(uid, { fileId, newParentId, oldParentId });

    logger.info('Move file API completed successfully', {
      userId: uid,
      fileId,
      newParentId,
      api: '/api/files/move'
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.apiError('POST', '/api/files/move', error as Error);
    
    if (isAppError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}