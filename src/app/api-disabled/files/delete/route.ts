import { NextRequest, NextResponse } from 'next/server';
import { deleteFile } from '@/lib/file-operations';
import { logger } from '@/lib/logger';
import { isAppError, ValidationError } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  try {
    logger.apiRequest('POST', '/api/files/delete');
    
    const { uid, fileId } = await request.json();

    if (!uid || !fileId) {
      const error = new ValidationError('Missing required parameters: uid, fileId');
      logger.apiError('POST', '/api/files/delete', error);
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    await deleteFile(uid, fileId);

    logger.info('Delete file API completed successfully', {
      userId: uid,
      fileId,
      api: '/api/files/delete'
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.apiError('POST', '/api/files/delete', error as Error);
    
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