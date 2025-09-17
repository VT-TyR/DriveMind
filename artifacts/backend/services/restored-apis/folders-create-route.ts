/**
 * @fileoverview RESTORED: Folder Create API Endpoint
 * 
 * ORIGINAL LOCATION: src/app/api-disabled/folders/create/route.ts
 * STATUS: RESTORED AND ENHANCED
 * VERSION: 1.0.0-REPAIR
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoredFileOperations } from '../api-restoration-service';
import { logger } from '@/lib/logger';

/**
 * RESTORED: Create new folder
 * 
 * POST /api/folders/create
 * 
 * Request Body:
 * {
 *   "name": "string",
 *   "parentId": "string" (optional, default: "root")
 * }
 * 
 * ENHANCED FEATURES:
 * - Authentication and authorization
 * - Input validation and sanitization
 * - Rate limiting
 * - Audit logging
 * - Proper error handling
 * - Security middleware
 * - Name validation and duplicate checking
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('Folder create API called', { 
      method: 'POST', 
      path: '/api/folders/create',
      timestamp: startTime 
    });
    
    // Use the enhanced restoration service
    const response = await restoredFileOperations.createFolder(request);
    
    const duration = Date.now() - startTime;
    logger.info('Folder create API completed', { 
      duration,
      status: response.status 
    });
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Folder create API error', { 
      error: errorMessage,
      duration,
      path: '/api/folders/create'
    });
    
    return NextResponse.json(
      { error: 'Failed to create folder', details: errorMessage },
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

export async function PATCH() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405, headers: { Allow: 'POST' } }
  );
}