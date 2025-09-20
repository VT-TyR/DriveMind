/**
 * @fileoverview Migration Safety Dashboard
 * Real-time monitoring interface for data migration safety infrastructure
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  RefreshCw,
  PlayCircle,
  StopCircle,
  RotateCcw,
  Activity,
  Database,
  Shield,
  Settings
} from 'lucide-react';

interface DashboardData {
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, {
      status: 'healthy' | 'degraded' | 'unhealthy';
      message: string;
    }>;
  };
  migration: {
    phase: string;
    progress: {
      percentage: number;
      current: number;
      total: number;
      estimatedTimeRemaining: number;
    };
    stats: {
      filesProcessed: number;
      filesTotal: number;
      errorsCount: number;
      warningsCount: number;
    };
  };
  dataSource: {
    current: string;
    metrics: {
      operations: Record<string, { reads: number; writes: number; errors: number }>;
      fallbacks: number;
    };
  };
  rollback: {
    available: boolean;
    snapshots: number;
  };
  performance: {
    health: 'healthy' | 'degraded' | 'unhealthy';
    summary: {
      totalOperations: number;
      successRate: number;
      avgLatency: number;
      avgThroughput: number;
    };
    current: {
      latency: { p50: number; p95: number; p99: number };
      errors: { rate: number };
    } | null;
  };
  featureFlags: Record<string, boolean>;
}

export default function SafetyDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/safety/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const result = await response.json();
      setData(result.data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusBadge = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    const variants = {
      healthy: 'default' as const,
      degraded: 'secondary' as const,
      unhealthy: 'destructive' as const
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            {error || 'Failed to load dashboard data'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Migration Safety Dashboard</h1>
          <p className="text-muted-foreground">Real-time monitoring and control</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            {getStatusIcon(data.health.status)}
            <span className="text-lg font-medium">Overall Status:</span>
            {getStatusBadge(data.health.status)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(data.health.components).map(([name, component]) => (
              <div key={name} className="flex items-center gap-2">
                {getStatusIcon(component.status)}
                <div>
                  <p className="font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{component.message}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Migration Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Migration Progress
          </CardTitle>
          <CardDescription>
            Phase: <Badge>{data.migration.phase}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>{data.migration.stats.filesProcessed} / {data.migration.stats.filesTotal} files</span>
              <span>{data.migration.progress.percentage}%</span>
            </div>
            <Progress value={data.migration.progress.percentage} />
            {data.migration.progress.estimatedTimeRemaining > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Estimated time remaining: {formatTime(data.migration.progress.estimatedTimeRemaining)}
              </p>
            )}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Files Processed</p>
              <p className="text-2xl font-bold">{data.migration.stats.filesProcessed}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Files</p>
              <p className="text-2xl font-bold">{data.migration.stats.filesTotal}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Errors</p>
              <p className="text-2xl font-bold text-red-500">{data.migration.stats.errorsCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Warnings</p>
              <p className="text-2xl font-bold text-yellow-500">{data.migration.stats.warningsCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance Metrics
          </CardTitle>
          <CardDescription>
            Status: {getStatusBadge(data.performance.health)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Operations</p>
              <p className="text-2xl font-bold">{data.performance.summary.totalOperations}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold">{data.performance.summary.successRate}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Latency</p>
              <p className="text-2xl font-bold">{data.performance.summary.avgLatency}ms</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Throughput</p>
              <p className="text-2xl font-bold">{data.performance.summary.avgThroughput} ops/s</p>
            </div>
          </div>
          
          {data.performance.current && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-2">Current Metrics</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">P50:</span> {data.performance.current.latency.p50}ms
                </div>
                <div>
                  <span className="text-muted-foreground">P95:</span> {data.performance.current.latency.p95}ms
                </div>
                <div>
                  <span className="text-muted-foreground">P99:</span> {data.performance.current.latency.p99}ms
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Source & Rollback */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Data Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Source</p>
                <Badge variant="outline" className="mt-1">{data.dataSource.current}</Badge>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-2">Operations</p>
                {Object.entries(data.dataSource.metrics.operations).map(([source, stats]) => (
                  <div key={source} className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{source}:</span>
                    <span>
                      R: {stats.reads} | W: {stats.writes} | E: {stats.errors}
                    </span>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fallback Events</span>
                <span className="font-medium">{data.dataSource.metrics.fallbacks}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Rollback Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={data.rollback.available ? 'default' : 'secondary'}>
                  {data.rollback.available ? 'Available' : 'Not Available'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Snapshots</span>
                <span className="font-medium">{data.rollback.snapshots}</span>
              </div>
              
              {data.rollback.available && (
                <Button variant="destructive" className="w-full" size="sm">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Initiate Rollback
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(data.featureFlags).map(([flag, enabled]) => (
              <div key={flag} className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm truncate" title={flag}>
                  {flag.replace('FEATURE_', '').replace(/_/g, ' ').toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}