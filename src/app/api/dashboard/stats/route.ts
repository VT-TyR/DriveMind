import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/firebase-db';
import { auth } from '@/lib/admin';
import { cacheManager, CacheNames } from '@/lib/performance/cache-manager';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const cacheKey = `dashboard:${decodedToken.uid}`;
    
    // Try cache first
    const cachedStats = cacheManager.get(CacheNames.API_RESPONSES, cacheKey);
    if (cachedStats) {
      logger.performanceLog('dashboard_stats_cached', Date.now() - startTime);
      return NextResponse.json(cachedStats);
    }
    
    // Fetch fresh data
    const stats = await getDashboardStats(decodedToken.uid);
    
    // Cache the results
    cacheManager.set(CacheNames.API_RESPONSES, cacheKey, stats);
    
    const responseTime = Date.now() - startTime;
    logger.performanceLog('dashboard_stats_fresh', responseTime);
    
    // Add performance header
    const response = NextResponse.json(stats);
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    
    return response;
  } catch (error) {
    console.error('Dashboard stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}