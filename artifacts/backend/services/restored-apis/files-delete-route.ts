/**
 * @fileoverview RESTORED: File Delete API Endpoint
 * 
 * ORIGINAL LOCATION: src/app/api-disabled/files/delete/route.ts
 * STATUS: RESTORED AND ENHANCED
 * VERSION: 1.0.0-REPAIR
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoredFileOperations } from '../api-restoration-service';
import { logger } from '@/lib/logger';

/**
 * RESTORED: Delete file (move to trash or permanent delete)
 * 
 * DELETE /api/files/delete
 * 
 * Request Body:
 * {
 *   "fileId": "string",
 *   "permanent": boolean (optional, default: false)
 * }
 * 
 * ENHANCED FEATURES:
 * - Authentication and authorization
 * - Input validation and sanitization
 * - Rate limiting
 * - Audit logging
 * - Proper error handling
 * - Security middleware
 * - Trash vs permanent delete options
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('File delete API called', { 
      method: 'DELETE', 
      path: '/api/files/delete',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.deleteFile(request);
    
    const duration = Date.now() - startTime;
    logger.info('File delete API completed', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('File delete API error', { 
      error: errorMessage,
      duration,
      path: '/api/files/delete'
    });
    
    return NextResponse.json(
      { error: 'Failed to delete file', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * ALTERNATIVE: POST method for clients that don't support DELETE with body
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('File delete API called via POST', { 
      method: 'POST', 
      path: '/api/files/delete',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.deleteFile(request);
    
    const duration = Date.now() - startTime;
    logger.info('File delete API completed via POST', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('File delete API error via POST', { 
      error: errorMessage,
      duration,
      path: '/api/files/delete'
    });
    
    return NextResponse.json(
      { error: 'Failed to delete file', details: errorMessage },
      { status: 500 }
    );
  }
}

// SECURITY: Only DELETE and POST methods allowed
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'DELETE, POST' } }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'DELETE, POST' } }
  );
}