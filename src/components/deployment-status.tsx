'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

export function DeploymentStatus() {
  const [status, setStatus] = useState<'checking' | 'degraded' | 'healthy'>('checking');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const checkAIStatus = async () => {
      try {
        const response = await fetch('/api/ai/health-check');
        const { hasApiKey } = await response.json();
        setStatus(hasApiKey ? 'healthy' : 'degraded');
      } catch (error) {
        console.error('Health check failed:', error);
        setStatus('degraded');
      }
    };

    checkAIStatus();
  }, [retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setStatus('checking');
  };

  if (status === 'checking') {
    return (
      <Alert>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <AlertDescription>
          Checking system status...
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'healthy') {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          All systems operational. AI features are available.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-orange-700">
          <AlertTriangle className="h-4 w-4" />
          Limited Functionality
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert variant="destructive" className="border-orange-300 bg-orange-50">
          <AlertDescription className="text-orange-800">
            AI features are currently running in fallback mode due to a deployment configuration issue.
            Basic Google Drive functionality remains available.
          </AlertDescription>
        </Alert>
        
        <div className="space-y-2 text-sm text-muted-foreground">
          <p><strong>What's working:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Google Drive authentication and file access</li>
            <li>File browsing and basic management</li>
            <li>Duplicate detection (basic algorithm)</li>
            <li>File organization tools</li>
          </ul>
          
          <p className="mt-3"><strong>Temporarily limited:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>AI-powered file classification</li>
            <li>Smart cleanup recommendations</li>
            <li>Intelligent file organization rules</li>
          </ul>
        </div>

        <div className="flex gap-2 pt-2">
          <Button 
            onClick={handleRetry}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            Check Again
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          This is a temporary deployment issue. The development team has been notified.
        </p>
      </CardContent>
    </Card>
  );
}