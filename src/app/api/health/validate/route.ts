import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    // Simplified health check that doesn't depend on complex flows
    const result = await performSimpleHealthCheck(decodedToken.uid, decodedToken.email);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Health validation API error:', error);
    return NextResponse.json(
      { error: 'Failed to validate system health', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function performSimpleHealthCheck(uid: string, email?: string | null) {
  const checks = [];
  let totalScore = 0;

  // Check 1: Environment Variables
  try {
    const required = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'];
    const missing = required.filter(env => !process.env[env]);
    
    const envScore = missing.length === 0 ? 100 : Math.max(0, 100 - (missing.length / required.length * 100));
    totalScore += envScore;
    
    checks.push({
      name: 'Environment Variables',
      category: 'Configuration',
      status: missing.length === 0 ? 'pass' : 'fail',
      score: envScore,
      duration: 5,
      details: missing.length === 0 ? 'All required environment variables present' : `Missing: ${missing.join(', ')}`
    });
  } catch (error) {
    checks.push({
      name: 'Environment Variables',
      category: 'Configuration', 
      status: 'fail',
      score: 0,
      duration: 5,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Check 2: Authentication
  try {
    const authScore = uid ? 100 : 0;
    totalScore += authScore;
    
    checks.push({
      name: 'Authentication',
      category: 'Security',
      status: uid ? 'pass' : 'fail',
      score: authScore,
      duration: 2,
      details: uid ? `User authenticated: ${email || 'No email'}` : 'Authentication failed'
    });
  } catch (error) {
    checks.push({
      name: 'Authentication',
      category: 'Security',
      status: 'fail',
      score: 0,
      duration: 2,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Check 3: Firebase Config
  try {
    const firebaseConfig = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
    const firebaseScore = firebaseConfig ? 100 : 0;
    totalScore += firebaseScore;
    
    checks.push({
      name: 'Firebase Configuration',
      category: 'Infrastructure',
      status: firebaseConfig ? 'pass' : 'fail',
      score: firebaseScore,
      duration: 3,
      details: firebaseConfig ? 'Firebase config available' : 'Firebase config missing'
    });
  } catch (error) {
    checks.push({
      name: 'Firebase Configuration', 
      category: 'Infrastructure',
      status: 'fail',
      score: 0,
      duration: 3,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const overallScore = Math.round(totalScore / checks.length);
  
  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (overallScore >= 85) status = 'healthy';
  else if (overallScore >= 60) status = 'degraded';
  else status = 'unhealthy';

  const recommendations: string[] = [];
  checks.forEach(check => {
    if (check.status === 'fail') {
      if (check.name.includes('Environment')) {
        recommendations.push('Check environment variable configuration in App Hosting');
      } else if (check.name.includes('Authentication')) {
        recommendations.push('Ensure user is properly signed in');
      } else if (check.name.includes('Firebase')) {
        recommendations.push('Verify Firebase configuration is properly set');
      }
    }
  });

  return {
    status,
    overallScore,
    checks,
    timestamp: new Date(),
    recommendations: recommendations.length > 0 ? recommendations : ['System is healthy']
  };
}