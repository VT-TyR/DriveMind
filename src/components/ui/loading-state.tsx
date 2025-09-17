/**
 * @fileoverview Loading state component with timeout and error recovery
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  timeout?: number; // milliseconds
  onTimeout?: () => void;
  onRetry?: () => void;
  children?: React.ReactNode;
}

export function LoadingState({ 
  message = 'Loading...', 
  timeout = 30000, // 30 seconds default
  onTimeout,
  onRetry,
  children 
}: LoadingStateProps) {
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    if (!timeout) return;

    const timer = setTimeout(() => {
      setHasTimedOut(true);
      onTimeout?.();
    }, timeout);

    return () => clearTimeout(timer);
  }, [timeout, onTimeout]);

  if (hasTimedOut) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Loading Timeout</AlertTitle>
          <AlertDescription className="mt-2">
            The request is taking longer than expected. This might be due to a slow connection or server issues.
          </AlertDescription>
        </Alert>
        {onRetry && (
          <Button 
            onClick={() => {
              setHasTimedOut(false);
              onRetry();
            }} 
            variant="outline" 
            className="mt-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
      <h3 className="text-lg font-medium mb-2">Loading</h3>
      <p className="text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}