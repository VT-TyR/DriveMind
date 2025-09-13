'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
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
  const pathname = usePathname();

  // Check drive connection status on mount and URL changes
  useEffect(() => {
    const checkDriveStatus = async () => {
      try {
        const headers: HeadersInit = {};
        
        // Include Firebase auth token if user is authenticated
        if (user) {
          try {
            const token = await user.getIdToken();
            headers.Authorization = `Bearer ${token}`;
          } catch (error) {
            console.warn('Failed to get Firebase ID token:', error);
          }
        }
        
        const response = await fetch('/api/auth/drive/status', { headers });
        const result = await response.json();
        console.log('Drive status check result:', result);
        
        setDriveConnected(result.connected);
        
        if (!result.connected && result.error) {
          console.warn('Drive not connected:', result.error);
        }
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
          // Clean up URL parameters by reloading the page without query params
          window.location.href = pathname;
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
      window.location.href = pathname;
      return;
    }

    // Run token sync if user is authenticated but status is unknown
    const syncTokens = async () => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/auth/drive/sync', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          const result = await response.json();
          console.log('Token sync result:', result);
          
          if (result.synced && result.hasToken) {
            setDriveConnected(true);
            setError(null);
          }
        } catch (error) {
          console.warn('Token sync failed:', error);
        }
      }
    };

    // Check status first, then sync if needed
    checkDriveStatus().then(() => {
      // If not connected but user is authenticated, try syncing tokens
      if (user && !driveConnected && !checking) {
        syncTokens();
      }
    });

    // Check for processed OAuth callback results (from API routes)
    const driveConnectedParam = searchParams.get('drive_connected');
    const errorParam = searchParams.get('error');
    
    if (driveConnectedParam === 'true') {
      setDriveConnected(true);
      setError(null);
      // Clean up URL parameters by reloading the page without query params
      window.location.href = pathname;
    } else if (errorParam) {
      setError(`Connection failed: ${errorParam.replace(/_/g, ' ')}`);
    }
  }, [searchParams, router, driveConnecting, user, pathname]);

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