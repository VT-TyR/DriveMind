import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DashboardStats } from '@/lib/dashboard-service';

interface RecentActivityProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export default function RecentActivity({ stats, isLoading = false }: RecentActivityProps) {
    // Generate activities from real data
    const activities = stats ? stats.recentActivity.slice(0, 4).map((activity, index) => ({
        id: index + 1,
        action: activity.action,
        item: activity.file.name,
        status: "Completed",
        time: formatTimeAgo(activity.date)
    })) : [];

    function formatTimeAgo(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor(diff / (1000 * 60));

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Recent Activity</CardTitle>
                    <CardDescription>Recent file modifications and changes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-muted-foreground text-center py-6">
                        Loading activity...
                    </div>
                </CardContent>
            </Card>
        );
    }
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Recent Activity</CardTitle>
                <CardDescription>Recent file modifications and changes.</CardDescription>
            </CardHeader>
            <CardContent>
                {activities.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Action</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {activities.map((activity) => (
                                <TableRow key={activity.id}>
                                    <TableCell>
                                        <Badge variant={activity.action === 'Restore' ? 'default' : 'secondary'} className="capitalize">{activity.action}</Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">{activity.item}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{activity.time}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-muted-foreground text-center py-6">
                        No recent activity to display.
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
