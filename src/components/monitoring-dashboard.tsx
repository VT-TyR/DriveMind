'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Activity,
  Zap,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { logger, LogLevel } from '@/lib/logger';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  component?: string;
}

interface PerformanceMetrics {
  averageResponseTime: number;
  totalRequests: number;
  errorRate: number;
  activeUsers: number;
}

// This is a mock implementation for demonstration
// In a real app, you'd connect to your logging service
const mockLogs: LogEntry[] = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    level: 'info',
    message: 'User signed in successfully',
    context: { userId: 'user123', email: 'user@example.com' },
    component: 'AuthProvider'
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 1000 * 60 * 3),
    level: 'error',
    message: 'Failed to move file: File not found',
    context: { fileId: 'file123', operation: 'move' },
    component: 'FileOperations'
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 1000 * 60 * 1),
    level: 'info',
    message: 'File operation completed successfully',
    context: { fileId: 'file456', operation: 'rename' },
    component: 'FileOperations'
  }
];

const mockMetrics: PerformanceMetrics = {
  averageResponseTime: 245,
  totalRequests: 1247,
  errorRate: 2.3,
  activeUsers: 23
};

export function MonitoringDashboard() {
  const [logs, setLogs] = useState<LogEntry[]>(mockLogs);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(mockMetrics);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');

  const filteredLogs = logs.filter(log => 
    filterLevel === 'all' || log.level === filterLevel
  );

  const getLogIcon = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warn':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'debug':
        return <Activity className="h-4 w-4 text-gray-500" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getLogBadgeVariant = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return 'destructive';
      case 'warn':
        return 'secondary';
      case 'info':
        return 'default';
      case 'debug':
        return 'outline';
      default:
        return 'default';
    }
  };

  const handleRefresh = () => {
    // In a real app, this would fetch fresh data from your logging service
    logger.info('Monitoring dashboard refreshed', { component: 'MonitoringDashboard' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Monitoring</h2>
          <p className="text-muted-foreground">
            Real-time application health and performance metrics
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.averageResponseTime}ms</div>
            <p className="text-xs text-muted-foreground">
              +12% from last hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalRequests.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              +180 from last hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.errorRate}%</div>
            <p className="text-xs text-muted-foreground">
              -0.5% from last hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              +3 from last hour
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Logs and Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle>System Logs</CardTitle>
          <CardDescription>
            Real-time application logs and events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger 
                value="all" 
                onClick={() => setFilterLevel('all')}
              >
                All
              </TabsTrigger>
              <TabsTrigger 
                value="error" 
                onClick={() => setFilterLevel('error')}
              >
                Errors
              </TabsTrigger>
              <TabsTrigger 
                value="warn" 
                onClick={() => setFilterLevel('warn')}
              >
                Warnings
              </TabsTrigger>
              <TabsTrigger 
                value="info" 
                onClick={() => setFilterLevel('info')}
              >
                Info
              </TabsTrigger>
              <TabsTrigger 
                value="debug" 
                onClick={() => setFilterLevel('debug')}
              >
                Debug
              </TabsTrigger>
            </TabsList>

            <TabsContent value={filterLevel} className="mt-4">
              <ScrollArea className="h-[400px] w-full">
                <div className="space-y-3">
                  {filteredLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                      No logs found for the selected filter
                    </div>
                  ) : (
                    filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start space-x-3 p-3 rounded-lg border"
                      >
                        {getLogIcon(log.level)}
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{log.message}</p>
                            <Badge variant={getLogBadgeVariant(log.level) as any}>
                              {log.level}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>{log.timestamp.toLocaleTimeString()}</span>
                            {log.component && <span>• {log.component}</span>}
                          </div>
                          {log.context && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                View context
                              </summary>
                              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                                {JSON.stringify(log.context, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}