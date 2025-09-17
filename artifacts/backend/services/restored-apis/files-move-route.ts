/**
 * @fileoverview RESTORED: File Move API Endpoint
 * 
 * ORIGINAL LOCATION: src/app/api-disabled/files/move/route.ts
 * STATUS: RESTORED AND ENHANCED
 * VERSION: 1.0.0-REPAIR
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoredFileOperations } from '../api-restoration-service';
import { logger } from '@/lib/logger';

/**
 * RESTORED: Move file to new parent folder
 * 
 * POST /api/files/move
 * 
 * Request Body:
 * {
 *   "fileId": "string",
 *   "newParentId": "string", 
 *   "oldParentId": "string" (optional)
 * }
 * 
 * ENHANCED FEATURES:
 * - Authentication and authorization
 * - Input validation and sanitization
 * - Rate limiting
 * - Audit logging
 * - Proper error handling
 * - Security middleware
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('File move API called', { 
      method: 'POST', 
      path: '/api/files/move',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.moveFile(request);
    
    const duration = Date.now() - startTime;
    logger.info('File move API completed', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('File move API error', { 
      error: errorMessage,
      duration,
      path: '/api/files/move'
    });
    
    return NextResponse.json(
      { error: 'Failed to move file', details: errorMessage },
      { status: 500 }
    );
  }
}

// SECURITY: Only POST method allowed
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'POST' } }
  );
}