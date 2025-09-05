'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface ProgressTask {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number; // 0-100
  startTime?: Date;
  endTime?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

interface ProgressContextType {
  tasks: ProgressTask[];
  createTask: (name: string, description?: string, metadata?: Record<string, any>) => string;
  updateTask: (id: string, updates: Partial<ProgressTask>) => void;
  completeTask: (id: string, metadata?: Record<string, any>) => void;
  errorTask: (id: string, error: string, metadata?: Record<string, any>) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  getTask: (id: string) => ProgressTask | undefined;
}

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<ProgressTask[]>([]);
  const { user } = useAuth();

  // Auto-cleanup completed tasks after 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(currentTasks => 
        currentTasks.filter(task => {
          if (task.status === 'completed' && task.endTime) {
            const timeDiff = Date.now() - task.endTime.getTime();
            return timeDiff < 30000; // Keep for 30 seconds
          }
          return true;
        })
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const createTask = useCallback((name: string, description?: string, metadata?: Record<string, any>): string => {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const newTask: ProgressTask = {
      id,
      name,
      description,
      status: 'pending',
      progress: 0,
      startTime: new Date(),
      metadata,
    };

    setTasks(prev => [...prev, newTask]);
    
    // Automatically start the task
    setTimeout(() => {
      setTasks(prev => prev.map(task => 
        task.id === id 
          ? { ...task, status: 'running', startTime: new Date() }
          : task
      ));
    }, 100);

    return id;
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<ProgressTask>) => {
    setTasks(prev => prev.map(task => 
      task.id === id 
        ? { ...task, ...updates }
        : task
    ));
  }, []);

  const completeTask = useCallback((id: string, metadata?: Record<string, any>) => {
    setTasks(prev => prev.map(task => 
      task.id === id 
        ? { 
            ...task, 
            status: 'completed', 
            progress: 100, 
            endTime: new Date(),
            metadata: metadata ? { ...task.metadata, ...metadata } : task.metadata
          }
        : task
    ));
  }, []);

  const errorTask = useCallback((id: string, error: string, metadata?: Record<string, any>) => {
    setTasks(prev => prev.map(task => 
      task.id === id 
        ? { 
            ...task, 
            status: 'error', 
            error, 
            endTime: new Date(),
            metadata: metadata ? { ...task.metadata, ...metadata } : task.metadata
          }
        : task
    ));
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(task => task.status !== 'completed'));
  }, []);

  const getTask = useCallback((id: string): ProgressTask | undefined => {
    return tasks.find(task => task.id === id);
  }, [tasks]);

  const contextValue: ProgressContextType = {
    tasks,
    createTask,
    updateTask,
    completeTask,
    errorTask,
    removeTask,
    clearCompleted,
    getTask,
  };

  return (
    <ProgressContext.Provider value={contextValue}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (context === undefined) {
    // Return default values for SSR/build time when context is not available
    return {
      tasks: [],
      createTask: () => '',
      updateTask: () => {},
      completeTask: () => {},
      errorTask: () => {},
      removeTask: () => {},
      clearCompleted: () => {},
      getTask: () => undefined,
    };
  }
  return context;
}