'use client';

import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { FloatingProgressIndicator } from '@/components/ui/progress-indicator';
import { ErrorRecoveryPanel } from '@/components/ui/error-recovery-panel';
import { useErrorRecovery } from '@/contexts/error-recovery-context';

interface EnhancedMainLayoutProps {
  children: React.ReactNode;
  showErrorPanel?: boolean;
}

export function EnhancedMainLayout({ 
  children, 
  showErrorPanel = true 
}: EnhancedMainLayoutProps) {
  const { errors } = useErrorRecovery();
  const hasRecentErrors = errors.filter(e => !e.recovered).length > 0;

  return (
    <MainLayout>
      {children}
      <FloatingProgressIndicator />
      {showErrorPanel && hasRecentErrors && (
        <div className="fixed top-4 right-4 w-80 z-40">
          <ErrorRecoveryPanel />
        </div>
      )}
    </MainLayout>
  );
}