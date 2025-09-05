'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProgress } from '@/contexts/progress-context';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Activity, 
  X,
  Trash2
} from 'lucide-react';

interface ProgressIndicatorProps {
  className?: string;
  showCompleted?: boolean;
  maxTasks?: number;
}

export function ProgressIndicator({ 
  className = '', 
  showCompleted = true,
  maxTasks = 5 
}: ProgressIndicatorProps) {
  const { tasks, removeTask, clearCompleted } = useProgress();

  const filteredTasks = tasks
    .filter(task => showCompleted || task.status !== 'completed')
    .slice(0, maxTasks);

  if (filteredTasks.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Activity className="h-4 w-4 text-blue-600 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <Card className={`${className} fixed bottom-4 right-4 w-96 max-h-96 overflow-hidden z-50 shadow-lg`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Progress Tracker</span>
          <div className="flex gap-1">
            {completedCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearCompleted}
                className="h-6 w-6 p-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-64 overflow-y-auto">
        {filteredTasks.map((task) => (
          <div key={task.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getStatusIcon(task.status)}
                <span className="text-sm font-medium truncate">{task.name}</span>
                <Badge 
                  variant="secondary" 
                  className={`text-xs ${getStatusColor(task.status)}`}
                >
                  {task.status}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeTask(task.id)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            
            {task.description && (
              <p className="text-xs text-muted-foreground truncate pl-6">
                {task.description}
              </p>
            )}
            
            {task.status === 'running' && (
              <div className="pl-6">
                <Progress value={task.progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {task.progress}% complete
                </p>
              </div>
            )}
            
            {task.error && (
              <p className="text-xs text-red-600 pl-6 bg-red-50 p-2 rounded">
                {task.error}
              </p>
            )}
            
            {task.status === 'completed' && task.metadata && (
              <div className="pl-6 text-xs text-muted-foreground">
                {task.metadata.filesProcessed && (
                  <span>Processed {task.metadata.filesProcessed} files</span>
                )}
                {task.metadata.duration && (
                  <span> in {task.metadata.duration}ms</span>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function FloatingProgressIndicator() {
  return <ProgressIndicator showCompleted={false} maxTasks={3} />;
}