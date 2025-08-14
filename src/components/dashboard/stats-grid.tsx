import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Folder, File, Copy, HardDrive } from 'lucide-react';

const stats = [
  {
    title: 'Total Files',
    value: '10,240',
    icon: <File className="h-4 w-4 text-muted-foreground" />,
  },
  {
    title: 'Total Folders',
    value: '512',
    icon: <Folder className="h-4 w-4 text-muted-foreground" />,
  },
  {
    title: 'Duplicates Found',
    value: '1,280',
    icon: <Copy className="h-4 w-4 text-muted-foreground" />,
  },
  {
    title: 'Space Used',
    value: '25.6 GB',
    icon: <HardDrive className="h-4 w-4 text-muted-foreground" />,
  },
];

export default function StatsGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
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
