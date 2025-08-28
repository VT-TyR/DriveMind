'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, HardDrive, CheckCircle2 } from 'lucide-react';

function DriveAuthInternal() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check drive connection status on mount and URL changes
  useEffect(() => {
    const checkDriveStatus = async () => {
      try {
        const response = await fetch('/api/auth/drive/status');
        const { connected } = await response.json();
        setDriveConnected(connected);
      } catch (error) {
        console.error('Failed to check Drive status:', error);
      } finally {
        setChecking(false);
      }
    };

    // Handle OAuth callback if we receive code parameter (direct callback from Google)
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');
    
    if (code && !driveConnecting) {
      // We received OAuth callback directly - process it
      setDriveConnecting(true);
      console.log('Processing OAuth callback with code:', !!code, 'state:', state);
      
      fetch('/api/auth/drive/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      }).then(async (response) => {
        if (response.ok) {
          setDriveConnected(true);
          setError(null);
          // Clean up URL parameters
          router.replace(window.location.pathname);
        } else {
          const errorData = await response.json();
          setError(`Connection failed: ${errorData.error || 'Unknown error'}`);
        }
      }).catch((error) => {
        console.error('OAuth callback processing failed:', error);
        setError('Connection failed: Unable to process callback');
      }).finally(() => {
        setDriveConnecting(false);
      });
      
      return; // Don't run normal status check when processing callback
    }

    // Handle OAuth errors from Google
    if (oauthError) {
      console.error('OAuth error from Google:', oauthError);
      setError(`Connection failed: ${oauthError.replace(/_/g, ' ')}`);
      router.replace(window.location.pathname);
      return;
    }

    checkDriveStatus();

    // Check for processed OAuth callback results (from API routes)
    const driveConnectedParam = searchParams.get('drive_connected');
    const errorParam = searchParams.get('error');
    
    if (driveConnectedParam === 'true') {
      setDriveConnected(true);
      setError(null);
      // Clean up URL parameters
      router.replace(window.location.pathname);
    } else if (errorParam) {
      setError(`Connection failed: ${errorParam.replace(/_/g, ' ')}`);
    }
  }, [searchParams, router, driveConnecting]);

  const handleConnectToDrive = async () => {
    if (!user) {
      // First sign in with Firebase Auth
      try {
        await signInWithGoogle();
      } catch (error) {
        setError('Failed to sign in with Google');
        return;
      }
    }

    // Then connect to Google Drive
    setDriveConnecting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/drive/begin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user?.uid || null })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start Drive connection');
      }

      const { url } = await response.json();
      
      // Redirect to Google OAuth
      window.location.href = url;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to connect to Google Drive');
      setDriveConnecting(false);
    }
  };

  if (authLoading || checking) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Connect to Google Drive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in with Google to access your Drive files
            </p>
            <Button 
              onClick={handleConnectToDrive}
              className="w-full"
              disabled={driveConnecting}
            >
              {driveConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Sign in & Connect to Drive'
              )}
            </Button>
          </div>
        ) : driveConnected ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>Connected to Google Drive</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Google Drive to access and manage your files
            </p>
            <Button 
              onClick={handleConnectToDrive}
              className="w-full"
              disabled={driveConnecting}
            >
              {driveConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect to Google Drive'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DriveAuth() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </CardContent>
      </Card>
    }>
      <DriveAuthInternal />
    </Suspense>
  );
}
