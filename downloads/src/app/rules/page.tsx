
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ListChecks, Play, Sparkles } from 'lucide-react';
import { proposeRules } from '@/ai/flows/ai-propose-rules';
import { rulesRun } from '@/ai/flows/rules-run';
import type { ProposeRulesOutput } from '@/lib/ai-types';
import { useOperatingMode } from '@/contexts/operating-mode-context';


// This is a temporary mock authentication object.
const mockAuth = { uid: 'user-1234' };


export default function RulesPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isProposing, setIsProposing] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [rule, setRule] = React.useState<ProposeRulesOutput | null>(null);
  const [runResult, setRunResult] = React.useState<any>(null);
  const { toast } = useToast();
  const { isAiEnabled } = useOperatingMode();

  const handleProposeRule = async () => {
    if (!prompt) return;
    setIsLoading(true);
    setIsProposing(true);
    setRule(null);
    setRunResult(null);
    try {
      const result = await proposeRules({ prompt, auth: mockAuth });
      setRule(result);
      toast({
        title: 'Rule Proposed',
        description: 'AI has drafted a rule based on your prompt. Review the JSON below.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to Propose Rule',
        description: error.message,
      });
    }
    setIsLoading(false);
    setIsProposing(false);
  };
  
  const handleRunRule = async () => {
      if (!rule) return;
      setIsLoading(true);
      setRunResult(null);
      try {
          // In a production app, the 'rulesRun' flow would source the files directly
          // from the user's authenticated Google Drive. We don't pass them from the client.
          const result = await rulesRun({ ruleId: rule.ruleId, auth: mockAuth });
          setRunResult(result);
          toast({
              title: 'Rule Run Complete',
              description: `A simulated batch with ${result.count} files has been created.`
          });
      } catch (error: any) {
          toast({
              variant: 'destructive',
              title: 'Failed to Run Rule',
              description: error.message,
          });
      }
      setIsLoading(false);
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Rules Engine
            </h2>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ListChecks /> Create and Manage Rules</CardTitle>
            <CardDescription>
              Define rules using natural language to automate file organization. The AI will convert your instructions into an executable plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
                <label htmlFor="rule-prompt" className="font-medium text-sm">Describe your rule</label>
                <Textarea
                    id="rule-prompt"
                    placeholder="e.g., 'Archive all invoices older than 1 year' or 'Delete any file ending in .tmp'"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={!isAiEnabled || isLoading}
                />
            </div>
            <Button onClick={handleProposeRule} disabled={isLoading || !prompt || !isAiEnabled}>
                <Sparkles className="mr-2" /> {isProposing ? 'Proposing...' : 'Propose Rule with AI'}
            </Button>
            {!isAiEnabled && (
                <p className="text-sm text-destructive mt-2">Enable AI-Assisted mode to propose rules.</p>
            )}
          </CardContent>
        </Card>

        {rule && (
          <Card>
            <CardHeader>
              <CardTitle>Drafted Rule</CardTitle>
              <CardDescription>This is the structured rule the AI generated. You can now run it to find matching files.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="p-4 bg-muted rounded-md text-xs overflow-auto">
                {JSON.stringify(rule.compiledRule, null, 2)}
              </pre>
              <Button onClick={handleRunRule} disabled={isLoading || isProposing}>
                  <Play className="mr-2" /> {isLoading && !isProposing ? 'Running...' : `Run Rule & Find Files`}
              </Button>
            </CardContent>
          </Card>
        )}
        
        {runResult && (
            <Card>
                <CardHeader>
                    <CardTitle>Rule Run Results</CardTitle>
                    <CardDescription>A new simulated action batch has been created. You can review and execute it from the AI / Dev Test page.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p><strong>Batch ID:</strong> <code className="text-xs bg-muted p-1 rounded-sm">{runResult.batchId}</code></p>
                    <p><strong>Files Matched:</strong> {runResult.count}</p>
                </CardContent>
            </Card>
        )}
      </div>
    </MainLayout>
  );
}
