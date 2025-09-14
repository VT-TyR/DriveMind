'use client';

/**
 * Enhanced dashboard with comprehensive metrics and AI integration
 * Implements ALPHA-CODENAME v1.4 standards
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { RouteGuard } from '@/components/auth/route-guard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-provider';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import apiClient from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { 
  Files, 
  Copy, 
  HardDrive, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Activity,
  Clock,
  Database,
  Zap,
  RefreshCw,
  Play,
  Pause,
  BarChart3
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  totalFiles: number;
  duplicateFiles: number;
  totalSize: number;
  recentActivity: number;
  vaultCandidates: number;
  cleanupSuggestions: number;
  qualityScore: number;
  lastScanTime?: string;
  scanStatus: 'idle' | 'scanning' | 'complete' | 'error';
  scanProgress?: number;
  scanId?: string;
}

interface RecentActivity {
  id: string;
  type: 'scan' | 'duplicate_detection' | 'organization' | 'ai_analysis';
  description: string;
  timestamp: string;
  status: 'completed' | 'failed' | 'in_progress';
}

export default function DashboardPage() {
  const { user, getIdToken } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalFiles: 0,
    duplicateFiles: 0,
    totalSize: 0,
    recentActivity: 0,
    vaultCandidates: 0,
    cleanupSuggestions: 0,
    qualityScore: 0,
    scanStatus: 'idle',
  });
  
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scanPollingInterval, setScanPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Configure API client with auth
  React.useEffect(() => {
    if (user) {
      apiClient.constructor({
        getAuthToken: getIdToken,
      });
    }
  }, [user, getIdToken]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    if (!user) return;

    try {
      setIsRefreshing(true);
      
      // Fetch dashboard stats
      const dashboardResponse = await fetch('/api/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${await getIdToken()}`,
          'Content-Type': 'application/json',
        },
      });

      if (dashboardResponse.ok) {
        const dashboardData = await dashboardResponse.json();
        setStats(prevStats => ({
          ...prevStats,
          ...dashboardData,
          scanStatus: dashboardData.lastScanTime ? 'complete' : 'idle',
        }));
      }

      // Fetch recent activities (mock data for now)
      setRecentActivities([
        {
          id: '1',
          type: 'scan',
          description: 'Full drive scan completed',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          status: 'completed',
        },
        {
          id: '2', 
          type: 'duplicate_detection',
          description: 'Found 25 duplicate files',
          timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          status: 'completed',
        },
      ]);
      
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, getIdToken, toast]);

  // Start background scan
  const startBackgroundScan = useCallback(async () => {
    if (!user) return;

    try {
      const scanResponse = await apiClient.startBackgroundScan(user.uid, {
        maxDepth: 20,
        includeTrashed: false,
        scanSharedDrives: false,
      });

      setStats(prev => ({
        ...prev,
        scanStatus: 'scanning',
        scanProgress: 0,
        scanId: scanResponse.scanId,
      }));

      // Start polling for scan progress
      const interval = setInterval(async () => {
        try {
          const progressResponse = await apiClient.getScanStatus(
            scanResponse.scanId,
            user.uid
          );

          if (progressResponse.status === 'completed') {
            setStats(prev => ({
              ...prev,
              scanStatus: 'complete',
              scanProgress: 100,
              ...(progressResponse.results && {
                totalFiles: progressResponse.results.totalFiles,
                totalSize: progressResponse.results.totalSize,
                duplicateFiles: progressResponse.results.duplicateFiles,
              }),
            }));
            
            if (scanPollingInterval) {
              clearInterval(scanPollingInterval);
              setScanPollingInterval(null);
            }
            
            toast({
              title: 'Scan Complete',
              description: `Found ${progressResponse.filesProcessed} files`,
            });
          } else if (progressResponse.status === 'failed') {
            setStats(prev => ({ ...prev, scanStatus: 'error' }));
            
            if (scanPollingInterval) {
              clearInterval(scanPollingInterval);
              setScanPollingInterval(null);
            }
            
            toast({
              title: 'Scan Failed',
              description: progressResponse.error || 'An error occurred during scanning',
              variant: 'destructive',
            });
          } else {
            setStats(prev => ({
              ...prev,
              scanProgress: progressResponse.progress,
            }));
          }
        } catch (error) {
          console.error('Error polling scan status:', error);
        }
      }, 2000);

      setScanPollingInterval(interval);
      
      toast({
        title: 'Scan Started',
        description: 'Background scan initiated successfully',
      });
    } catch (error) {
      console.error('Failed to start background scan:', error);
      toast({
        title: 'Scan Error',
        description: 'Failed to start background scan. Please try again.',
        variant: 'destructive',
      });
    }
  }, [user, scanPollingInterval, toast]);

  // Cancel scan
  const cancelScan = useCallback(async () => {
    if (scanPollingInterval) {
      clearInterval(scanPollingInterval);
      setScanPollingInterval(null);
    }
    
    setStats(prev => ({ ...prev, scanStatus: 'idle', scanProgress: undefined }));
    
    toast({
      title: 'Scan Cancelled',
      description: 'Background scan has been cancelled',
    });
  }, [scanPollingInterval, toast]);

  // Initialize dashboard
  useEffect(() => {
    fetchDashboardData();
    
    // Cleanup polling on unmount
    return () => {
      if (scanPollingInterval) {
        clearInterval(scanPollingInterval);
      }
    };
  }, [fetchDashboardData]);

  // Format file size
  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  // Format relative time
  const formatRelativeTime = useCallback((timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }, []);

  if (isLoading) {
    return (
      <MainLayout>
        <RouteGuard requireAuth requireDriveAuth>
          <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
            <DashboardSkeleton />
          </div>
        </RouteGuard>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <RouteGuard requireAuth requireDriveAuth>
        <div className="flex-1 space-y-6 p-4 pt-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
              <p className="text-muted-foreground">
                Overview of your Google Drive organization
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              {isAiEnabled && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Active
                </Badge>
              )}
              
              <Button
                onClick={fetchDashboardData}
                disabled={isRefreshing}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Scan Progress */}
          {stats.scanStatus === 'scanning' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 animate-spin" />
                      Scanning Drive
                    </CardTitle>
                    <CardDescription>
                      Analyzing your files and folders...
                    </CardDescription>
                  </div>
                  <Button onClick={cancelScan} variant="outline" size="sm">
                    <Pause className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{stats.scanProgress || 0}%</span>
                  </div>
                  <Progress value={stats.scanProgress || 0} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                <Files className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.totalFiles.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(stats.totalSize)} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
                <Copy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  {stats.duplicateFiles.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.totalFiles > 0 
                    ? Math.round((stats.duplicateFiles / stats.totalFiles) * 100) 
                    : 0}% of total files
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {stats.recentActivity.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Files modified this week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Drive Quality</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {stats.qualityScore}/100
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.cleanupSuggestions} improvement suggestions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
            {/* Quick Actions */}
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Common tasks and recommended next steps
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {stats.totalFiles === 0 ? (
                  <div className="text-center py-6">
                    <HardDrive className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <h4 className="font-medium mb-2">Start with a Drive Scan</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Analyze your Google Drive to get insights and recommendations
                    </p>
                    <Button onClick={startBackgroundScan} className="gap-2">
                      <Play className="h-4 w-4" />
                      Run Drive Scan
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={startBackgroundScan}
                      disabled={stats.scanStatus === 'scanning'}
                      variant="outline"
                      className="justify-start"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Scan
                    </Button>
                    
                    <Link href="/inventory">
                      <Button variant="outline" className="w-full justify-start">
                        <Files className="h-4 w-4 mr-2" />
                        View Files
                      </Button>
                    </Link>
                    
                    <Link href="/duplicates">
                      <Button variant="outline" className="w-full justify-start">
                        <Copy className="h-4 w-4 mr-2" />
                        Find Duplicates
                      </Button>
                    </Link>
                    
                    <Link href="/organize">
                      <Button variant="outline" className="w-full justify-start">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Organize
                      </Button>
                    </Link>
                    
                    {isAiEnabled && (
                      <Link href="/ai">
                        <Button variant="outline" className="w-full justify-start">
                          <Sparkles className="h-4 w-4 mr-2" />
                          AI Analysis
                        </Button>
                      </Link>
                    )}
                    
                    <Link href="/health">
                      <Button variant="outline" className="w-full justify-start">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        System Health
                      </Button>
                    </Link>
                  </div>
                )}
                
                {stats.qualityScore < 70 && stats.cleanupSuggestions > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Your Drive could benefit from organization. 
                      We found {stats.cleanupSuggestions} improvement opportunities.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest scans and operations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivities.length > 0 ? (
                    recentActivities.map((activity) => (
                      <div key={activity.id} className="flex items-center space-x-3">
                        <div className={`h-2 w-2 rounded-full ${
                          activity.status === 'completed' ? 'bg-green-500' :
                          activity.status === 'failed' ? 'bg-red-500' :
                          'bg-blue-500 animate-pulse'
                        }`} />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">
                            {activity.description}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(activity.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <Database className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No recent activity
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Storage Analysis */}
          {stats.totalFiles > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Storage Analysis</CardTitle>
                <CardDescription>
                  Breakdown of your Drive usage patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Duplicate Files</span>
                        <span className="font-medium text-amber-600">
                          {Math.round((stats.duplicateFiles / stats.totalFiles) * 100)}%
                        </span>
                      </div>
                      <Progress 
                        value={(stats.duplicateFiles / stats.totalFiles) * 100} 
                        className="h-2"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Recent Activity</span>
                        <span className="font-medium text-green-600">
                          {Math.round((stats.recentActivity / stats.totalFiles) * 100)}%
                        </span>
                      </div>
                      <Progress 
                        value={(stats.recentActivity / stats.totalFiles) * 100} 
                        className="h-2"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Archive Candidates</span>
                        <span className="font-medium text-blue-600">
                          {Math.round((stats.vaultCandidates / stats.totalFiles) * 100)}%
                        </span>
                      </div>
                      <Progress 
                        value={(stats.vaultCandidates / stats.totalFiles) * 100} 
                        className="h-2"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium">Total Storage Used</span>
                      <span className="font-medium">{formatFileSize(stats.totalSize)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </RouteGuard>
    </MainLayout>
  );
}

// Dashboard loading skeleton
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="grid gap-6 md:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-3">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
