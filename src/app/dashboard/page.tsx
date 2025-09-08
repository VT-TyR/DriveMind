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
import { db as clientDb } from '@/lib/firebase';
import { collection, query as fsQuery, where, orderBy, limit as fsLimit, onSnapshot } from 'firebase/firestore';

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
  lastScanMode?: 'full' | 'delta' | null;
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
    scanStatus: 'idle',
    lastScanMode: null,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeScanJob, setActiveScanJob] = React.useState<ScanJob | null>(null);
  const scanSubRef = React.useRef<() => void>();

  const startBackgroundScan = React.useCallback(async (forceFull?: boolean) => {
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
            includeTrashed: false,
            forceFull: !!forceFull,
          }
        })
      });

      console.log('📬 API response status:', response.status);
      const result = await response.json();
      console.log('📋 API response data:', result);
      
      if (response.ok) {
        console.log('✅ Scan started successfully!');
        setStats(prev => ({ ...prev, scanStatus: 'scanning' }));
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

  // Firestore subscription to active scan job
  const subscribeActiveScan = React.useCallback(() => {
    if (!user) return;
    if (scanSubRef.current) {
      scanSubRef.current();
    }
    const q = fsQuery(
      collection(clientDb, 'scanJobs'),
      where('uid', '==', user.uid),
      where('status', 'in', ['pending', 'running']),
      orderBy('createdAt', 'desc'),
      fsLimit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setActiveScanJob(null);
        setStats(prev => ({ ...prev, scanStatus: 'idle' }));
        return;
      }
      const d = snap.docs[0];
      const data = d.data() as any;
      const job: ScanJob = {
        id: d.id,
        uid: data.uid,
        status: data.status,
        type: data.type,
        progress: data.progress || { current: 0, total: 0, percentage: 0, currentStep: 'Starting...' },
        config: data.config || {},
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        startedAt: data.startedAt,
        results: data.results,
        error: data.error,
      };
      setActiveScanJob(job);
      if (job.status === 'completed') {
        if (job.results) {
          setStats({
            totalFiles: job.results.filesFound || 0,
            duplicateFiles: job.results.duplicatesDetected || 0,
            totalSize: job.results.totalSize || 0,
            recentActivity: 0,
            vaultCandidates: job.results.insights?.archiveCandidates || 0,
            cleanupSuggestions: job.results.insights?.recommendedActions?.length || 0,
            qualityScore: job.results.insights?.qualityScore || 0,
            scanStatus: 'complete',
            lastScanMode: job.results.insights?.scanType === 'delta' ? 'delta' : 'full',
          });
        }
      } else if (job.status === 'failed') {
        setStats(prev => ({ ...prev, scanStatus: 'error' }));
      } else {
        setStats(prev => ({ ...prev, scanStatus: 'scanning' }));
      }
    }, (err) => {
      console.error('Scan job subscription error:', err);
    });
    scanSubRef.current = unsub;
  }, [user]);

  const cancelScan = React.useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/workflows/background-scan', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'cancel' })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.warn('Cancel failed', res.status, j);
      }
    } catch (e) {
      console.error('Cancel scan error', e);
    }
  }, [user]);

  const retryScan = React.useCallback(() => {
    startBackgroundScan();
  }, [startBackgroundScan]);

  const runFullScan = React.useCallback(() => {
    startBackgroundScan(true);
  }, [startBackgroundScan]);

  const runDeltaScan = React.useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/workflows/background-scan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'full_analysis',
          config: { includeTrashed: false, forceDelta: true }
        })
      });
      const result = await response.json();
      if (!response.ok) {
        console.warn('Delta scan request failed:', result);
      }
    } catch (e) {
      console.error('Run delta scan error', e);
    }
  }, [user]);

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
    if (user) {
      subscribeActiveScan();
    }
    return () => {
      if (scanSubRef.current) scanSubRef.current();
    };
  }, [fetchDashboardData, user, subscribeActiveScan]);

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
              {stats.lastScanMode && (
                <Badge variant="outline" className="gap-1">
                  Last Scan: {stats.lastScanMode === 'delta' ? 'Delta' : 'Full'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground ml-[2.5rem]">
              Full scans enumerate all files; Delta scans use Drive Changes for faster incremental updates.
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <Button onClick={fetchDashboardData} variant="outline" disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Refresh'}
              </Button>
              <Button 
                onClick={() => startBackgroundScan()} 
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
              <Button 
                onClick={runFullScan} 
                variant="secondary"
                disabled={stats.scanStatus === 'scanning'}
              >
                Run Full Scan
              </Button>
              <Button 
                onClick={runDeltaScan}
                variant="outline"
                disabled={stats.scanStatus === 'scanning'}
                title="Runs delta scan if a changes token exists"
              >
                Run Delta Scan
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
                      onClick={() => startBackgroundScan()} 
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
                    onClick={() => startBackgroundScan()} 
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
