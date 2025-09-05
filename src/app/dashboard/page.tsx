'use client';

import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useOperatingMode } from '@/contexts/operating-mode-context';
// Using the existing auth context
import { useWorkflow } from '@/hooks/use-workflow';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  // Using existing user from auth context
  const { scanDrive, analyzeInventory } = useWorkflow();
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
  const [lastScanId, setLastScanId] = React.useState<string | null>(null);

  const runFullScan = React.useCallback(async () => {
    if (!user) return;
    
    setStats(prev => ({ ...prev, scanStatus: 'scanning' }));
    setIsLoading(true);

    try {
      // Step 1: Scan Drive with progress tracking
      const scanResult = await scanDrive(
        { maxDepth: 10, includeTrashed: false },
        {
          onComplete: (result) => {
            setLastScanId(result.scanId);
          }
        }
      );

      // Step 2: Analyze Inventory with progress tracking
      const inventoryResult = await analyzeInventory(
        { scanId: scanResult.scanId },
        {
          onComplete: (result) => {
            // Update stats with real data
            setStats({
              totalFiles: result.insights.totalFiles,
              duplicateFiles: result.insights.duplicateGroups,
              totalSize: result.insights.totalSize,
              recentActivity: result.files.filter((f: any) => {
                const daysDiff = (Date.now() - new Date(f.modifiedTime).getTime()) / (1000 * 60 * 60 * 24);
                return daysDiff <= 7;
              }).length,
              vaultCandidates: result.insights.archiveCandidates,
              cleanupSuggestions: result.insights.recommendedActions.length,
              qualityScore: result.insights.qualityScore,
              scanStatus: 'complete'
            });
          }
        }
      );

    } catch (error) {
      console.error('Failed to run full scan:', error);
      setStats(prev => ({ ...prev, scanStatus: 'error' }));
    } finally {
      setIsLoading(false);
    }
  }, [user, scanDrive, analyzeInventory]);

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

    // For now, just run a lightweight check or use cached data
    // The full scan is triggered manually via the "Run Full Scan" button
    setIsLoading(false);
  }, [user]);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchDashboardData} variant="outline" disabled={isLoading}>
              {isLoading ? 'Loading...' : 'Refresh'}
            </Button>
            <Button 
              onClick={runFullScan} 
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
                  Run Full Scan
                </>
              )}
            </Button>
          </div>
        </div>

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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