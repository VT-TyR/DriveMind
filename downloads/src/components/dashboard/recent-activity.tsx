import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function RecentActivity() {
    // In the future, this will come from the /changeLogs collection
    const activities = [
        { id: 1, action: "Trash", item: "Old_Project_Backup.zip", status: "Completed", time: "2m ago" },
        { id: 2, action: "Move", item: "Q1_Report.pdf to /Finance", status: "Completed", time: "1h ago" },
        { id: 3, action: "Restore", item: "Draft_v1.docx", status: "Completed", time: "3h ago" },
        { id: 4, action: "Trash", item: "Temporary_screenshot.png", status: "Completed", time: "1d ago" },
    ];
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Recent Activity</CardTitle>
                <CardDescription>A log of the most recent actions taken by DriveMind.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
        </Card>
    )
}
