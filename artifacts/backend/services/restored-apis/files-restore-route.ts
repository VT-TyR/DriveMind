/**
 * @fileoverview RESTORED: File Restore API Endpoint
 * 
 * ORIGINAL LOCATION: src/app/api-disabled/files/restore/route.ts
 * STATUS: RESTORED AND ENHANCED
 * VERSION: 1.0.0-REPAIR
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoredFileOperations } from '../api-restoration-service';
import { logger } from '@/lib/logger';

/**
 * RESTORED: Restore file from trash
 * 
 * PATCH /api/files/restore
 * 
 * Request Body:
 * {
 *   "fileId": "string"
 * }
 * 
 * ENHANCED FEATURES:
 * - Authentication and authorization
 * - Input validation and sanitization
 * - Rate limiting
 * - Audit logging
 * - Proper error handling
 * - Security middleware
 * - Verification that file is actually in trash
 */
export async function PATCH(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('File restore API called', { 
      method: 'PATCH', 
      path: '/api/files/restore',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.restoreFile(request);
    
    const duration = Date.now() - startTime;
    logger.info('File restore API completed', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('File restore API error', { 
      error: errorMessage,
      duration,
      path: '/api/files/restore'
    });
    
    return NextResponse.json(
      { error: 'Failed to restore file', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * ALTERNATIVE: POST method for clients that prefer POST
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('File restore API called via POST', { 
      method: 'POST', 
      path: '/api/files/restore',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.restoreFile(request);
    
    const duration = Date.now() - startTime;
    logger.info('File restore API completed via POST', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('File restore API error via POST', { 
      error: errorMessage,
      duration,
      path: '/api/files/restore'
    });
    
    return NextResponse.json(
      { error: 'Failed to restore file', details: errorMessage },
      { status: 500 }
    );
  }
}

// SECURITY: Only PATCH and POST methods allowed
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'PATCH, POST' } }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'PATCH, POST' } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'PATCH, POST' } }
  );
}