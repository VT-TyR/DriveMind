'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useWorkflow } from '@/hooks/use-workflow';
import { useErrorRecovery } from '@/contexts/error-recovery-context';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  workflow: 'scan' | 'inventory' | 'duplicates' | 'organize' | 'batch';
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    time?: string; // HH:MM format
    dayOfWeek?: number; // 0-6, Sunday = 0
    dayOfMonth?: number; // 1-31
    executeAt?: Date; // For 'once' type
  };
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  config: Record<string, any>;
  autoRetry: boolean;
  maxRetries: number;
  retryCount: number;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: 'file_count' | 'storage_usage' | 'error_rate' | 'time_since_scan';
    threshold: number;
    operator: 'greater_than' | 'less_than' | 'equals';
  };
  action: {
    workflow: ScheduledTask['workflow'];
    config: Record<string, any>;
  };
  enabled: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}

interface SchedulerContextType {
  scheduledTasks: ScheduledTask[];
  automationRules: AutomationRule[];
  isSchedulerRunning: boolean;
  createScheduledTask: (task: Omit<ScheduledTask, 'id' | 'runCount' | 'retryCount' | 'nextRun'>) => string;
  updateScheduledTask: (id: string, updates: Partial<ScheduledTask>) => void;
  deleteScheduledTask: (id: string) => void;
  toggleTask: (id: string, enabled: boolean) => void;
  runTaskNow: (id: string) => Promise<void>;
  createAutomationRule: (rule: Omit<AutomationRule, 'id' | 'triggerCount'>) => string;
  updateAutomationRule: (id: string, updates: Partial<AutomationRule>) => void;
  deleteAutomationRule: (id: string) => void;
  toggleRule: (id: string, enabled: boolean) => void;
  startScheduler: () => void;
  stopScheduler: () => void;
  getNextRuns: (limit?: number) => { task: ScheduledTask; nextRun: Date }[];
}

const SchedulerContext = createContext<SchedulerContextType | undefined>(undefined);

export function SchedulerProvider({ children }: { children: React.ReactNode }) {
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [isSchedulerRunning, setIsSchedulerRunning] = useState(false);
  const [schedulerInterval, setSchedulerInterval] = useState<NodeJS.Timeout | null>(null);

  const { 
    scanDrive, 
    analyzeInventory, 
    detectDuplicates, 
    organizeFiles, 
    executeBatchOperations 
  } = useWorkflow();
  const { logError } = useErrorRecovery();

  // Calculate next run time based on schedule
  const calculateNextRun = useCallback((schedule: ScheduledTask['schedule'], lastRun?: Date): Date => {
    const now = new Date();
    const next = new Date();

    switch (schedule.type) {
      case 'once':
        return schedule.executeAt || now;

      case 'daily':
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
          if (next <= now) {
            next.setDate(next.getDate() + 1);
          }
        }
        break;

      case 'weekly':
        if (schedule.time && schedule.dayOfWeek !== undefined) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
          
          const daysUntilTarget = (schedule.dayOfWeek - next.getDay() + 7) % 7;
          next.setDate(next.getDate() + daysUntilTarget);
          
          if (next <= now) {
            next.setDate(next.getDate() + 7);
          }
        }
        break;

      case 'monthly':
        if (schedule.time && schedule.dayOfMonth) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
          next.setDate(schedule.dayOfMonth);
          
          if (next <= now) {
            next.setMonth(next.getMonth() + 1);
          }
        }
        break;
    }

    return next;
  }, []);

  // Execute a workflow based on type
  const executeWorkflow = useCallback(async (workflow: ScheduledTask['workflow'], config: Record<string, any>) => {
    try {
      switch (workflow) {
        case 'scan':
          return await scanDrive(config);
        case 'inventory':
          return await analyzeInventory(config);
        case 'duplicates':
          return await detectDuplicates(config);
        case 'organize':
          return await organizeFiles(config);
        case 'batch':
          return await executeBatchOperations(config.operations ? config as any : { operations: [], ...config } as any);
        default:
          throw new Error(`Unknown workflow type: ${workflow}`);
      }
    } catch (error) {
      logError(
        error instanceof Error ? error.message : String(error),
        `Scheduled ${workflow}`,
        'high',
        { config }
      );
      throw error;
    }
  }, [scanDrive, analyzeInventory, detectDuplicates, organizeFiles, executeBatchOperations, logError]);

  // Run a scheduled task
  const runScheduledTask = useCallback(async (task: ScheduledTask) => {
    try {
      await executeWorkflow(task.workflow, task.config);
      
      // Update task after successful run
      setScheduledTasks(prev => prev.map(t => 
        t.id === task.id 
          ? {
              ...t,
              lastRun: new Date(),
              nextRun: task.schedule.type !== 'once' ? calculateNextRun(task.schedule, new Date()) : undefined,
              runCount: t.runCount + 1,
              retryCount: 0,
            }
          : t
      ));

    } catch (error) {
      // Handle retry logic
      setScheduledTasks(prev => prev.map(t => 
        t.id === task.id 
          ? {
              ...t,
              retryCount: t.retryCount + 1,
              nextRun: t.autoRetry && t.retryCount < t.maxRetries 
                ? new Date(Date.now() + Math.pow(2, t.retryCount) * 60000) // Exponential backoff
                : t.schedule.type !== 'once' ? calculateNextRun(t.schedule, new Date()) : undefined,
            }
          : t
      ));
      throw error;
    }
  }, [executeWorkflow, calculateNextRun]);

  // Scheduler loop
  const schedulerTick = useCallback(() => {
    const now = new Date();
    
    scheduledTasks.forEach(async (task) => {
      if (!task.enabled || !task.nextRun || task.nextRun > now) return;
      
      try {
        await runScheduledTask(task);
      } catch (error) {
        console.error(`Scheduled task ${task.name} failed:`, error);
      }
    });

    // Check automation rules
    automationRules.forEach(async (rule) => {
      if (!rule.enabled) return;
      
      // This would check actual system metrics
      // For now, we'll skip the implementation of the trigger checking
      // In a real system, you'd check file counts, storage usage, etc.
    });
  }, [scheduledTasks, automationRules, runScheduledTask]);

  // Scheduler management
  const startScheduler = useCallback(() => {
    if (schedulerInterval) return;
    
    const interval = setInterval(schedulerTick, 60000); // Check every minute
    setSchedulerInterval(interval);
    setIsSchedulerRunning(true);
  }, [schedulerTick, schedulerInterval]);

  const stopScheduler = useCallback(() => {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      setSchedulerInterval(null);
    }
    setIsSchedulerRunning(false);
  }, [schedulerInterval]);

  // Task management
  const createScheduledTask = useCallback((taskData: Omit<ScheduledTask, 'id' | 'runCount' | 'retryCount' | 'nextRun'>): string => {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const nextRun = taskData.enabled ? calculateNextRun(taskData.schedule) : undefined;
    
    const task: ScheduledTask = {
      ...taskData,
      id,
      runCount: 0,
      retryCount: 0,
      nextRun,
    };
    
    setScheduledTasks(prev => [...prev, task]);
    return id;
  }, [calculateNextRun]);

  const updateScheduledTask = useCallback((id: string, updates: Partial<ScheduledTask>) => {
    setScheduledTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      
      const updated = { ...task, ...updates };
      
      // Recalculate next run if schedule changed
      if (updates.schedule || updates.enabled) {
        updated.nextRun = updated.enabled ? calculateNextRun(updated.schedule, updated.lastRun) : undefined;
      }
      
      return updated;
    }));
  }, [calculateNextRun]);

  const deleteScheduledTask = useCallback((id: string) => {
    setScheduledTasks(prev => prev.filter(task => task.id !== id));
  }, []);

  const toggleTask = useCallback((id: string, enabled: boolean) => {
    updateScheduledTask(id, { enabled });
  }, [updateScheduledTask]);

  const runTaskNow = useCallback(async (id: string) => {
    const task = scheduledTasks.find(t => t.id === id);
    if (task) {
      await runScheduledTask(task);
    }
  }, [scheduledTasks, runScheduledTask]);

  // Rule management
  const createAutomationRule = useCallback((ruleData: Omit<AutomationRule, 'id' | 'triggerCount'>): string => {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const rule: AutomationRule = {
      ...ruleData,
      id,
      triggerCount: 0,
    };
    
    setAutomationRules(prev => [...prev, rule]);
    return id;
  }, []);

  const updateAutomationRule = useCallback((id: string, updates: Partial<AutomationRule>) => {
    setAutomationRules(prev => prev.map(rule => 
      rule.id === id ? { ...rule, ...updates } : rule
    ));
  }, []);

  const deleteAutomationRule = useCallback((id: string) => {
    setAutomationRules(prev => prev.filter(rule => rule.id !== id));
  }, []);

  const toggleRule = useCallback((id: string, enabled: boolean) => {
    updateAutomationRule(id, { enabled });
  }, [updateAutomationRule]);

  const getNextRuns = useCallback((limit = 5) => {
    const upcomingTasks = scheduledTasks
      .filter(task => task.enabled && task.nextRun)
      .map(task => ({ task, nextRun: task.nextRun! }))
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
      .slice(0, limit);
    
    return upcomingTasks;
  }, [scheduledTasks]);

  // Auto-start scheduler
  useEffect(() => {
    startScheduler();
    return () => stopScheduler();
  }, [startScheduler, stopScheduler]);

  const contextValue: SchedulerContextType = {
    scheduledTasks,
    automationRules,
    isSchedulerRunning,
    createScheduledTask,
    updateScheduledTask,
    deleteScheduledTask,
    toggleTask,
    runTaskNow,
    createAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    toggleRule,
    startScheduler,
    stopScheduler,
    getNextRuns,
  };

  return (
    <SchedulerContext.Provider value={contextValue}>
      {children}
    </SchedulerContext.Provider>
  );
}

export function useScheduler() {
  const context = useContext(SchedulerContext);
  if (context === undefined) {
    // Return default values for SSR/build time when context is not available
    return {
      scheduledTasks: [],
      automationRules: [],
      isSchedulerRunning: false,
      addScheduledTask: () => {},
      removeScheduledTask: () => {},
      updateScheduledTask: () => {},
      addAutomationRule: () => {},
      removeAutomationRule: () => {},
      updateAutomationRule: () => {},
      startScheduler: () => {},
      stopScheduler: () => {},
      getNextRuns: () => [],
    };
  }
  return context;
}