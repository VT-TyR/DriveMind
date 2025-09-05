
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { logger } from '@/lib/logger';
import { ListChecks, Play, Sparkles, Users, AlertTriangle } from 'lucide-react';
import { proposeRules } from '@/ai/flows/ai-propose-rules';
import { rulesRun } from '@/ai/flows/rules-run';
import type { ProposeRulesOutput } from '@/lib/ai-types';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { Badge } from '@/components/ui/badge';




export default function RulesPage() {
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const { handleAsyncError } = useErrorHandler({ component: 'RulesPage', userId: user?.uid });
  const [isLoading, setIsLoading] = React.useState(false);
  const [isProposing, setIsProposing] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [rule, setRule] = React.useState<ProposeRulesOutput | null>(null);
  const [runResult, setRunResult] = React.useState<any>(null);

  React.useEffect(() => {
    if (user) {
      logger.info('Rules page accessed', {
        userId: user.uid,
        page: 'rules'
      });
    }
  }, [user]);

  const getUserAuth = () => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    return { uid: user.uid, email: user.email || undefined };
  };

  const handleProposeRule = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to propose rules.',
      });
      return;
    }

    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to propose rules.',
      });
      return;
    }

    if (!prompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please enter a rule description.',
      });
      return;
    }

    setIsLoading(true);
    setIsProposing(true);
    setRule(null);
    setRunResult(null);
    
    try {
      const authData = getUserAuth();
      const result = await proposeRules({ prompt, auth: authData });
      setRule(result);
      
      logger.info('Rule proposed', {
        userId: user.uid,
        ruleId: result.ruleId,
        promptLength: prompt.length
      });
      
      toast({
        title: 'Rule Proposed',
        description: 'AI has drafted a rule based on your prompt. Review the JSON below.',
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'proposeRule', prompt: prompt.substring(0, 100) });
      toast({
        variant: 'destructive',
        title: 'Failed to Propose Rule',
        description: error.message || 'Could not generate rule with AI.',
      });
    } finally {
      setIsLoading(false);
      setIsProposing(false);
    }
  };
  
  const handleRunRule = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to run rules.',
      });
      return;
    }

    if (!rule) {
      toast({
        variant: 'destructive',
        title: 'No Rule Available',
        description: 'Please propose a rule first.',
      });
      return;
    }

    setIsLoading(true);
    setRunResult(null);
    
    try {
      const authData = getUserAuth();
      // In a production app, the 'rulesRun' flow sources files directly
      // from the user's authenticated Google Drive.
      const result = await rulesRun({ ruleId: rule.ruleId, auth: authData });
      setRunResult(result);
      
      logger.info('Rule executed', {
        userId: user.uid,
        ruleId: rule.ruleId,
        matchedFiles: result.count
      });
      
      toast({
        title: 'Rule Run Complete',
        description: `A batch with ${result.count} matching files has been created.`
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'runRule', ruleId: rule?.ruleId });
      toast({
        variant: 'destructive',
        title: 'Failed to Run Rule',
        description: error.message || 'Could not execute rule against your files.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Rules Engine
            </h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
        </div>
        
        {!user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Authentication Required</CardTitle>
              <CardDescription>
                Sign in with your Google account to create and manage automation rules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please sign in to access rule creation features.
              </p>
            </CardContent>
          </Card>
        )}
        
        {!isAiEnabled && user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> AI Mode Disabled</CardTitle>
              <CardDescription>
                Enable AI-Assisted mode to create rules using natural language.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Switch to AI-Assisted mode in the sidebar to enable rule creation.
              </p>
            </CardContent>
          </Card>
        )}

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
            <Button onClick={handleProposeRule} disabled={isLoading || !prompt.trim() || !isAiEnabled || !user}>
                <Sparkles className="mr-2" /> {isProposing ? 'Proposing...' : 'Propose Rule with AI'}
            </Button>
            {!user && (
                <p className="text-sm text-destructive mt-2">Sign in to propose rules.</p>
            )}
            {!isAiEnabled && user && (
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
              <Button onClick={handleRunRule} disabled={isLoading || isProposing || !user}>
                  <Play className="mr-2" /> {isLoading && !isProposing ? 'Running...' : `Run Rule & Find Files`}
              </Button>
              {!user && (
                <p className="text-xs text-destructive mt-2">Sign in to run rules against your Google Drive files.</p>
              )}
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
