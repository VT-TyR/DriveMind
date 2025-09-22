'use client';

import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Shield, Key, Trash2, Search, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { logger } from '@/lib/logger';

export default function DriveTokensAdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { handleAsyncError } = useErrorHandler({ component: 'DriveTokensAdminPage', userId: user?.uid });
  const [uid, setUid] = React.useState('');
  const [info, setInfo] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [adminToken, setAdminToken] = React.useState('');

  React.useEffect(() => {
    const stored = window.localStorage.getItem('admin_api_token');
    if (stored) setAdminToken(stored);
    
    if (user) {
      logger.info('Admin page accessed', {
        userId: user.uid,
        page: 'drive-tokens-admin'
      });
    }
  }, [user]);

  const fetchInfo = async () => {
    if (!uid.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please enter a valid user UID.',
      });
      return;
    }

    if (!adminToken.trim()) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please enter your admin API token.',
      });
      return;
    }

    setError(null);
    setLoading(true);
    
    try {
      const headers: Record<string, string> = {
        'x-admin-token': adminToken
      };
      const res = await fetch(`/api/admin/drive-tokens?uid=${encodeURIComponent(uid)}`, { headers });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch token information');
      }
      
      setInfo(data);
      logger.info('Drive token info fetched', {
        userId: user?.uid,
        targetUid: uid,
        hasToken: data.hasToken
      });
      
      toast({
        title: 'Token Information Retrieved',
        description: `Successfully retrieved token information for user ${uid}.`,
      });
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to fetch token information';
      setError(errorMessage);
      await handleAsyncError(e, {
        operation: 'fetchTokenInfo',
        targetUid: uid
      });
      toast({
        variant: 'destructive',
        title: 'Failed to Fetch Token Information',
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const clearToken = async () => {
    if (!uid.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please enter a valid user UID.',
      });
      return;
    }

    if (!adminToken.trim()) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please enter your admin API token.',
      });
      return;
    }

    if (!confirm(`Are you sure you want to clear the Drive token for user ${uid}? This action cannot be undone.`)) {
      return;
    }

    setError(null);
    setLoading(true);
    
    try {
      const res = await fetch('/api/admin/drive-tokens', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ uid }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to clear token');
      }
      
      setInfo(null);
      
      logger.info('Drive token cleared', {
        userId: user?.uid,
        targetUid: uid
      });
      
      toast({
        title: 'Token Cleared Successfully',
        description: `Drive token has been cleared for user ${uid}.`,
      });
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to clear token';
      setError(errorMessage);
      await handleAsyncError(e, {
        operation: 'clearToken',
        targetUid: uid
      });
      toast({
        variant: 'destructive',
        title: 'Failed to Clear Token',
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const saveAdminToken = () => {
    if (!adminToken.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please enter a valid admin token.',
      });
      return;
    }
    
    window.localStorage.setItem('admin_api_token', adminToken);
    toast({
      title: 'Token Saved',
      description: 'Admin token has been saved to local storage.',
    });
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="text-destructive" />
                Access Denied
              </CardTitle>
              <CardDescription>
                Please sign in to access the admin panel.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Drive Tokens Admin
            </h2>
            <Badge variant="destructive">Admin Only</Badge>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="text-primary" />
              Admin Authentication
            </CardTitle>
            <CardDescription>
              Provide your admin API token to authorize administrative requests. The token is stored locally in your browser for convenience.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-token">Admin API Token</Label>
              <div className="flex gap-2">
                <Input
                  id="admin-token"
                  type="password"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  placeholder="Enter admin API token"
                  className="flex-1"
                />
                <Button onClick={saveAdminToken} variant="outline" disabled={!adminToken.trim()}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Token
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="text-primary" />
              User Token Management
            </CardTitle>
            <CardDescription>
              Enter a user UID to view or clear their stored Google Drive refresh token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-uid">User UID</Label>
              <div className="flex gap-2">
                <Input
                  id="user-uid"
                  value={uid}
                  onChange={(e) => setUid(e.target.value)}
                  placeholder="Enter user UID to lookup"
                  className="flex-1"
                />
                <Button onClick={fetchInfo} disabled={!uid.trim() || loading}>
                  <Search className="h-4 w-4 mr-2" />
                  {loading ? 'Searching...' : 'Fetch Info'}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {info && (
              <Card className="bg-secondary/50">
                <CardHeader>
                  <CardTitle className="text-lg">Token Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">User UID:</span>
                      <span className="ml-2 font-mono">{info.uid}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Has Token:</span>
                      <Badge 
                        variant={info.hasToken ? "default" : "destructive"} 
                        className="ml-2"
                      >
                        {info.hasToken ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    {info.updatedAt && (
                      <div className="md:col-span-2">
                        <span className="text-muted-foreground">Last Updated:</span>
                        <span className="ml-2 font-mono">{new Date(info.updatedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  
                  {info.hasToken && (
                    <div className="pt-4 border-t">
                      <Button 
                        onClick={clearToken} 
                        variant="destructive" 
                        disabled={loading}
                        className="w-full sm:w-auto"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear Drive Token
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        This will revoke the user&apos;s Google Drive access and require them to reconnect.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
