'use client';

/**
 * Production-ready error boundary with comprehensive error handling
 * Implements ALPHA-CODENAME v1.4 error management standards
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw, Home, Bug, Copy, CheckCircle } from 'lucide-react';
import { handleReactError, getErrorMessage, isUserFacingError } from '@/lib/error-handler';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  retryCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error info
    this.setState({ errorInfo });

    // Report error to error handling service
    handleReactError(error, errorInfo, 'ErrorBoundary');

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log detailed error information
    console.group('🚨 React Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error ID:', this.state.errorId);
    console.groupEnd();
  }

  handleRetry = () => {
    const { retryCount } = this.state;
    
    if (retryCount < this.maxRetries) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
      });

      // Add a small delay to prevent immediate re-error
      this.retryTimeout = setTimeout(() => {
        // Force component remount
        this.forceUpdate();
      }, 100);
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  copyErrorDetails = async () => {
    const { error, errorInfo, errorId } = this.state;
    
    const errorDetails = {
      errorId,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      },
      componentStack: errorInfo?.componentStack,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      // Show temporary success feedback
      const button = document.getElementById('copy-error-button');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, errorId, retryCount } = this.state;
      const canRetry = retryCount < this.maxRetries;
      const isUserError = error && isUserFacingError(error);
      const errorMessage = error ? getErrorMessage(error) : 'An unexpected error occurred';

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-destructive/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    {isUserError ? 'Something went wrong' : 'Application Error'}
                  </CardTitle>
                  <CardDescription>
                    We're sorry for the inconvenience. The error has been logged and will be investigated.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Error Message */}
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="font-medium">
                  {errorMessage}
                </AlertDescription>
              </Alert>

              {/* Error Details for Development */}
              {process.env.NODE_ENV === 'development' && error && (
                <div className="space-y-4">
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Bug className="h-4 w-4" />
                      Development Details
                    </h4>
                    <div className="bg-muted p-3 rounded-lg space-y-2">
                      <div className="text-xs font-mono">
                        <strong>Error:</strong> {error.name}: {error.message}
                      </div>
                      {errorId && (
                        <div className="text-xs font-mono">
                          <strong>Error ID:</strong> {errorId}
                        </div>
                      )}
                      <div className="text-xs font-mono">
                        <strong>Component:</strong> {errorInfo?.componentStack?.split('\n')[1]?.trim()}
                      </div>
                    </div>
                  </div>
                  
                  {error.stack && (
                    <details className="group">
                      <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                        Stack Trace
                      </summary>
                      <pre className="mt-2 text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40">
                        {error.stack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Retry Information */}
              {retryCount > 0 && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span>Retry attempts:</span>
                    <Badge variant="outline">
                      {retryCount} / {this.maxRetries}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                {canRetry && (
                  <Button onClick={this.handleRetry} className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again ({this.maxRetries - retryCount} left)
                  </Button>
                )}
                
                <Button 
                  onClick={this.handleGoHome} 
                  variant={canRetry ? "outline" : "default"}
                  className="flex-1"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Button>
                
                <Button onClick={this.handleReload} variant="outline" className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload Page
                </Button>
              </div>

              {/* Support Actions */}
              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Need help?</span>
                  <Button
                    id="copy-error-button"
                    onClick={this.copyErrorDetails}
                    variant="outline"
                    size="sm"
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    Copy Error Details
                  </Button>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  If this problem persists, please contact support with the error details above.
                  Error ID: <code className="bg-muted px-1 py-0.5 rounded">{errorId}</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional wrapper with hooks support
export function ErrorBoundaryProvider({ 
  children, 
  fallback,
  onError 
}: {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}) {
  return (
    <ErrorBoundary fallback={fallback} onError={onError}>
      {children}
    </ErrorBoundary>
  );
}

// Hook for triggering errors in development/testing
export function useErrorHandler() {
  const throwError = (error: string | Error) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    throw errorObj;
  };

  const throwAsyncError = async (error: string | Error) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    // Use setTimeout to make it async and uncaught
    setTimeout(() => {
      throw errorObj;
    }, 0);
  };

  return { throwError, throwAsyncError };
}

export default ErrorBoundary;
