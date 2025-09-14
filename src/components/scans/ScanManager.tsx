/**
 * @fileoverview Scan Manager component for initiating and monitoring background scans
 * Provides UI for starting scans, viewing progress, and managing scan history
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSSE } from '@/hooks/useSSE';
import { useAuth } from '@/hooks/useAuth';
import { Play, Pause, RefreshCw, AlertCircle, CheckCircle, Clock, Database, FileSearch, Activity } from 'lucide-react';
import { format } from 'date-fns';

interface ScanJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'chained';
  type: 'drive_scan' | 'full_analysis' | 'duplicate_detection';
  progress?: {
    current: number;
    total: number;
    percentage: number;
    currentStep: string;
    bytesProcessed?: number;
    filesProcessed?: number;
    estimatedTimeRemaining?: number;
  };
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  results?: any;
  error?: string;
  chainedToJobId?: string;
}

export function ScanManager() {
  const { user, token } = useAuth();
  const [activeScan, setActiveScan] = useState<ScanJob | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanJob[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanType, setScanType] = useState<'full_analysis' | 'drive_scan' | 'duplicate_detection'>('full_analysis');

  // SSE connection for real-time updates
  const sseState = useSSE({
    url: activeScan ? `/api/scan/stream?jobId=${activeScan.id}` : '',
    token,
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);
        handleProgressUpdate(data);
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    },
    onError: () => {
      setError('Lost connection to scan progress stream');
    },
    onClose: () => {
      // Refresh scan status when stream closes
      if (activeScan) {
        checkScanStatus();
      }
    },
  });

  // Handle progress updates from SSE
  const handleProgressUpdate = useCallback((data: any) => {
    if (data.type === 'progress' && data.progress) {
      setActiveScan(prev => prev ? {
        ...prev,
        progress: data.progress,
        status: data.status || prev.status,
      } : null);
    } else if (data.type === 'complete') {
      setActiveScan(prev => prev ? {
        ...prev,
        status: 'completed',
        completedAt: Date.now(),
        results: data.results,
      } : null);
      // Move to history
      setTimeout(() => {
        loadScanHistory();
        setActiveScan(null);
      }, 2000);
    } else if (data.type === 'error') {
      setActiveScan(prev => prev ? {
        ...prev,
        status: 'failed',
        error: data.error,
        completedAt: Date.now(),
      } : null);
      setError(data.error || 'Scan failed');
    } else if (data.type === 'status' && data.status === 'chained') {
      // Handle job chaining
      setActiveScan(prev => prev ? {
        ...prev,
        status: 'chained',
        chainedToJobId: data.chainedToJobId,
      } : null);
    }
  }, []);

  // Start a new scan
  const startScan = async () => {
    if (!token) {
      setError('Authentication required');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch('/api/workflows/background-scan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: scanType,
          config: {
            maxDepth: 5,
            includeTrashed: false,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start scan');
      }

      const data = await response.json();
      
      setActiveScan({
        id: data.jobId,
        status: 'pending',
        type: scanType,
        createdAt: Date.now(),
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
    } finally {
      setIsStarting(false);
    }
  };

  // Cancel active scan
  const cancelScan = async () => {
    if (!activeScan || !token) return;

    try {
      const response = await fetch('/api/workflows/background-scan', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cancel',
          jobId: activeScan.id,
        }),
      });

      if (response.ok) {
        setActiveScan(prev => prev ? {
          ...prev,
          status: 'cancelled',
        } : null);
        setTimeout(() => {
          setActiveScan(null);
        }, 2000);
      }
    } catch (err) {
      setError('Failed to cancel scan');
    }
  };

  // Check current scan status
  const checkScanStatus = async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/workflows/background-scan', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status !== 'idle') {
          setActiveScan({
            id: data.jobId,
            status: data.status,
            type: data.type,
            progress: data.progress,
            createdAt: data.createdAt,
            startedAt: data.startedAt,
            results: data.results,
            error: data.error,
          });
        }
      }
    } catch (err) {
      console.error('Failed to check scan status:', err);
    }
  };

  // Load scan history
  const loadScanHistory = async () => {
    // This would typically fetch from an API endpoint
    // For now, using local state
  };

  // Check for active scan on mount
  useEffect(() => {
    checkScanStatus();
    loadScanHistory();
  }, [token]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'running':
        return <Activity className="h-4 w-4 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4" />;
      case 'chained':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'running':
        return 'default';
      case 'completed':
        return 'success';
      case 'failed':
        return 'destructive';
      case 'cancelled':
        return 'outline';
      case 'chained':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const formatBytes = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Scan Card */}
      {activeScan ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5" />
                  Active Scan
                </CardTitle>
                <CardDescription>
                  Your scan is running in the background
                </CardDescription>
              </div>
              <Badge variant={getStatusColor(activeScan.status) as any}>
                <span className="flex items-center gap-1">
                  {getStatusIcon(activeScan.status)}
                  {activeScan.status}
                </span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeScan.progress && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{activeScan.progress.currentStep}</span>
                    <span>{activeScan.progress.percentage}%</span>
                  </div>
                  <Progress value={activeScan.progress.percentage} />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {activeScan.progress.filesProcessed !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Files Processed:</span>
                      <p className="font-medium">{activeScan.progress.filesProcessed.toLocaleString()}</p>
                    </div>
                  )}
                  {activeScan.progress.bytesProcessed !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Data Scanned:</span>
                      <p className="font-medium">{formatBytes(activeScan.progress.bytesProcessed)}</p>
                    </div>
                  )}
                  {activeScan.startedAt && (
                    <div>
                      <span className="text-muted-foreground">Duration:</span>
                      <p className="font-medium">
                        {formatDuration(Date.now() - activeScan.startedAt)}
                      </p>
                    </div>
                  )}
                  {sseState.isConnected && (
                    <div>
                      <span className="text-muted-foreground">Connection:</span>
                      <p className="font-medium text-green-600">Live</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeScan.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Scan Error</AlertTitle>
                <AlertDescription>{activeScan.error}</AlertDescription>
              </Alert>
            )}

            {activeScan.status === 'chained' && (
              <Alert>
                <RefreshCw className="h-4 w-4" />
                <AlertTitle>Scan Continuing</AlertTitle>
                <AlertDescription>
                  Your scan is being processed in multiple parts to handle large data volumes.
                  Progress will continue automatically.
                </AlertDescription>
              </Alert>
            )}

            {activeScan.results && (
              <Alert variant="default">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Scan Complete</AlertTitle>
                <AlertDescription>
                  Found {activeScan.results.filesFound} files
                  {activeScan.results.duplicatesDetected > 0 && 
                    ` with ${activeScan.results.duplicatesDetected} duplicate groups`}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              {activeScan.status === 'running' && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={cancelScan}
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Cancel Scan
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Start New Scan Card */
        <Card>
          <CardHeader>
            <CardTitle>Start Background Scan</CardTitle>
            <CardDescription>
              Scan your Google Drive in the background. You can close this page and the scan will continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={scanType} onValueChange={(v) => setScanType(v as any)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="full_analysis">Full Analysis</TabsTrigger>
                <TabsTrigger value="drive_scan">Quick Scan</TabsTrigger>
                <TabsTrigger value="duplicate_detection">Find Duplicates</TabsTrigger>
              </TabsList>
              <TabsContent value="full_analysis" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Comprehensive scan with duplicate detection, file analysis, and optimization recommendations.
                </p>
              </TabsContent>
              <TabsContent value="drive_scan" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Fast scan to index your files and detect recent changes.
                </p>
              </TabsContent>
              <TabsContent value="duplicate_detection" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Focused scan to identify duplicate files and save storage space.
                </p>
              </TabsContent>
            </Tabs>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={startScan}
              disabled={isStarting || !user}
              className="w-full"
            >
              {isStarting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Starting Scan...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start {scanType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Features Card */}
      <Card>
        <CardHeader>
          <CardTitle>Background Scan Features</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Runs completely in the background - close your browser anytime</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Automatic checkpoint and resume on interruption</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Real-time progress updates when you return</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Handles large drives with automatic job chaining</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Smart delta scans for faster incremental updates</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}