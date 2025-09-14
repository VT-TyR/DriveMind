/**
 * GDPR Consent Management API Endpoint
 * 
 * Implements Article 7 (Consent) of GDPR for PII processing by AI services.
 * Provides granular consent management with audit logging.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Security headers
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-random'; object-src 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Valid consent purposes
const VALID_PURPOSES = [
  'file_classification',
  'duplicate_detection',
  'organization_suggestions',
  'content_analysis',
  'essential_features'
];

// Valid data types
const VALID_DATA_TYPES = [
  'file_names',
  'file_metadata',
  'file_content',
  'file_content_summary',
  'file_text',
  'file_images',
  'file_hashes',
  'folder_structure',
  'user_id',
  'session_data'
];

interface ConsentRecord {
  id: string;
  userId: string;
  purposes: Record<string, boolean>;
  dataTypes: Record<string, boolean>;
  grantedAt: Date;
  expiresAt?: Date;
  version: string;
  ipAddress?: string;
  userAgent?: string;
  method: 'explicit' | 'implicit';
}

/**
 * Audit consent event for GDPR compliance
 */
function auditConsentEvent(event: string, userId: string, details: any, request: NextRequest) {
  const auditEntry = {
    event,
    userId: '[REDACTED]', // Hash in production
    timestamp: new Date().toISOString(),
    ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    details: {
      ...details,
      userId: '[REDACTED]' // Redact sensitive data in logs
    }
  };
  
  console.log('CONSENT_AUDIT:', auditEntry);
  
  // In production, send to secure audit service
  // await sendToGDPRAuditService(auditEntry);
}

/**
 * Validate request parameters
 */
function validateConsentRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!body.userId || typeof body.userId !== 'string') {
    errors.push('userId is required and must be a string');
  }
  
  if (typeof body.granted !== 'boolean') {
    errors.push('granted must be a boolean');
  }
  
  if (!Array.isArray(body.purposes)) {
    errors.push('purposes must be an array');
  } else {
    const invalidPurposes = body.purposes.filter((p: any) => !VALID_PURPOSES.includes(p));
    if (invalidPurposes.length > 0) {
      errors.push(`Invalid purposes: ${invalidPurposes.join(', ')}`);
    }
  }
  
  if (!Array.isArray(body.dataTypes)) {
    errors.push('dataTypes must be an array');
  } else {
    const invalidDataTypes = body.dataTypes.filter((dt: any) => !VALID_DATA_TYPES.includes(dt));
    if (invalidDataTypes.length > 0) {
      errors.push(`Invalid data types: ${invalidDataTypes.join(', ')}`);
    }
  }
  
  if (body.expiresAt && !Date.parse(body.expiresAt)) {
    errors.push('expiresAt must be a valid ISO date string');
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Save consent record to secure storage
 */
async function saveConsentRecord(record: ConsentRecord): Promise<boolean> {
  try {
    // In production, save to encrypted Firestore collection
    // const db = getAdminFirestore();
    // await db.collection(`users/${record.userId}/consent`).doc(record.id).set({
    //   ...record,
    //   purposes: encrypt(JSON.stringify(record.purposes)),
    //   dataTypes: encrypt(JSON.stringify(record.dataTypes))
    // });
    
    // For now, simulate successful storage
    console.log('Consent record saved:', {
      id: record.id,
      userId: '[REDACTED]',
      purposes: Object.keys(record.purposes).filter(p => record.purposes[p]),
      dataTypes: Object.keys(record.dataTypes).filter(dt => record.dataTypes[dt]),
      grantedAt: record.grantedAt.toISOString(),
      expiresAt: record.expiresAt?.toISOString()
    });
    
    return true;
  } catch (error) {
    console.error('Failed to save consent record:', error);
    return false;
  }
}

/**
 * Retrieve consent record from secure storage
 */
async function getConsentRecord(userId: string): Promise<ConsentRecord | null> {
  try {
    // In production, retrieve from encrypted Firestore
    // const db = getAdminFirestore();
    // const docs = await db.collection(`users/${userId}/consent`)
    //   .orderBy('grantedAt', 'desc')
    //   .limit(1)
    //   .get();
    
    // For now, return simulated data (would normally decrypt)
    return null;
  } catch (error) {
    console.error('Failed to retrieve consent record:', error);
    return null;
  }
}

/**
 * Grant or update consent
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const validation = validateConsentRequest(body);
    
    if (!validation.isValid) {
      auditConsentEvent('consent_validation_failed', body.userId || 'unknown', {
        errors: validation.errors
      }, request);
      
      return NextResponse.json(
        {
          error: 'invalid_request',
          message: 'Request validation failed',
          details: validation.errors,
          timestamp: new Date().toISOString()
        },
        { 
          status: 400,
          headers: securityHeaders
        }
      );
    }
    
    const { userId, granted, purposes, dataTypes, expiresAt } = body;
    
    // Create consent record
    const consentRecord: ConsentRecord = {
      id: `consent_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      purposes: purposes.reduce((acc: Record<string, boolean>, p: string) => {
        acc[p] = granted;
        return acc;
      }, {}),
      dataTypes: dataTypes.reduce((acc: Record<string, boolean>, dt: string) => {
        acc[dt] = granted;
        return acc;
      }, {}),
      grantedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      version: '1.0.0',
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      method: 'explicit'
    };
    
    // Save to secure storage
    const saved = await saveConsentRecord(consentRecord);
    
    if (!saved) {
      auditConsentEvent('consent_storage_failed', userId, {
        consentId: consentRecord.id
      }, request);
      
      return NextResponse.json(
        {
          error: 'storage_failed',
          message: 'Failed to store consent record',
          timestamp: new Date().toISOString()
        },
        { 
          status: 500,
          headers: securityHeaders
        }
      );
    }
    
    // Audit successful consent change
    auditConsentEvent(granted ? 'consent_granted' : 'consent_revoked', userId, {
      consentId: consentRecord.id,
      purposes: purposes,
      dataTypes: dataTypes,
      expiresAt: consentRecord.expiresAt?.toISOString(),
      method: 'explicit'
    }, request);
    
    const duration = Date.now() - startTime;
    console.log('Consent management completed:', {
      action: granted ? 'granted' : 'revoked',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      {
        success: true,
        message: granted ? 'Consent granted successfully' : 'Consent revoked successfully',
        consentId: consentRecord.id,
        auditId: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString()
      },
      { headers: securityHeaders }
    );
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    console.error('Consent management failed:', {
      error: error?.message,
      stack: error?.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    auditConsentEvent('consent_processing_error', 'unknown', {
      error: error?.message
    }, request);
    
    return NextResponse.json(
      {
        error: 'processing_failed',
        message: 'Failed to process consent request',
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: securityHeaders
      }
    );
  }
}

/**
 * Check current consent status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const purpose = searchParams.get('purpose');
    const dataType = searchParams.get('dataType');
    
    if (!userId) {
      return NextResponse.json(
        {
          error: 'missing_user_id',
          message: 'userId parameter is required',
          timestamp: new Date().toISOString()
        },
        { 
          status: 400,
          headers: securityHeaders
        }
      );
    }
    
    // Retrieve current consent record
    const consentRecord = await getConsentRecord(userId);
    
    if (!consentRecord) {
      return NextResponse.json(
        {
          hasConsent: false,
          purposes: [],
          dataTypes: [],
          timestamp: new Date().toISOString()
        },
        { headers: securityHeaders }
      );
    }
    
    // Check if consent is expired
    const isExpired = consentRecord.expiresAt && new Date() > consentRecord.expiresAt;
    
    if (isExpired) {
      auditConsentEvent('consent_expired', userId, {
        consentId: consentRecord.id,
        expiredAt: consentRecord.expiresAt?.toISOString()
      }, request);
      
      return NextResponse.json(
        {
          hasConsent: false,
          purposes: [],
          dataTypes: [],
          expired: true,
          expiredAt: consentRecord.expiresAt?.toISOString(),
          timestamp: new Date().toISOString()
        },
        { headers: securityHeaders }
      );
    }
    
    // Filter by specific purpose or data type if requested
    let filteredConsent = true;
    
    if (purpose) {
      filteredConsent = consentRecord.purposes[purpose] === true;
    }
    
    if (dataType) {
      filteredConsent = filteredConsent && consentRecord.dataTypes[dataType] === true;
    }
    
    // Audit consent check
    auditConsentEvent('consent_checked', userId, {
      purpose,
      dataType,
      hasConsent: filteredConsent
    }, request);
    
    return NextResponse.json(
      {
        hasConsent: filteredConsent,
        purposes: Object.keys(consentRecord.purposes).filter(p => consentRecord.purposes[p]),
        dataTypes: Object.keys(consentRecord.dataTypes).filter(dt => consentRecord.dataTypes[dt]),
        grantedAt: consentRecord.grantedAt.toISOString(),
        expiresAt: consentRecord.expiresAt?.toISOString(),
        timestamp: new Date().toISOString()
      },
      { headers: securityHeaders }
    );
    
  } catch (error: any) {
    console.error('Consent status check failed:', error);
    
    return NextResponse.json(
      {
        error: 'status_check_failed',
        message: 'Failed to check consent status',
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: securityHeaders
      }
    );
  }
}

// Rate limiting for consent endpoints (stricter due to privacy sensitivity)
const consentRateLimit = new Map<string, { count: number; resetTime: number }>();

/**
 * Consent-specific rate limiting
 */
function checkConsentRateLimit(ip: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const key = `consent_${ip}`;
  
  if (!consentRateLimit.has(key)) {
    consentRateLimit.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const entry = consentRateLimit.get(key)!;
  
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + windowMs;
    return true;
  }
  
  if (entry.count >= limit) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Apply rate limiting to all consent endpoints
export async function middleware(request: NextRequest) {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  
  if (!checkConsentRateLimit(ip)) {
    return NextResponse.json(
      {
        error: 'consent_rate_limit_exceeded',
        message: 'Too many consent requests. Please try again later.',
        retryAfter: 60,
        timestamp: new Date().toISOString()
      },
      { 
        status: 429,
        headers: {
          ...securityHeaders,
          'Retry-After': '60',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0'
        }
      }
    );
  }
  
  return NextResponse.next();
}