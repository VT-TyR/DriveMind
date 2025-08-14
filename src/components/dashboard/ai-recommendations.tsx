import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

export default function AiRecommendations() {
    // In the future, this will come from the ai_recommend flow
    const recommendations = [
        {
            title: "Clean up 5.2 GB of large files",
            description: "You have several files over 100MB that haven't been touched in over a year. Consider archiving or deleting them.",
            cta: "Review Large Files"
        },
        {
            title: "Organize your 'Downloads' folder",
            description: "There are 50+ items in your main downloads folder. Let's sort them into relevant sub-folders.",
            cta: "Organize Downloads"
        }
    ];

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
                {recommendations.map((rec, index) => (
                    <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="flex-1">
                            <p className="font-semibold">{rec.title}</p>
                            <p className="text-sm text-muted-foreground">{rec.description}</p>
                        </div>
                        <Button variant="secondary">{rec.cta}</Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
