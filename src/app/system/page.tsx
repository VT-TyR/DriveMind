'use client';

import React, { useState } from 'react';

// Prevent static generation for this page
export const dynamic = 'force-dynamic';
import { EnhancedMainLayout } from '@/components/ui/enhanced-main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ProgressIndicator } from '@/components/ui/progress-indicator';
import { ErrorRecoveryPanel } from '@/components/ui/error-recovery-panel';
import { WorkflowReports } from '@/components/ui/workflow-reports';
import { useProgress } from '@/contexts/progress-context';
import { useErrorRecovery } from '@/contexts/error-recovery-context';
import { useScheduler } from '@/contexts/scheduler-context';
import { useAuth } from '@/contexts/auth-context';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { 
  Settings,
  Activity,
  AlertTriangle,
  Clock,
  Zap,
  BarChart3,
  Play,
  Pause,
  Plus,
  Calendar,
  CheckCircle,
  XCircle
} from 'lucide-react';

export default function SystemPage() {
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { tasks, clearCompleted } = useProgress();
  const { errors, clearErrors, exportErrorLog } = useErrorRecovery();
  const { 
    scheduledTasks, 
    automationRules, 
    isSchedulerRunning,
    startScheduler,
    stopScheduler,
    getNextRuns
  } = useScheduler();

  const [activeTab, setActiveTab] = useState('overview');

  // Mock workflow results for demonstration
  const mockResults = [
    {
      id: '1',
      type: 'scan' as const,
      timestamp: new Date(Date.now() - 86400000),
      duration: 45000,
      status: 'success' as const,
      metrics: { totalFiles: 1250, filesProcessed: 1250, spaceSaved: 0, duplicatesFound: 0 },
      insights: ['Found 1,250 files across 15 folders', 'Detected 8 large files over 100MB'],
      recommendations: [
        { type: 'cleanup', priority: 'medium' as const, description: 'Archive old files from 2022', impact: 25 }
      ]
    },
    {
      id: '2',
      type: 'duplicates' as const,
      timestamp: new Date(Date.now() - 43200000),
      duration: 32000,
      status: 'success' as const,
      metrics: { duplicatesFound: 15, spaceSaved: 524288000, totalFiles: 0, filesProcessed: 0 },
      insights: ['Found 15 duplicate groups', 'Potential space savings: 500MB'],
      recommendations: [
        { type: 'duplicate_cleanup', priority: 'high' as const, description: 'Remove 15 duplicate files', impact: 40 }
      ]
    }
  ];

  const nextRuns = getNextRuns(3);
  const recentErrors = errors.slice(0, 5);
  const activeTasks = tasks.filter(t => t.status === 'running');

  if (!user) {
    return (
      <EnhancedMainLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">System Management</h2>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <h3 className="text-lg font-medium mb-2">Authentication Required</h3>
              <p className="text-muted-foreground">Please sign in to access system management features.</p>
            </CardContent>
          </Card>
        </div>
      </EnhancedMainLayout>
    );
  }

  return (
    <EnhancedMainLayout showErrorPanel={false}>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">System Management</h2>
            <Badge variant={isAiEnabled ? 'default' : 'secondary'}>
              AI {isAiEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isSchedulerRunning ? 'default' : 'secondary'}>
              Scheduler {isSchedulerRunning ? 'Running' : 'Stopped'}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* System Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{activeTasks.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {tasks.filter(t => t.status === 'completed').length} completed today
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Errors</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {errors.filter(e => !e.recovered).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {errors.filter(e => e.recovered).length} recovered
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Scheduled Tasks</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{scheduledTasks.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {scheduledTasks.filter(t => t.enabled).length} enabled
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Automation Rules</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{automationRules.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {automationRules.filter(r => r.enabled).length} active rules
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common system management tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">Scheduler</p>
                      <p className="text-sm text-muted-foreground">
                        {isSchedulerRunning ? 'Currently running' : 'Currently stopped'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={isSchedulerRunning ? stopScheduler : startScheduler}
                      variant={isSchedulerRunning ? "destructive" : "default"}
                      className="gap-1"
                    >
                      {isSchedulerRunning ? (
                        <><Pause className="h-3 w-3" />Stop</>
                      ) : (
                        <><Play className="h-3 w-3" />Start</>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">Clear Completed Tasks</p>
                      <p className="text-sm text-muted-foreground">
                        {tasks.filter(t => t.status === 'completed').length} completed
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={clearCompleted}>
                      Clear
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">Export Error Log</p>
                      <p className="text-sm text-muted-foreground">
                        {errors.length} total errors
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={exportErrorLog}>
                      Export
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Tasks */}
            {nextRuns.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Upcoming Scheduled Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {nextRuns.map(({ task, nextRun }, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <p className="font-medium">{task.name}</p>
                          <p className="text-sm text-muted-foreground">{task.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{nextRun.toLocaleDateString()}</p>
                          <p className="text-sm text-muted-foreground">{nextRun.toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="progress">
            <ProgressIndicator showCompleted={true} maxTasks={10} />
          </TabsContent>

          <TabsContent value="errors">
            <ErrorRecoveryPanel />
          </TabsContent>

          <TabsContent value="scheduler" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Scheduled Tasks</CardTitle>
                  <CardDescription>
                    Manage recurring workflow executions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {scheduledTasks.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No scheduled tasks configured
                      </p>
                    ) : (
                      scheduledTasks.map((task) => (
                        <div key={task.id} className="flex items-center justify-between p-3 border rounded">
                          <div>
                            <p className="font-medium">{task.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {task.schedule.type} • {task.runCount} runs
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={task.enabled ? 'default' : 'secondary'}>
                              {task.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                            <Switch
                              checked={task.enabled}
                              onCheckedChange={(enabled) => {
                                // This would call toggleTask(task.id, enabled)
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                    <Button className="w-full gap-1">
                      <Plus className="h-3 w-3" />
                      Add Scheduled Task
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Automation Rules</CardTitle>
                  <CardDescription>
                    Trigger workflows based on conditions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {automationRules.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No automation rules configured
                      </p>
                    ) : (
                      automationRules.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between p-3 border rounded">
                          <div>
                            <p className="font-medium">{rule.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {rule.trigger.type} • {rule.triggerCount} triggers
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                              {rule.enabled ? 'Active' : 'Inactive'}
                            </Badge>
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={(enabled) => {
                                // This would call toggleRule(rule.id, enabled)
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                    <Button className="w-full gap-1">
                      <Plus className="h-3 w-3" />
                      Add Automation Rule
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="reports">
            <WorkflowReports results={mockResults} />
          </TabsContent>
        </Tabs>
      </div>
    </EnhancedMainLayout>
  );
}