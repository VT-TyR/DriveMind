'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useErrorRecovery } from '@/contexts/error-recovery-context';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  Download,
  Trash2,
  AlertCircle,
  XCircle,
  Zap
} from 'lucide-react';

interface ErrorRecoveryPanelProps {
  className?: string;
}

export function ErrorRecoveryPanel({ className = '' }: ErrorRecoveryPanelProps) {
  const { 
    errors, 
    clearErrors, 
    getRecoveryActions, 
    exportErrorLog,
    markRecovered 
  } = useErrorRecovery();

  const recentErrors = errors.slice(0, 10);
  const criticalErrors = errors.filter(e => e.severity === 'critical' && !e.recovered);
  const recoveryRate = errors.length > 0 ? (errors.filter(e => e.recovered).length / errors.length) * 100 : 0;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'high':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const handleExportLog = () => {
    const logData = exportErrorLog();
    const blob = new Blob([logData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drivemind-error-log-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (errors.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            System Status: Healthy
          </CardTitle>
          <CardDescription>
            No errors detected. All workflows are running smoothly.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Error Recovery Center
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportLog}
              className="gap-1"
            >
              <Download className="h-3 w-3" />
              Export Log
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearErrors}
              className="gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Clear All
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Recovery rate: {recoveryRate.toFixed(1)}% ({errors.filter(e => e.recovered).length}/{errors.length})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="recent" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="recent">Recent Errors</TabsTrigger>
            <TabsTrigger value="critical">
              Critical ({criticalErrors.length})
            </TabsTrigger>
            <TabsTrigger value="recovery">Recovery Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="space-y-4">
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {recentErrors.map((error) => (
                  <Card key={error.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {getSeverityIcon(error.severity)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getSeverityColor(error.severity)}`}
                            >
                              {error.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {error.context}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {error.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate">{error.error}</p>
                          {error.recovered && (
                            <div className="flex items-center gap-1 mt-1">
                              <CheckCircle className="h-3 w-3 text-green-600" />
                              <span className="text-xs text-green-600">
                                Recovered: {error.recoveryAction}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {!error.recovered && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markRecovered(error.id, 'Manually resolved')}
                          className="gap-1"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Mark Fixed
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="critical" className="space-y-4">
            {criticalErrors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
                <p>No critical errors to resolve</p>
              </div>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {criticalErrors.map((error) => (
                    <Card key={error.id} className="p-3 border-red-200 bg-red-50">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-900">{error.error}</p>
                          <p className="text-xs text-red-700 mt-1">{error.context}</p>
                          <div className="flex gap-2 mt-2">
                            {getRecoveryActions(error.id).slice(0, 2).map((action) => (
                              <Button
                                key={action.id}
                                size="sm"
                                variant="outline"
                                onClick={action.action}
                                className="gap-1 text-xs"
                              >
                                <RefreshCw className="h-3 w-3" />
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="recovery" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Auto-Recovery</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Automatic retry with optimized settings
                </p>
                <Button size="sm" className="w-full">Enable Auto-Recovery</Button>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="h-4 w-4 text-green-600" />
                  <span className="font-medium">System Reset</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Clear cache and refresh connections
                </p>
                <Button size="sm" variant="outline" className="w-full">Reset System</Button>
              </Card>
            </div>

            <Card className="p-4">
              <h4 className="font-medium mb-2">Common Recovery Actions</h4>
              <div className="space-y-2">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <RefreshCw className="h-3 w-3" />
                  Refresh Google Drive tokens
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <AlertTriangle className="h-3 w-3" />
                  Reduce workflow complexity
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <Clock className="h-3 w-3" />
                  Increase timeout limits
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}