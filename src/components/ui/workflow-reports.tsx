'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Download,
  TrendingUp,
  TrendingDown,
  Files,
  HardDrive,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';

interface WorkflowResult {
  id: string;
  type: 'scan' | 'inventory' | 'duplicates' | 'organize' | 'batch';
  timestamp: Date;
  duration: number;
  status: 'success' | 'partial' | 'failed';
  metrics: Record<string, number>;
  insights: string[];
  recommendations: Array<{
    type: string;
    priority: 'low' | 'medium' | 'high';
    description: string;
    impact: number;
  }>;
}

interface WorkflowReportsProps {
  results: WorkflowResult[];
  className?: string;
}

export function WorkflowReports({ results, className = '' }: WorkflowReportsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [activeTab, setActiveTab] = useState('overview');

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  // Filter results by selected period
  const filteredResults = useMemo(() => {
    if (selectedPeriod === 'all') return results;
    
    const cutoffDate = new Date();
    const days = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return results.filter(result => result.timestamp >= cutoffDate);
  }, [results, selectedPeriod]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const stats = {
      totalRuns: filteredResults.length,
      successRate: 0,
      averageDuration: 0,
      totalFilesProcessed: 0,
      totalSpaceSaved: 0,
      totalDuplicatesFound: 0,
      trends: {
        runs: 0,
        duration: 0,
        success: 0,
      }
    };

    if (filteredResults.length === 0) return stats;

    const successful = filteredResults.filter(r => r.status === 'success').length;
    stats.successRate = (successful / filteredResults.length) * 100;
    
    stats.averageDuration = filteredResults.reduce((sum, r) => sum + r.duration, 0) / filteredResults.length;
    
    stats.totalFilesProcessed = filteredResults.reduce((sum, r) => 
      sum + (r.metrics.filesProcessed || r.metrics.totalFiles || 0), 0);
    
    stats.totalSpaceSaved = filteredResults.reduce((sum, r) => 
      sum + (r.metrics.spaceSaved || 0), 0);
    
    stats.totalDuplicatesFound = filteredResults.reduce((sum, r) => 
      sum + (r.metrics.duplicatesFound || r.metrics.duplicateGroups || 0), 0);

    // Calculate trends (compare last half with first half)
    const midpoint = Math.floor(filteredResults.length / 2);
    if (midpoint > 0) {
      const firstHalf = filteredResults.slice(0, midpoint);
      const secondHalf = filteredResults.slice(midpoint);
      
      const firstHalfSuccess = firstHalf.filter(r => r.status === 'success').length / firstHalf.length * 100;
      const secondHalfSuccess = secondHalf.filter(r => r.status === 'success').length / secondHalf.length * 100;
      
      stats.trends.success = secondHalfSuccess - firstHalfSuccess;
    }

    return stats;
  }, [filteredResults]);

  // Prepare chart data
  const chartData = useMemo(() => {
    // Group by day for timeline chart
    const timelineData = filteredResults.reduce((acc, result) => {
      const day = result.timestamp.toISOString().split('T')[0];
      if (!acc[day]) {
        acc[day] = { date: day, runs: 0, success: 0, failed: 0, duration: 0 };
      }
      acc[day].runs++;
      acc[day].duration += result.duration;
      if (result.status === 'success') acc[day].success++;
      else acc[day].failed++;
      return acc;
    }, {} as Record<string, any>);

    // Workflow type distribution
    const typeDistribution = filteredResults.reduce((acc, result) => {
      acc[result.type] = (acc[result.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      timeline: Object.values(timelineData),
      types: Object.entries(typeDistribution).map(([name, value]) => ({ name, value })),
    };
  }, [filteredResults]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      period: selectedPeriod,
      summary: summaryStats,
      results: filteredResults.map(result => ({
        ...result,
        timestamp: result.timestamp.toISOString(),
      })),
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drivemind-report-${selectedPeriod}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (results.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Workflow Reports
          </CardTitle>
          <CardDescription>
            No workflow data available yet. Run some workflows to see reports.
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
            <BarChart3 className="h-5 w-5" />
            Workflow Reports
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className="px-3 py-1 border rounded text-sm"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            <Button size="sm" variant="outline" onClick={exportReport} className="gap-1">
              <Download className="h-3 w-3" />
              Export
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="recommendations">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">Total Runs</span>
                </div>
                <div className="text-2xl font-bold mt-1">{summaryStats.totalRuns}</div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Success Rate</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-green-600">
                  {summaryStats.successRate.toFixed(1)}%
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium">Avg Duration</span>
                </div>
                <div className="text-2xl font-bold mt-1">
                  {formatDuration(summaryStats.averageDuration)}
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Files className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium">Files Processed</span>
                </div>
                <div className="text-2xl font-bold mt-1">
                  {summaryStats.totalFilesProcessed.toLocaleString()}
                </div>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-4">
                <h3 className="font-semibold mb-4">Workflow Timeline</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="runs" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-4">Workflow Types</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={chartData.types}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {chartData.types.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-4">
                <h3 className="font-semibold mb-4">Performance Trends</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Success Rate Trend</span>
                    <div className="flex items-center gap-1">
                      {summaryStats.trends.success > 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      <span className={`text-sm font-medium ${
                        summaryStats.trends.success > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {summaryStats.trends.success > 0 ? '+' : ''}{summaryStats.trends.success.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <Progress value={Math.abs(summaryStats.trends.success)} className="h-2" />
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-4">Resource Impact</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Space Saved</span>
                    <span className="font-medium text-green-600">
                      {formatFileSize(summaryStats.totalSpaceSaved)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Duplicates Removed</span>
                    <span className="font-medium text-blue-600">
                      {summaryStats.totalDuplicatesFound}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Files Organized</span>
                    <span className="font-medium text-purple-600">
                      {summaryStats.totalFilesProcessed.toLocaleString()}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {filteredResults.slice(0, 10).map((result) => (
                  <Card key={result.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                            {result.type}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {result.timestamp.toLocaleDateString()} {result.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {result.insights.slice(0, 3).map((insight, index) => (
                            <p key={index} className="text-sm text-muted-foreground">• {insight}</p>
                          ))}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {formatDuration(result.duration)}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-4">
            <div className="space-y-3">
              {filteredResults
                .flatMap(result => result.recommendations)
                .sort((a, b) => {
                  const priorityOrder = { high: 3, medium: 2, low: 1 };
                  return priorityOrder[b.priority] - priorityOrder[a.priority];
                })
                .slice(0, 10)
                .map((rec, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge 
                            variant={
                              rec.priority === 'high' ? 'destructive' : 
                              rec.priority === 'medium' ? 'default' : 'secondary'
                            }
                          >
                            {rec.priority} priority
                          </Badge>
                          <Badge variant="outline">{rec.type}</Badge>
                        </div>
                        <p className="text-sm">{rec.description}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-xs text-muted-foreground">Potential impact:</span>
                          <Progress value={rec.impact} className="h-1 w-20" />
                          <span className="text-xs text-muted-foreground">{rec.impact}%</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Apply
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}