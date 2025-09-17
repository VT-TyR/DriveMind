/**
 * @fileoverview RESTORED: File Rename API Endpoint
 * 
 * ORIGINAL LOCATION: src/app/api-disabled/files/rename/route.ts
 * STATUS: RESTORED AND ENHANCED
 * VERSION: 1.0.0-REPAIR
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoredFileOperations } from '../api-restoration-service';
import { logger } from '@/lib/logger';

/**
 * RESTORED: Rename file
 * 
 * PATCH /api/files/rename
 * 
 * Request Body:
 * {
 *   "fileId": "string",
 *   "newName": "string"
 * }
 * 
 * ENHANCED FEATURES:
 * - Authentication and authorization
 * - Input validation and sanitization
 * - Rate limiting
 * - Audit logging
 * - Proper error handling
 * - Security middleware
 * - Name validation (length, special characters)
 */
export async function PATCH(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('File rename API called', { 
      method: 'PATCH', 
      path: '/api/files/rename',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.renameFile(request);
    
    const duration = Date.now() - startTime;
    logger.info('File rename API completed', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('File rename API error', { 
      error: errorMessage,
      duration,
      path: '/api/files/rename'
    });
    
    return NextResponse.json(
      { error: 'Failed to rename file', details: errorMessage },
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
    logger.info('File rename API called via POST', { 
      method: 'POST', 
      path: '/api/files/rename',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.renameFile(request);
    
    const duration = Date.now() - startTime;
    logger.info('File rename API completed via POST', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('File rename API error via POST', { 
      error: errorMessage,
      duration,
      path: '/api/files/rename'
    });
    
    return NextResponse.json(
      { error: 'Failed to rename file', details: errorMessage },
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