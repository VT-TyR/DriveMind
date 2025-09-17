/**
 * Live Dashboard API Endpoint
 * ALPHA-CODENAME Production Gate Requirement
 * Provides comprehensive real-time metrics for production dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { dashboardMetricsService } from '@/lib/dashboard-metrics';
import { rateLimiters } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import crypto from 'crypto';

// Request validation schema
const DashboardQuerySchema = z.object({
  section: z.enum(['all', 'system', 'business', 'security', 'ux', 'infrastructure', 'alerts']).optional(),
  refresh: z.enum(['true', 'false']).optional(),
  format: z.enum(['json', 'prometheus']).optional()
});

export async function GET(request: NextRequest) {
  return rateLimiters.read(request, async (req) => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      // Parse and validate query parameters
      const searchParams = req.nextUrl.searchParams;
      const queryParams = {
        section: searchParams.get('section'),
        refresh: searchParams.get('refresh'),
        format: searchParams.get('format')
      };
      
      const parsed = DashboardQuerySchema.safeParse(queryParams);
      if (!parsed.success) {
        logger.warn('Invalid dashboard query parameters', {
          requestId,
          errors: parsed.error.errors,
          params: queryParams
        });
        
        return NextResponse.json(
          { 
            error: 'Invalid query parameters',
            details: parsed.error.errors,
            requestId 
          },
          { status: 400 }
        );
      }

      const { section = 'all', refresh = 'false', format = 'json' } = parsed.data;
      const forceRefresh = refresh === 'true';

      // Get metrics - use cache unless forced refresh
      let metrics;
      if (forceRefresh) {
        dashboardMetricsService.invalidateCache();
        metrics = await dashboardMetricsService.collectMetrics();
      } else {
        metrics = dashboardMetricsService.getCachedMetrics();
        if (!metrics) {
          metrics = await dashboardMetricsService.collectMetrics();
        }
      }

      // Filter response based on requested section
      let responseData: any = metrics;
      if (section !== 'all') {
        switch (section) {
          case 'system':
            responseData = {
              timestamp: metrics.timestamp,
              system: metrics.system
            };
            break;
          case 'business':
            responseData = {
              timestamp: metrics.timestamp,
              business: metrics.business
            };
            break;
          case 'security':
            responseData = {
              timestamp: metrics.timestamp,
              security: metrics.security
            };
            break;
          case 'ux':
            responseData = {
              timestamp: metrics.timestamp,
              userExperience: metrics.userExperience
            };
            break;
          case 'infrastructure':
            responseData = {
              timestamp: metrics.timestamp,
              infrastructure: metrics.infrastructure
            };
            break;
          case 'alerts':
            responseData = {
              timestamp: metrics.timestamp,
              alerts: dashboardMetricsService.getAlerts()
            };
            break;
        }
      } else {
        // Include alerts in full response
        responseData = {
          ...metrics,
          alerts: dashboardMetricsService.getAlerts()
        };
      }

      const responseTime = Date.now() - startTime;

      // Return Prometheus format if requested
      if (format === 'prometheus') {
        const prometheusMetrics = generatePrometheusMetrics(metrics, responseTime);
        
        logger.info('Dashboard metrics served (Prometheus)', {
          requestId,
          section,
          responseTime,
          refresh: forceRefresh
        });

        return new NextResponse(prometheusMetrics, {
          headers: {
            'Content-Type': 'text/plain; version=0.0.4',
            'X-Request-ID': requestId,
            'X-Response-Time': responseTime.toString(),
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      }

      // Return JSON format (default)
      const response = {
        requestId,
        ...responseData,
        meta: {
          responseTime,
          cached: !forceRefresh && section === 'all',
          section,
          compliance: {
            alpha_codename: 'v1.8',
            aei21: 'compliant'
          }
        }
      };

      logger.info('Dashboard metrics served', {
        requestId,
        section,
        responseTime,
        refresh: forceRefresh,
        dataSize: JSON.stringify(responseData).length
      });

      return NextResponse.json(response, {
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': responseTime.toString(),
          'Cache-Control': forceRefresh ? 'no-cache' : 'public, max-age=30',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Dashboard metrics request failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseTime
      });

      return NextResponse.json(
        {
          error: 'Failed to retrieve dashboard metrics',
          message: error instanceof Error ? error.message : 'Unknown error',
          requestId,
          timestamp: new Date().toISOString()
        },
        { 
          status: 500,
          headers: {
            'X-Request-ID': requestId,
            'X-Response-Time': responseTime.toString()
          }
        }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return rateLimiters.api(request, async (req) => {
    const requestId = crypto.randomUUID();
    
    try {
      const body = await req.json();
      
      // Handle alert acknowledgment
      if (body.action === 'acknowledge_alert' && body.alertId) {
        const success = dashboardMetricsService.acknowledgeAlert(body.alertId);
        
        if (success) {
          logger.info('Alert acknowledged', {
            requestId,
            alertId: body.alertId
          });
          
          return NextResponse.json({
            success: true,
            message: 'Alert acknowledged',
            requestId,
            timestamp: new Date().toISOString()
          });
        } else {
          return NextResponse.json(
            { 
              error: 'Alert not found',
              requestId 
            },
            { status: 404 }
          );
        }
      }

      // Handle cache invalidation
      if (body.action === 'invalidate_cache') {
        dashboardMetricsService.invalidateCache();
        
        logger.info('Dashboard cache invalidated', { requestId });
        
        return NextResponse.json({
          success: true,
          message: 'Cache invalidated',
          requestId,
          timestamp: new Date().toISOString()
        });
      }

      return NextResponse.json(
        { 
          error: 'Invalid action',
          requestId 
        },
        { status: 400 }
      );

    } catch (error) {
      logger.error('Dashboard POST request failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return NextResponse.json(
        {
          error: 'Request failed',
          requestId,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * Generate Prometheus-compatible metrics format
 */
function generatePrometheusMetrics(metrics: any, responseTime: number): string {
  const timestamp = Date.now();
  
  return [
    `# HELP drivemind_dashboard_info Dashboard information`,
    `# TYPE drivemind_dashboard_info gauge`,
    `drivemind_dashboard_info{version="1.3.0",environment="${process.env.NODE_ENV || 'production'}"} 1 ${timestamp}`,
    ``,
    `# HELP drivemind_system_uptime_seconds System uptime in seconds`,
    `# TYPE drivemind_system_uptime_seconds gauge`,
    `drivemind_system_uptime_seconds ${metrics.system.uptime} ${timestamp}`,
    ``,
    `# HELP drivemind_response_time_ms Average response time in milliseconds`,
    `# TYPE drivemind_response_time_ms gauge`,
    `drivemind_response_time_ms ${metrics.system.responseTime} ${timestamp}`,
    ``,
    `# HELP drivemind_error_rate_percent Error rate percentage`,
    `# TYPE drivemind_error_rate_percent gauge`,
    `drivemind_error_rate_percent ${metrics.system.errorRate} ${timestamp}`,
    ``,
    `# HELP drivemind_memory_usage_mb Memory usage in megabytes`,
    `# TYPE drivemind_memory_usage_mb gauge`,
    `drivemind_memory_usage_mb{type="heap_used"} ${metrics.system.memoryUsage.heapUsed} ${timestamp}`,
    `drivemind_memory_usage_mb{type="heap_total"} ${metrics.system.memoryUsage.heapTotal} ${timestamp}`,
    `drivemind_memory_usage_mb{type="external"} ${metrics.system.memoryUsage.external} ${timestamp}`,
    ``,
    `# HELP drivemind_active_users Active users count`,
    `# TYPE drivemind_active_users gauge`,
    `drivemind_active_users ${metrics.business.activeUsers} ${timestamp}`,
    ``,
    `# HELP drivemind_files_processed_total Total files processed`,
    `# TYPE drivemind_files_processed_total counter`,
    `drivemind_files_processed_total ${metrics.business.filesProcessed} ${timestamp}`,
    ``,
    `# HELP drivemind_security_score Security score out of 100`,
    `# TYPE drivemind_security_score gauge`,
    `drivemind_security_score ${metrics.security.securityScore} ${timestamp}`,
    ``,
    `# HELP drivemind_auth_success_rate_percent Authentication success rate percentage`,
    `# TYPE drivemind_auth_success_rate_percent gauge`,
    `drivemind_auth_success_rate_percent ${metrics.business.authSuccessRate} ${timestamp}`,
    ``,
    `# HELP drivemind_infrastructure_status Infrastructure component status (1=healthy, 0.5=degraded, 0=unhealthy)`,
    `# TYPE drivemind_infrastructure_status gauge`,
    `drivemind_infrastructure_status{component="firebase"} ${getStatusValue(metrics.infrastructure.firebase.status)} ${timestamp}`,
    `drivemind_infrastructure_status{component="cloud_functions"} ${getStatusValue(metrics.infrastructure.cloudFunctions.status)} ${timestamp}`,
    `drivemind_infrastructure_status{component="database"} ${getStatusValue(metrics.infrastructure.database.status)} ${timestamp}`,
    `drivemind_infrastructure_status{component="oauth"} ${getStatusValue(metrics.infrastructure.oauth.status)} ${timestamp}`,
    ``,
    `# HELP drivemind_dashboard_response_time_ms Dashboard API response time`,
    `# TYPE drivemind_dashboard_response_time_ms gauge`,
    `drivemind_dashboard_response_time_ms ${responseTime} ${timestamp}`,
  ].join('\n');
}

/**
 * Convert status string to numeric value for Prometheus
 */
function getStatusValue(status: string): number {
  switch (status) {
    case 'healthy': return 1;
    case 'degraded': return 0.5;
    case 'unhealthy': return 0;
    default: return 0;
  }
}