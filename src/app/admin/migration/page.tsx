'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, PlayCircle, StopCircle, RotateCcw, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';

interface MigrationStatus {
  active: boolean;
  phase: string;
  percentage: number;
  metrics: {
    totalRequests: number;
    mockRequests: number;
    firebaseRequests: number;
    errors: number;
    rollbacks: number;
  };
  validation: {
    dataIntegrity: boolean;
    performance: boolean;
    errorRate: boolean;
    lastCheck: string;
  };
  checkpoints: number;
  rollbackReady: boolean;
}

const PHASES = [
  { name: 'initial', percentage: 5, color: 'bg-blue-500' },
  { name: 'early', percentage: 25, color: 'bg-indigo-500' },
  { name: 'half', percentage: 50, color: 'bg-purple-500' },
  { name: 'majority', percentage: 75, color: 'bg-pink-500' },
  { name: 'complete', percentage: 100, color: 'bg-green-500' }
];

export default function MigrationDashboard() {
  const router = useRouter();
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // For now, always allow access to admin dashboard
  const isAdmin = true;

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/migration/phase6', {
        headers: {
          'Authorization': 'Bearer migration-admin-2025'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch migration status');
      }
      const data = await response.json();
      setStatus(data.status);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Auto-refresh
    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchStatus, autoRefresh]);

  const handleAction = async (action: 'start' | 'rollback' | 'abort') => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/migration/phase6', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer migration-admin-2025'
        },
        body: JSON.stringify({ action })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to ${action} migration`);
      }
      
      const data = await response.json();
      setStatus(data.status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyReset = async () => {
    if (!confirm('Are you sure you want to perform an emergency reset? This will abort the migration and reset all state.')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/migration/phase6', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer migration-admin-2025'
        }
      });
      
      if (!response.ok) {
        throw new Error('Emergency reset failed');
      }
      
      await fetchStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getPhaseProgress = () => {
    if (!status) return 0;
    const phaseIndex = PHASES.findIndex(p => p.name === status.phase);
    return phaseIndex >= 0 ? (phaseIndex + 1) / PHASES.length * 100 : 0;
  };

  const getValidationStatus = () => {
    if (!status?.validation) return 'unknown';
    const { dataIntegrity, performance, errorRate } = status.validation;
    if (dataIntegrity && performance && errorRate) return 'passing';
    if (!dataIntegrity || !performance || !errorRate) return 'failing';
    return 'warning';
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };


  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Phase 6 Migration Control Center</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Migration Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Migration Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Badge variant={status?.active ? 'default' : 'secondary'}>
                {status?.active ? 'ACTIVE' : 'IDLE'}
              </Badge>
              <span className="text-lg font-medium">
                Phase: {status?.phase || 'Not Started'}
              </span>
              <span className="text-lg">
                {status?.percentage || 0}% Traffic
              </span>
            </div>
            <div className="flex gap-2">
              {!status?.active && (
                <Button
                  onClick={() => handleAction('start')}
                  disabled={loading}
                  className="gap-2"
                >
                  <PlayCircle className="h-4 w-4" />
                  Start Migration
                </Button>
              )}
              {status?.active && status?.rollbackReady && (
                <Button
                  onClick={() => handleAction('rollback')}
                  disabled={loading}
                  variant="outline"
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Rollback
                </Button>
              )}
              {status?.active && (
                <Button
                  onClick={() => handleAction('abort')}
                  disabled={loading}
                  variant="destructive"
                  className="gap-2"
                >
                  <StopCircle className="h-4 w-4" />
                  Abort
                </Button>
              )}
              <Button
                onClick={handleEmergencyReset}
                disabled={loading}
                variant="ghost"
                className="text-red-600"
              >
                Emergency Reset
              </Button>
            </div>
          </div>

          {/* Phase Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Migration Progress</span>
              <span>{getPhaseProgress().toFixed(0)}%</span>
            </div>
            <Progress value={getPhaseProgress()} className="h-3" />
            <div className="flex justify-between">
              {PHASES.map((phase) => (
                <div
                  key={phase.name}
                  className="flex flex-col items-center"
                >
                  <div
                    className={`w-3 h-3 rounded-full ${
                      (status?.percentage || 0) >= phase.percentage
                        ? phase.color
                        : 'bg-gray-300'
                    }`}
                  />
                  <span className="text-xs mt-1">{phase.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Request Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Requests</span>
                <span className="font-medium">{status?.metrics.totalRequests || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Mock Source</span>
                <span className="font-medium">{status?.metrics.mockRequests || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Firebase Source</span>
                <span className="font-medium">{status?.metrics.firebaseRequests || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Error Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Errors</span>
                <span className="font-medium">{status?.metrics.errors || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Error Rate</span>
                <span className="font-medium">
                  {status?.metrics.totalRequests
                    ? ((status.metrics.errors / status.metrics.totalRequests) * 100).toFixed(2)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Rollbacks</span>
                <span className="font-medium">{status?.metrics.rollbacks || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Validation Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Data Integrity</span>
                {status?.validation.dataIntegrity ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Performance</span>
                {status?.validation.performance ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Error Rate</span>
                {status?.validation.errorRate ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              {status?.validation.lastCheck && (
                <div className="pt-2 text-xs text-muted-foreground">
                  Last check: {formatTime(status.validation.lastCheck)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Checkpoints */}
      <Card>
        <CardHeader>
          <CardTitle>Migration Checkpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {status?.checkpoints || 0} Checkpoints Created
            </Badge>
            <Badge variant={status?.rollbackReady ? 'default' : 'secondary'}>
              Rollback: {status?.rollbackReady ? 'Ready' : 'Not Ready'}
            </Badge>
            <Badge variant={getValidationStatus() === 'passing' ? 'default' : 'destructive'}>
              Validation: {getValidationStatus()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Migration Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Migration Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {PHASES.map((phase, index) => (
              <div key={phase.name} className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${
                      (status?.percentage || 0) >= phase.percentage
                        ? phase.color
                        : 'bg-gray-300'
                    }`}
                  >
                    {(status?.percentage || 0) >= phase.percentage ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <span className="text-xs">{index + 1}</span>
                    )}
                  </div>
                </div>
                <div className="flex-grow">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium capitalize">{phase.name} Phase</p>
                      <p className="text-sm text-muted-foreground">
                        {phase.percentage}% of traffic to Firebase
                      </p>
                    </div>
                    {status?.phase === phase.name && status?.active && (
                      <Badge>Current</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}