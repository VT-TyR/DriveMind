'use client';

import React from 'react';
import { ProgressProvider } from '@/contexts/progress-context';
import { ErrorRecoveryProvider } from '@/contexts/error-recovery-context';
import { SchedulerProvider } from '@/contexts/scheduler-context';

interface LayoutProvidersProps {
  children: React.ReactNode;
}

export function LayoutProviders({ children }: LayoutProvidersProps) {
  return (
    <ProgressProvider>
      <ErrorRecoveryProvider>
        <SchedulerProvider>
          {children}
        </SchedulerProvider>
      </ErrorRecoveryProvider>
    </ProgressProvider>
  );
}