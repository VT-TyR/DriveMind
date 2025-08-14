import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";
import { DashboardStats, formatBytes } from '@/lib/dashboard-service';

interface AiRecommendationsProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export default function AiRecommendations({ stats, isLoading = false }: AiRecommendationsProps) {
    // Generate recommendations based on actual data
    const recommendations = React.useMemo(() => {
        if (!stats) return [];
        
        const recs = [];
        
        // Duplicate files recommendation
        if (stats.duplicateFiles > 0) {
            recs.push({
                title: `Clean up ${stats.duplicateFiles} duplicate files`,
                description: `You have ${stats.duplicateFiles} duplicate files taking up ${formatBytes(stats.duplicateSize)}. Remove them to free up space.`,
                cta: "View Duplicates"
            });
        }
        
        // Large files recommendation
        if (stats.largestFiles.length > 0) {
            const largeFileCount = stats.largestFiles.filter(f => f.size > 100 * 1024 * 1024).length; // > 100MB
            if (largeFileCount > 0) {
                recs.push({
                    title: `Review ${largeFileCount} large files`,
                    description: `You have ${largeFileCount} files over 100MB. Consider archiving or deleting files you no longer need.`,
                    cta: "Review Large Files"
                });
            }
        }
        
        // Old files recommendation
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const oldFiles = stats.oldestFiles.filter(f => f.lastModified < oneYearAgo).length;
        if (oldFiles > 5) {
            recs.push({
                title: `Archive ${oldFiles} old files`,
                description: `You have ${oldFiles} files that haven't been modified in over a year. Consider archiving them.`,
                cta: "View Old Files"
            });
        }
        
        return recs.slice(0, 3); // Show max 3 recommendations
    }, [stats]);

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline">
                        <Lightbulb className="text-accent" />
                        AI Recommendations
                    </CardTitle>
                    <CardDescription>Proactive suggestions from DriveMind to keep your storage tidy.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-muted-foreground text-center py-6">
                        Analyzing your files...
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline">
                    <Lightbulb className="text-accent" />
                    AI Recommendations
                </CardTitle>
                <CardDescription>Proactive suggestions from DriveMind to keep your storage tidy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {recommendations.length > 0 ? (
                    recommendations.map((rec, index) => (
                        <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
                            <div className="flex-1">
                                <p className="font-semibold">{rec.title}</p>
                                <p className="text-sm text-muted-foreground">{rec.description}</p>
                            </div>
                            <Button variant="secondary">{rec.cta}</Button>
                        </div>
                    ))
                ) : (
                    <div className="text-muted-foreground text-center py-6">
                        Great! No immediate recommendations. Your Drive looks well organized.
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
