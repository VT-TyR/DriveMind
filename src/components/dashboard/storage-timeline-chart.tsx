
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { DashboardStats, generateStorageTimelineData } from '@/lib/dashboard-service';

interface StorageTimelineChartProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export default function StorageTimelineChart({ stats, isLoading = false }: StorageTimelineChartProps) {
  // Generate timeline data based on current stats
  const data = stats ? generateStorageTimelineData([]) : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Storage Growth Timeline</CardTitle>
          <CardDescription>
            Your storage usage over time and projected growth.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-muted-foreground">Loading timeline...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Storage Growth Timeline</CardTitle>
          <CardDescription>
            Your storage usage over time and projected growth.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-muted-foreground">No data available</div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
        <CardHeader>
            <CardTitle className="font-headline">Storage Growth Timeline</CardTitle>
            <CardDescription>
                Your storage usage over time. The dotted line shows predicted growth based on current trends.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="month"
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
                  tickFormatter={(value) => `${value} GB`}
                />
                <Tooltip
                    contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                    }}
                    cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 2 }}
                />
                <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorTotal)" />
                <Area type="monotone" dataKey="predicted" stroke="hsl(var(--primary))" strokeDasharray="3 3" fill="transparent" />
                 <ReferenceLine y={100} label={{ value: 'Drive Full (100 GB)', position: 'insideTopLeft' }} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
        </CardContent>
    </Card>
  );
}
