
'use server';
/**
 * @fileOverview Production system health validation engine.
 * Performs comprehensive health checks across all system components including
 * Firebase, Google Drive, authentication, and external services. 
 * Implements ALPHA-CODENAME v1.4 standards.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { getOAuthClient } from '@/lib/google-auth';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { ValidateHealthInputSchema, ValidateHealthInput } from '@/lib/ai-types';
import { checkDatabaseHealth, saveHealthCheck } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { requireFreshAuth } from '@/lib/guards';


const HealthCheckResultSchema = z.object({
  name: z.string(),
  category: z.string(),
  status: z.enum(['pass', 'warn', 'fail']),
  score: z.number().min(0).max(100),
  duration: z.number(),
  details: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const HealthValidationOutputSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  overallScore: z.number().min(0).max(100),
  checks: z.array(HealthCheckResultSchema),
  timestamp: z.date(),
  recommendations: z.array(z.string())
});

export type HealthValidationOutput = z.infer<typeof HealthValidationOutputSchema>;

/**
 * Comprehensive health check implementations.
 */
async function runHealthCheck(name: string, category: string, checkFn: () => Promise<any>): Promise<z.infer<typeof HealthCheckResultSchema>> {
  const start = Date.now();
  
  try {
    const result = await checkFn();
    const duration = Date.now() - start;
    
    if (typeof result === 'object' && result !== null) {
      return {
        name,
        category,
        duration,
        ...result
      };
    }
    
    return {
      name,
      category,
      status: 'pass',
      score: 100,
      duration,
      details: 'Check completed successfully'
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      name,
      category,
      status: 'fail',
      score: 0,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkDatabase() {
  const result = await checkDatabaseHealth();
  return {
    status: result.status === 'healthy' ? 'pass' : 'fail',
    score: result.status === 'healthy' ? 100 : 0,
    details: result.status === 'healthy' ? 'Database connection healthy' : 'Database connection failed',
    metadata: result.details
  };
}

async function checkEnvironment() {
  const required = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'];
  const missing = required.filter(env => !process.env[env]);
  
  const hasAll = missing.length === 0;
  return {
    status: hasAll ? 'pass' : missing.length < required.length ? 'warn' : 'fail',
    score: hasAll ? 100 : Math.max(0, 100 - (missing.length / required.length * 100)),
    details: hasAll ? 'All required environment variables present' : `Missing: ${missing.join(', ')}`,
    metadata: { required, missing }
  };
}

async function checkDriveConnection(uid: string) {
  try {
    const drive = await driveFor(uid);
    const response = await drive.files.list({ pageSize: 1 });
    
    return {
      status: 'pass',
      score: 100,
      details: 'Google Drive API connection successful',
      metadata: { filesAccessible: true }
    };
  } catch (error: any) {
    const isAuthError = error.message?.includes('unauthorized') || error.message?.includes('invalid_grant');
    return {
      status: isAuthError ? 'fail' : 'warn',
      score: isAuthError ? 0 : 50,
      details: isAuthError ? 'Drive authentication failed - reconnection needed' : 'Drive API access limited',
      error: error.message
    };
  }
}

async function checkWritePermissions(uid: string) {
  try {
    const drive = await driveFor(uid);
    // Test write permissions with a safe operation
    await drive.files.update({ 
      fileId: 'nonexistent_test_file_id', 
      requestBody: { trashed: false } 
    });
    
    return {
      status: 'warn',
      score: 50,
      details: 'Write permission check inconclusive'
    };
  } catch (error: any) {
    if (error.message?.includes('File not found') || error.errors?.some((e: any) => e.reason === 'notFound')) {
      return {
        status: 'pass',
        score: 100,
        details: 'Write permissions verified'
      };
    }
    
    if (error.message?.includes('Insufficient Permission') || error.errors?.some((e: any) => e.reason === 'insufficientPermissions')) {
      return {
        status: 'fail',
        score: 0,
        details: 'Write permissions missing - need to re-authorize',
        error: error.message
      };
    }
    
    return {
      status: 'warn',
      score: 30,
      details: 'Write permission check failed unexpectedly',
      error: error.message
    };
  }
}


export async function validateHealth(input: ValidateHealthInput): Promise<HealthValidationOutput> {
  return validateHealthFlow(input);
}

const validateHealthFlow = ai.defineFlow(
  {
    name: 'validateHealthFlow',
    inputSchema: ValidateHealthInputSchema,
    outputSchema: HealthValidationOutputSchema,
  },
  async (input: ValidateHealthInput) => {
    const startTime = Date.now();
    
    try {
      const user = getAuthenticatedUserSync(input.auth);
      
      logger.info('Starting system health validation', { uid: user.uid });
      
      // Run all health checks in parallel
      const checks = await Promise.all([
        runHealthCheck('Database Connection', 'Infrastructure', checkDatabase),
        runHealthCheck('Environment Variables', 'Configuration', checkEnvironment),
        runHealthCheck('Google Drive API', 'External Services', () => checkDriveConnection(user.uid)),
        runHealthCheck('Write Permissions', 'Security', () => checkWritePermissions(user.uid))
      ]);
      
      // Calculate overall health
      const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
      const overallScore = Math.round(totalScore / checks.length);
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (overallScore >= 85) status = 'healthy';
      else if (overallScore >= 60) status = 'degraded';
      else status = 'unhealthy';
      
      // Generate recommendations
      const recommendations: string[] = [];
      checks.forEach(check => {
        if (check.status === 'fail') {
          if (check.name.includes('Drive')) {
            recommendations.push('Reconnect your Google Drive account');
          } else if (check.name.includes('Database')) {
            recommendations.push('Check Firebase connection and configuration');
          } else if (check.name.includes('Environment')) {
            recommendations.push('Verify environment variable configuration');
          } else if (check.name.includes('Write')) {
            recommendations.push('Re-authorize with Google Drive write permissions');
          }
        }
      });
      
      const result = {
        status,
        overallScore,
        checks,
        timestamp: new Date(),
        recommendations
      };
      
      // Save health check result
      try {
        await saveHealthCheck(user.uid, status, {
          overallScore,
          checkResults: checks,
          duration: Date.now() - startTime
        });
      } catch (saveError) {
        logger.warn('Failed to save health check result', {
          uid: user.uid,
          error: saveError instanceof Error ? saveError.message : String(saveError)
        });
      }
      
      logger.info('Health validation completed', {
        uid: user.uid,
        status,
        overallScore,
        duration: Date.now() - startTime
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Health validation failed', undefined, {
        error: error instanceof Error ? error.message : String(error),
        duration
      });
      
      return {
        status: 'unhealthy' as const,
        overallScore: 0,
        checks: [{
          name: 'System Health Check',
          category: 'System',
          status: 'fail' as const,
          score: 0,
          duration,
          error: error instanceof Error ? error.message : String(error)
        }],
        timestamp: new Date(),
        recommendations: ['System health validation failed - contact support']
      };
    }
  }
);

    
