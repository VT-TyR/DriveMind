'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Activity,
  Clock,
  HardDrive,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  Play,
  X
} from 'lucide-react';
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

interface ScanProgressProps {
  scanJob: ScanJob | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function ScanProgress({ scanJob, onCancel, onRetry }: ScanProgressProps) {
  if (!scanJob) {
    return null;
  }

  const getStatusIcon = (status: ScanJob['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'running':
        return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: ScanJob['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatBytes = (bytes: number | undefined) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimeRemaining = (seconds: number | undefined) => {
    if (!seconds) return 'Calculating...';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  const isActive = scanJob.status === 'pending' || scanJob.status === 'running';
  const isCompleted = scanJob.status === 'completed';
  const isFailed = scanJob.status === 'failed';

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Drive Scan Progress
            {getStatusIcon(scanJob.status)}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(scanJob.status)}>
              {scanJob.status.charAt(0).toUpperCase() + scanJob.status.slice(1)}
            </Badge>
            {isActive && onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        {isActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{scanJob.progress.currentStep}</span>
              <span className="text-muted-foreground">
                {scanJob.progress.percentage}%
              </span>
            </div>
            <Progress 
              value={scanJob.progress.percentage} 
              className="h-3"
            />
            {scanJob.progress.current > 0 && scanJob.progress.total > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Step {scanJob.progress.current} of {scanJob.progress.total}</span>
                {scanJob.progress.estimatedTimeRemaining && (
                  <span>
                    ~{formatTimeRemaining(scanJob.progress.estimatedTimeRemaining)} remaining
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scan Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {scanJob.type && (
            <div>
              <div className="text-muted-foreground">Scan Type</div>
              <div className="font-medium capitalize">
                {scanJob.type.replace('_', ' ')}
              </div>
            </div>
          )}
          
          {scanJob.progress.bytesProcessed && (
            <div>
              <div className="text-muted-foreground">Data Processed</div>
              <div className="font-medium">
                {formatBytes(scanJob.progress.bytesProcessed)}
              </div>
            </div>
          )}
          
          {scanJob.startedAt && (
            <div>
              <div className="text-muted-foreground">Started</div>
              <div className="font-medium">
                {new Date(scanJob.startedAt).toLocaleTimeString()}
              </div>
            </div>
          )}
          
          {scanJob.completedAt && (
            <div>
              <div className="text-muted-foreground">
                {isFailed ? 'Failed' : 'Completed'}
              </div>
              <div className="font-medium">
                {new Date(scanJob.completedAt).toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>

        {/* Results Summary (when completed) */}
        {isCompleted && scanJob.results && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-3">Scan Results</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-green-600">Files Found</div>
                <div className="font-bold text-green-800">
                  {scanJob.results.filesFound?.toLocaleString() || 0}
                </div>
              </div>
              <div>
                <div className="text-green-600">Duplicates</div>
                <div className="font-bold text-green-800">
                  {scanJob.results.duplicatesDetected?.toLocaleString() || 0}
                </div>
              </div>
              <div>
                <div className="text-green-600">Total Size</div>
                <div className="font-bold text-green-800">
                  {formatBytes(scanJob.results.totalSize)}
                </div>
              </div>
              <div>
                <div className="text-green-600">Quality Score</div>
                <div className="font-bold text-green-800">
                  {scanJob.results.insights?.qualityScore || 0}/100
                </div>
              </div>
            </div>

            {scanJob.results.insights?.metrics && (
              <div className="mt-4">
                <h5 className="text-sm font-medium text-green-800 mb-2">Scan Metrics</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-green-600">Pages</div>
                    <div className="font-semibold text-green-900">{scanJob.results.insights.metrics.pages || 0}</div>
                  </div>
                  <div>
                    <div className="text-green-600">Write Ops</div>
                    <div className="font-semibold text-green-900">{scanJob.results.insights.metrics.writeOps || 0}</div>
                  </div>
                  <div>
                    <div className="text-green-600">Duration</div>
                    <div className="font-semibold text-green-900">{Math.round((scanJob.results.insights.metrics.durationMs || 0) / 1000)}s</div>
                  </div>
                  <div>
                    <div className="text-green-600">Mode</div>
                    <div className="font-semibold text-green-900 capitalize">{scanJob.results.insights.scanType === 'delta' ? 'Delta' : 'Full'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {isFailed && scanJob.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-800 mb-2">Scan Failed</h4>
            <p className="text-sm text-red-700">{scanJob.error}</p>
            {onRetry && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3 text-red-700 border-red-300 hover:bg-red-100"
                onClick={onRetry}
              >
                <Play className="h-4 w-4 mr-2" />
                Retry Scan
              </Button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {isActive && (
          <div className="flex justify-center">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 animate-pulse" />
              Scan is running in the background. You can safely navigate away and come back to check progress.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ScanProgress;
