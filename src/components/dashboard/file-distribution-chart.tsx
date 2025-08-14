'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { DashboardStats, getFileTypeColor } from '@/lib/dashboard-service';

interface FileDistributionChartProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export default function FileDistributionChart({ stats, isLoading = false }: FileDistributionChartProps) {
  const data = stats ? stats.fileTypeDistribution.map(item => ({
    name: item.type,
    total: item.count,
    color: getFileTypeColor(item.type)
  })) : [];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const sizeInfo = stats?.fileTypeDistribution.find(item => item.type === label);
      return (
        <div className="bg-background border border-border rounded p-2 shadow-md">
          <p className="font-semibold">{label}</p>
          <p>Files: {data.total.toLocaleString()}</p>
          {sizeInfo && (
            <p>Size: {formatBytes(sizeInfo.size)}</p>
          )}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[350px]">
        <div className="text-muted-foreground">Loading chart...</div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[350px]">
        <div className="text-muted-foreground">No data available</div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <XAxis
          dataKey="name"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => value > 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString()}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="total"
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
