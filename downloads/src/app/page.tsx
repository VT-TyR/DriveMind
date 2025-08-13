import MainLayout from '@/components/shared/main-layout';
import DashboardHeader from '@/components/dashboard/dashboard-header';
import StatsGrid from '@/components/dashboard/stats-grid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import FileDistributionChart from '@/components/dashboard/file-distribution-chart';
import AiRecommendations from '@/components/dashboard/ai-recommendations';
import StorageTimelineChart from '@/components/dashboard/storage-timeline-chart';
import RecentActivity from '@/components/dashboard/recent-activity';

export default function DashboardPage() {
  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <DashboardHeader />
        <StatsGrid />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AiRecommendations />
          <StorageTimelineChart />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4">
            <CardHeader>
              <CardTitle>File Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <FileDistributionChart />
            </CardContent>
          </Card>
          <div className="col-span-1 lg:col-span-3">
             <RecentActivity />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
