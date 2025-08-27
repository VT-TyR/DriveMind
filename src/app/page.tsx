'use client';

import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import DashboardHeader from '@/components/dashboard/dashboard-header';
import StatsGrid from '@/components/dashboard/stats-grid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import FileDistributionChart from '@/components/dashboard/file-distribution-chart';
import AiRecommendations from '@/components/dashboard/ai-recommendations';
import StorageTimelineChart from '@/components/dashboard/storage-timeline-chart';
import RecentActivity from '@/components/dashboard/recent-activity';
import { useAuth } from '@/contexts/auth-context';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { calculateDashboardStats, DashboardStats } from '@/lib/dashboard-service';
import { File } from '@/lib/types';
import { markDuplicates } from '@/lib/duplicate-detection';
import { DeploymentStatus } from '@/components/deployment-status';

function mapMimeTypeToFileType(mimeType: string): File['type'] {
  if (mimeType === 'application/vnd.google-apps.folder') return 'Folder';
  if (mimeType === 'application/vnd.google-apps.document') return 'Document';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Spreadsheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Presentation';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  return 'Other';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [needsDriveConnection, setNeedsDriveConnection] = React.useState(false);

  React.useEffect(() => {
    async function fetchDashboardData() {
      if (!user) {
        setStats(null);
        setIsLoading(false);
        setNeedsDriveConnection(false);
        return;
      }

      try {
        const authData = { uid: user.uid, email: user.email || undefined };
        const { files: driveFiles } = await listSampleFiles({ auth: authData });
        
        const mappedFiles: File[] = driveFiles.map(f => ({
          id: f.id,
          name: f.name,
          type: mapMimeTypeToFileType(f.mimeType || ''),
          size: Number(f.size || 0),
          lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
          isDuplicate: false,
          path: [],
          vaultScore: null,
        }));

        const filesWithDuplicates = markDuplicates(mappedFiles);
        const dashboardStats = calculateDashboardStats(filesWithDuplicates);
        setStats(dashboardStats);
        setNeedsDriveConnection(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // Check if this is a Drive connection error or OAuth credentials error
        if (error instanceof Error) {
          if (error.message.includes('No Google Drive connection') || 
              error.message.includes('Missing Google OAuth credentials') ||
              error.message.includes('Please connect your account first')) {
            console.log('User needs to connect Google Drive first');
            setNeedsDriveConnection(true);
            setStats(null);
            return;
          }
        }
        setStats(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, [user]);

  if (!user) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
          <DashboardHeader />
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-medium mb-2">Sign in Required</h3>
            <p className="text-muted-foreground mb-4">
              Please sign in with your Google account to view your Drive dashboard.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (needsDriveConnection) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
          <DashboardHeader />
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-medium mb-2">Connect Google Drive</h3>
            <p className="text-muted-foreground mb-4">
              To view your dashboard, please connect your Google Drive account in the AI/Dev section.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <DashboardHeader />
        <DeploymentStatus />
        <StatsGrid stats={stats} isLoading={isLoading} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AiRecommendations stats={stats} isLoading={isLoading} />
          <StorageTimelineChart stats={stats} isLoading={isLoading} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4">
            <CardHeader>
              <CardTitle>File Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <FileDistributionChart stats={stats} isLoading={isLoading} />
            </CardContent>
          </Card>
          <div className="col-span-1 lg:col-span-3">
             <RecentActivity stats={stats} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
