'use client';

/**
 * Route protection component with graceful loading states
 * Implements ALPHA-CODENAME v1.4 security standards
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, AlertTriangle, Zap } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireDriveAuth?: boolean;
  adminOnly?: boolean;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export function RouteGuard({
  children,
  requireAuth = false,
  requireDriveAuth = false,
  adminOnly = false,
  fallback,
  redirectTo = '/dashboard',
}: RouteGuardProps) {
  const router = useRouter();
  const { 
    user, 
    loading, 
    authenticated, 
    hasValidDriveToken, 
    signInWithGoogle,
    beginDriveOAuth
  } = useAuth();

  // Show loading state while auth is being determined
  if (loading) {
    return fallback || <LoadingSkeleton />;
  }

  // Check authentication requirement
  if (requireAuth && !authenticated) {
    return <AuthenticationRequired onSignIn={signInWithGoogle} />;
  }

  // Check admin requirement
  if (adminOnly && (!user || !user.email?.endsWith('@drivemind.ai'))) {
    return <AdminRequired />;
  }

  // Check Drive authentication requirement
  if (requireDriveAuth && !hasValidDriveToken) {
    return (
      <DriveAuthRequired 
        user={user} 
        onConnect={() => user && beginDriveOAuth(user.uid)}
      />
    );
  }

  // All checks passed, render children
  return <>{children}</>;
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-24" />
          </div>
          
          {/* Content skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-8 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Authentication required component
function AuthenticationRequired({ onSignIn }: { onSignIn: () => void }) {
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await onSignIn();
    } catch (error) {
      console.error('Sign in error:', error);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Authentication Required</CardTitle>
          <CardDescription>
            Please sign in with your Google account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="w-full"
            size="lg"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in with Google'
            )}
          </Button>
          
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              By signing in, you agree to our terms of service and privacy policy.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Admin access required component
function AdminRequired() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Admin Access Required</CardTitle>
          <CardDescription>
            This page is restricted to administrators only
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to access this resource. 
              Contact support if you believe this is an error.
            </AlertDescription>
          </Alert>
          
          <Button 
            onClick={() => window.history.back()}
            variant="outline"
            className="w-full mt-4"
          >
            Go Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Drive authentication required component
function DriveAuthRequired({ 
  user, 
  onConnect 
}: { 
  user: any; 
  onConnect: () => void; 
}) {
  const [isConnecting, setIsConnecting] = React.useState(false);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      await onConnect();
      // The OAuth flow will redirect, so we don't need to handle success here
    } catch (error) {
      console.error('Drive connection error:', error);
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center mb-4">
            <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle>Connect Google Drive</CardTitle>
          <CardDescription>
            This feature requires access to your Google Drive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Signed in as {user.displayName || user.email}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="text-sm text-muted-foreground space-y-2">
            <p>DriveMind needs permission to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Read your Drive files and folders</li>
              <li>Analyze file metadata and content</li>
              <li>Organize and manage duplicates</li>
            </ul>
          </div>
          
          <Button 
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full"
            size="lg"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect Google Drive'
            )}
          </Button>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Your data remains private and secure. We never store file contents.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RouteGuard;
