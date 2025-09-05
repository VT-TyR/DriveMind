
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertCircle, Loader2, Activity, Sparkles } from 'lucide-react';
import type { HealthValidationOutput } from '@/ai/flows/validate-health';
import { useAuth } from '@/contexts/auth-context';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { Badge } from '@/components/ui/badge';

export default function HealthPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [results, setResults] = React.useState<HealthValidationOutput | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();

  const handleRunChecks = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to run health checks.',
      });
      return;
    }

    setIsLoading(true);
    setResults(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/health/validate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP ${response.status}`);
      }

      const healthResults = await response.json();
      setResults(healthResults);
      
      const hasIssues = healthResults.status !== 'healthy';
      
      toast({
        title: hasIssues ? 'Health Issues Detected' : 'All Systems Healthy',
        description: hasIssues ? 'Review the validation results below and address any issues.' : 'All health checks passed successfully.',
        variant: hasIssues ? 'destructive' : 'default',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Health Check Failed',
        description: error.message || 'Could not complete health validation.',
      });
      setResults({
          status: 'unhealthy',
          overallScore: 0,
          checks: [
            { name: 'System Check', category: 'System', status: 'fail', score: 0, duration: 0, error: 'Health check execution failed' }
          ],
          timestamp: new Date(),
          recommendations: ['Health check execution failed - please try again']
      });
    }
    setIsLoading(false);
  };

  const CheckResult = ({ check }: { check: any }) => {
    if (!check) return null;
    
    const getStatusIcon = () => {
      switch (check.status) {
        case 'pass':
          return <CheckCircle2 className="size-5 text-green-500" />;
        case 'warn':
          return <AlertCircle className="size-5 text-yellow-500" />;
        case 'fail':
          return <AlertCircle className="size-5 text-destructive" />;
        default:
          return <AlertCircle className="size-5 text-gray-500" />;
      }
    };
    
    const getStatusColor = () => {
      switch (check.status) {
        case 'pass':
          return 'text-green-600';
        case 'warn':
          return 'text-yellow-600';
        case 'fail':
          return 'text-destructive';
        default:
          return 'text-gray-600';
      }
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <div className="font-medium">{check.name}</div>
            <div className={`text-sm ${getStatusColor()}`}>
              {check.details || check.error || 'No details available'}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Score: {check.score}/100
          </div>
        </div>
      </div>
    );
  };


  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Health &amp; Validation
            </h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
        </div>

        {!user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity /> Authentication Required</CardTitle>
              <CardDescription>
                Sign in with your Google account to run system health checks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Health validation requires authentication to check Drive API connectivity and permissions.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity /> System Health</CardTitle>
            <CardDescription>
              Run automated pre-flight checks to ensure the application is configured correctly for production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleRunChecks} disabled={isLoading || !user}>
                {isLoading ? <Loader2 className="mr-2 animate-spin"/> : <Activity className="mr-2"/>}
                {isLoading ? 'Running Checks...' : 'Run All Checks'}
            </Button>
            {!user && (
              <p className="text-sm text-destructive">Sign in required to run health checks</p>
            )}
            
            {results && (
              <div className="space-y-4">
                <Card className="bg-secondary/50">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">System Status</h3>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={
                            results.status === 'healthy' ? 'default' : 
                            results.status === 'degraded' ? 'secondary' : 
                            'destructive'
                          }
                        >
                          {results.status.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Score: {results.overallScore}/100
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {results.checks.map((check, index) => (
                        <CheckResult key={index} check={check} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                {results.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Recommendations</CardTitle>
                      <CardDescription>
                        Suggested actions to improve system health
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {results.recommendations.map((recommendation, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <AlertCircle className="size-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

    
