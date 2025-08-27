'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Drive, CheckCircle2 } from 'lucide-react';

export function DriveAuth() {
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

    checkDriveStatus();

    // Check for OAuth callback results
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
  }, [searchParams, router]);

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
        }
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
          <Drive className="h-5 w-5" />
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