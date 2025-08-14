import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Folder, File, Copy, HardDrive } from 'lucide-react';
import { DashboardStats, formatBytes } from '@/lib/dashboard-service';

interface StatsGridProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export default function StatsGrid({ stats, isLoading = false }: StatsGridProps) {
  const statsData = [
    {
      title: 'Total Files',
      value: isLoading ? '...' : stats ? stats.totalFiles.toLocaleString() : '0',
      icon: <File className="h-4 w-4 text-muted-foreground" />,
    },
    {
      title: 'Total Folders',
      value: isLoading ? '...' : stats ? stats.folderCount.toLocaleString() : '0',
      icon: <Folder className="h-4 w-4 text-muted-foreground" />,
    },
    {
      title: 'Duplicates Found',
      value: isLoading ? '...' : stats ? stats.duplicateFiles.toLocaleString() : '0',
      icon: <Copy className="h-4 w-4 text-muted-foreground" />,
    },
    {
      title: 'Space Used',
      value: isLoading ? '...' : stats ? formatBytes(stats.totalSize) : '0 Bytes',
      icon: <HardDrive className="h-4 w-4 text-muted-foreground" />,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statsData.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            {stat.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
