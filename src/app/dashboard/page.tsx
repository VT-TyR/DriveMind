'use client';

import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScanProgress } from '@/components/dashboard/scan-progress';

// Client-safe ScanJob interface 
interface ScanJob {
  id: string;
  uid: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  type: 'drive_scan' | 'full_analysis' | 'duplicate_detection';
  progress: {
    current: number;
    total: number;
    percentage: number;
    currentStep: string;
    estimatedTimeRemaining?: number;
    bytesProcessed?: number;
    totalBytes?: number;
  };
  config: {
    maxDepth?: number;
    includeTrashed?: boolean;
    rootFolderId?: string;
    fileTypes?: string[];
  };
  results?: {
    scanId?: string;
    filesFound?: number;
    duplicatesDetected?: number;
    totalSize?: number;
    insights?: any;
  };
  error?: string;
  createdAt: any;
  updatedAt: any;
  startedAt?: any;
  completedAt?: any;
}
import { 
  Files, 
  Copy, 
  HardDrive, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Activity
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
  scanStatus: 'idle' | 'scanning' | 'complete' | 'error';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const [stats, setStats] = React.useState<DashboardStats>({
    totalFiles: 0,
    duplicateFiles: 0,
    totalSize: 0,
    recentActivity: 0,
    vaultCandidates: 0,
    cleanupSuggestions: 0,
    qualityScore: 0,
    scanStatus: 'idle'
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeScanJob, setActiveScanJob] = React.useState<ScanJob | null>(null);
  const [scanPollingInterval, setScanPollingInterval] = React.useState<NodeJS.Timeout | null>(null);

  const startBackgroundScan = React.useCallback(async () => {
    console.log('🔥 Scan button clicked! User:', user ? 'authenticated' : 'not authenticated');
    
    if (!user) {
      console.error('❌ No user authenticated - cannot start scan');
      alert('Please sign in with Google first to start a scan.');
      return;
    }
    
    try {
      console.log('🔄 Getting Firebase ID token...');
      const token = await user.getIdToken();
      console.log('✅ Firebase ID token obtained, length:', token.length);
      
      console.log('📡 Making API request to /api/workflows/background-scan...');
      const response = await fetch('/api/workflows/background-scan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'full_analysis',
          config: { 
            maxDepth: 20, // Increased for thorough scan
            includeTrashed: false 
          }
        })
      });

      console.log('📬 API response status:', response.status);
      const result = await response.json();
      console.log('📋 API response data:', result);
      
      if (response.ok) {
        console.log('✅ Scan started successfully!');
        setStats(prev => ({ ...prev, scanStatus: 'scanning' }));
        // Start polling for progress
        startScanPolling();
      } else {
        console.error('❌ Failed to start background scan:', result.error);
        alert(`Failed to start scan: ${result.error}`);
        setStats(prev => ({ ...prev, scanStatus: 'error' }));
      }
    } catch (error) {
      console.error('💥 Failed to start background scan:', error);
      alert(`Error starting scan: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStats(prev => ({ ...prev, scanStatus: 'error' }));
    }
  }, [user]);

  const startScanPolling = React.useCallback(() => {
    if (scanPollingInterval) {
      clearInterval(scanPollingInterval);
    }

    const interval = setInterval(async () => {
      if (!user) return;

      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/workflows/background-scan', {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        });

        const scanStatus = await response.json();
        
        if (response.ok) {
          if (scanStatus.status === 'idle') {
            // No active scan
            setActiveScanJob(null);
            setStats(prev => ({ ...prev, scanStatus: 'idle' }));
            clearInterval(interval);
            setScanPollingInterval(null);
          } else {
            // Update scan job state
            const job: ScanJob = {
              id: scanStatus.jobId,
              uid: user.uid,
              status: scanStatus.status,
              type: scanStatus.type,
              progress: scanStatus.progress,
              config: {},
              createdAt: scanStatus.createdAt,
              updatedAt: scanStatus.createdAt,
              startedAt: scanStatus.startedAt,
              results: scanStatus.results,
              error: scanStatus.error
            };
            
            setActiveScanJob(job);
            
            if (scanStatus.status === 'completed') {
              // Update dashboard stats with results
              if (scanStatus.results) {
                setStats({
                  totalFiles: scanStatus.results.filesFound || 0,
                  duplicateFiles: scanStatus.results.duplicatesDetected || 0,
                  totalSize: scanStatus.results.totalSize || 0,
                  recentActivity: 0, // TODO: Calculate from results
                  vaultCandidates: scanStatus.results.insights?.archiveCandidates || 0,
                  cleanupSuggestions: scanStatus.results.insights?.recommendedActions?.length || 0,
                  qualityScore: scanStatus.results.insights?.qualityScore || 0,
                  scanStatus: 'complete'
                });
              }
              clearInterval(interval);
              setScanPollingInterval(null);
            } else if (scanStatus.status === 'failed') {
              setStats(prev => ({ ...prev, scanStatus: 'error' }));
              clearInterval(interval);
              setScanPollingInterval(null);
            } else {
              setStats(prev => ({ ...prev, scanStatus: 'scanning' }));
            }
          }
        }
      } catch (error) {
        console.error('Error polling scan status:', error);
      }
    }, 2000); // Poll every 2 seconds

    setScanPollingInterval(interval);
  }, [user, scanPollingInterval]);

  const cancelScan = React.useCallback(async () => {
    // TODO: Implement scan cancellation
    console.log('Cancel scan requested');
  }, []);

  const retryScan = React.useCallback(() => {
    startBackgroundScan();
  }, [startBackgroundScan]);

  const fetchDashboardData = React.useCallback(async () => {
    if (!user) {
      setStats({
        totalFiles: 0,
        duplicateFiles: 0,
        totalSize: 0,
        recentActivity: 0,
        vaultCandidates: 0,
        cleanupSuggestions: 0,
        qualityScore: 0,
        scanStatus: 'idle'
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const dashboardStats = await response.json();
        setStats(prev => ({
          ...prev,
          ...dashboardStats,
          scanStatus: dashboardStats.lastScanTime ? 'complete' : 'idle'
        }));
      } else {
        console.warn('Failed to fetch dashboard stats:', response.status);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    fetchDashboardData();
    
    // Check for active scan jobs on load via API
    const checkActiveScan = async () => {
      if (!user) return;
      
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/workflows/background-scan', {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        });

        const scanStatus = await response.json();
        
        if (response.ok && scanStatus.status !== 'idle') {
          const job: ScanJob = {
            id: scanStatus.jobId,
            uid: user.uid,
            status: scanStatus.status,
            type: scanStatus.type,
            progress: scanStatus.progress,
            config: {},
            createdAt: scanStatus.createdAt,
            updatedAt: scanStatus.createdAt,
            startedAt: scanStatus.startedAt,
            results: scanStatus.results,
            error: scanStatus.error
          };
          
          setActiveScanJob(job);
          setStats(prev => ({ ...prev, scanStatus: 'scanning' }));
          startScanPolling();
        }
      } catch (error) {
        console.error('Failed to check active scan:', error);
      }
    };
    
    checkActiveScan();

    // Cleanup polling on unmount
    return () => {
      if (scanPollingInterval) {
        clearInterval(scanPollingInterval);
      }
    };
  }, [fetchDashboardData, user, startScanPolling, scanPollingInterval]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h2>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-medium mb-2">Sign in Required</h3>
            <p className="text-muted-foreground mb-4">
              Please sign in with your Google account to view your dashboard.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <h2 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h2>
              {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button onClick={fetchDashboardData} variant="outline" disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Refresh'}
              </Button>
              <Button 
                onClick={startBackgroundScan} 
                disabled={stats.scanStatus === 'scanning'}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {stats.scanStatus === 'scanning' ? (
                  <>
                    <Activity className="h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <HardDrive className="h-4 w-4" />
                    Start Background Scan
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Background Scan Progress */}
        {activeScanJob && (
          <ScanProgress 
            scanJob={activeScanJob}
            onCancel={cancelScan}
            onRetry={retryScan}
          />
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Files</CardTitle>
              <Files className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalFiles.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(stats.totalSize)} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Duplicates Found</CardTitle>
              <Copy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.duplicateFiles.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalFiles > 0 ? Math.round((stats.duplicateFiles / stats.totalFiles) * 100) : 0}% of total files
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.recentActivity.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Files modified this week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drive Quality</CardTitle>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.qualityScore}/100</div>
              <p className="text-xs text-muted-foreground">
                {stats.cleanupSuggestions} cleanup suggestions
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="space-y-4">
                {stats.totalFiles === 0 && (
                  <div className="bg-muted rounded-lg p-6 text-center border-2 border-dashed">
                    <HardDrive className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <h4 className="font-medium mb-2">Start with a Drive Scan</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Analyze your Google Drive to get insights and recommendations
                    </p>
                    <Button 
                      onClick={startBackgroundScan} 
                      disabled={stats.scanStatus === 'scanning'}
                      className="gap-2"
                    >
                      {stats.scanStatus === 'scanning' ? (
                        <>
                          <Activity className="h-4 w-4 animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <HardDrive className="h-4 w-4" />
                          Run Drive Scan
                        </>
                      )}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button 
                    onClick={startBackgroundScan} 
                    disabled={stats.scanStatus === 'scanning'}
                    variant={stats.totalFiles === 0 ? "default" : "outline"}
                    className="w-full justify-start gap-2"
                  >
                    {stats.scanStatus === 'scanning' ? (
                      <>
                        <Activity className="h-4 w-4 animate-spin" />
                        Scanning Drive...
                      </>
                    ) : (
                      <>
                        <HardDrive className="h-4 w-4" />
                        {stats.totalFiles === 0 ? 'Run First Scan' : 'Refresh Scan'}
                      </>
                    )}
                  </Button>
                  <Link href="/inventory">
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <Files className="h-4 w-4" />
                      View File Inventory
                    </Button>
                  </Link>
                  <Link href="/duplicates">
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <Copy className="h-4 w-4" />
                      Find Duplicates
                    </Button>
                  </Link>
                  <Link href="/organize">
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Organize Files
                    </Button>
                  </Link>
                  <Link href="/health">
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <CheckCircle className="h-4 w-4" />
                      System Health
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Storage Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Duplicates</span>
                    <span className="text-amber-600 font-medium">
                      {stats.totalFiles > 0 ? Math.round((stats.duplicateFiles / stats.totalFiles) * 100) : 0}%
                    </span>
                  </div>
                  <Progress value={stats.totalFiles > 0 ? (stats.duplicateFiles / stats.totalFiles) * 100 : 0} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Recent Activity</span>
                    <span className="text-green-600 font-medium">
                      {stats.totalFiles > 0 ? Math.round((stats.recentActivity / stats.totalFiles) * 100) : 0}%
                    </span>
                  </div>
                  <Progress value={stats.totalFiles > 0 ? (stats.recentActivity / stats.totalFiles) * 100 : 0} className="h-2" />
                </div>

                <div className="text-sm text-muted-foreground">
                  Total storage: {formatFileSize(stats.totalSize)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}