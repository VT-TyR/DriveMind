'use client';

/**
 * AI-powered file analysis and organization page
 * Implements ALPHA-CODENAME v1.4 AI integration standards
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { RouteGuard } from '@/components/auth/route-guard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-provider';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import apiClient, { FileInfo, OrganizationRule } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { 
  Sparkles, 
  Brain,
  FileText,
  FolderTree,
  Wand2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Lightbulb,
  Target,
  ArrowRight,
  Filter,
  Search,
  Star,
  TrendingUp
} from 'lucide-react';

interface FileClassification {
  fileId: string;
  fileName: string;
  category: string;
  confidence: number;
  tags: string[];
  reasoning: string;
}

interface OrganizationSuggestion {
  id: string;
  type: 'folder_creation' | 'file_move' | 'folder_rename' | 'structure_optimization';
  title: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  affectedFiles: number;
  estimatedTimeMinutes: number;
  prerequisites: string[];
}

interface AiHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    gemini: {
      status: string;
      latency?: number;
      quotaRemaining?: number;
    };
  };
}

export default function AiPage() {
  const { user, getIdToken } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  
  // State management
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<FileClassification[]>([]);
  const [suggestions, setSuggestions] = useState<OrganizationSuggestion[]>([]);
  const [proposedRule, setProposedRule] = useState<OrganizationRule | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  
  // Loading states
  const [isClassifying, setIsClassifying] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isProposingRule, setIsProposingRule] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  
  // Form states
  const [ruleDescription, setRuleDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [includeContent, setIncludeContent] = useState(false);
  const [analysisType, setAnalysisType] = useState<'structure' | 'content' | 'both'>('both');
  const [focusArea, setFocusArea] = useState<'downloads' | 'documents' | 'media' | 'all'>('all');

  // Sample file data (in production, this would come from the inventory)
  const [availableFiles] = useState<FileInfo[]>([
    {
      id: '1',
      name: 'Invoice_2024_Q1.pdf',
      type: 'PDF',
      size: 245760,
      lastModified: '2024-01-15T10:30:00Z',
      path: ['Documents', 'Invoices'],
      isDuplicate: false,
      vaultScore: 85,
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/file/d/1/view',
    },
    {
      id: '2', 
      name: 'Project_Proposal.docx',
      type: 'Document',
      size: 512000,
      lastModified: '2024-02-20T14:15:00Z',
      path: ['Documents', 'Projects'],
      isDuplicate: false,
      vaultScore: 92,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      webViewLink: 'https://drive.google.com/file/d/2/view',
    },
  ]);

  // Check AI service health
  const checkAiHealth = useCallback(async () => {
    try {
      setIsCheckingHealth(true);
      const health = await apiClient.checkAiHealth();
      setAiHealth(health);
    } catch (error) {
      console.error('Failed to check AI health:', error);
      toast({
        title: 'AI Service Error',
        description: 'Unable to check AI service status',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingHealth(false);
    }
  }, [toast]);

  // Classify selected files
  const classifyFiles = useCallback(async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: 'No Files Selected',
        description: 'Please select files to classify',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsClassifying(true);
      
      const result = await apiClient.classifyFiles(selectedFiles, {
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        includeContent,
      });
      
      setClassifications(result.classifications);
      
      toast({
        title: 'Classification Complete',
        description: `Classified ${result.classifications.length} files`,
      });
    } catch (error) {
      console.error('Classification failed:', error);
      toast({
        title: 'Classification Error',
        description: 'Failed to classify files. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsClassifying(false);
    }
  }, [selectedFiles, selectedCategories, includeContent, toast]);

  // Generate organization suggestions
  const generateSuggestions = useCallback(async () => {
    try {
      setIsGeneratingSuggestions(true);
      
      const result = await apiClient.organizeFiles({
        analysisType,
        maxSuggestions: 10,
        focusArea,
      });
      
      setSuggestions(result.suggestions);
      
      toast({
        title: 'Suggestions Generated',
        description: `Found ${result.suggestions.length} organization opportunities`,
      });
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
      toast({
        title: 'Suggestion Error',
        description: 'Failed to generate suggestions. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSuggestions(false);
    }
  }, [analysisType, focusArea, toast]);

  // Propose organization rule
  const proposeRule = useCallback(async () => {
    if (!ruleDescription.trim()) {
      toast({
        title: 'Description Required',
        description: 'Please describe the organization rule you want',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsProposingRule(true);
      
      const rule = await apiClient.proposeRule(ruleDescription, {
        sampleFiles: selectedFiles.length > 0 ? selectedFiles : undefined,
      });
      
      setProposedRule(rule);
      
      toast({
        title: 'Rule Proposed',
        description: 'AI has generated an organization rule for you',
      });
    } catch (error) {
      console.error('Failed to propose rule:', error);
      toast({
        title: 'Rule Error',
        description: 'Failed to generate rule. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProposingRule(false);
    }
  }, [ruleDescription, selectedFiles, toast]);

  // Initialize AI health check
  useEffect(() => {
    if (isAiEnabled) {
      checkAiHealth();
    }
  }, [isAiEnabled, checkAiHealth]);

  // AI not enabled fallback
  if (!isAiEnabled) {
    return (
      <MainLayout>
        <RouteGuard requireAuth>
          <div className="flex-1 flex items-center justify-center p-8">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto h-12 w-12 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                </div>
                <CardTitle>AI Features Disabled</CardTitle>
                <CardDescription>
                  Enable AI mode to access intelligent file analysis and organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription>
                    Switch to AI mode using the toggle in the sidebar to unlock
                    advanced file classification, smart suggestions, and automated rules.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </RouteGuard>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <RouteGuard requireAuth requireDriveAuth>
        <div className="flex-1 space-y-6 p-4 pt-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Brain className="h-8 w-8 text-purple-600" />
                AI Analysis
              </h2>
              <p className="text-muted-foreground">
                Intelligent file classification and organization recommendations
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                AI Active
              </Badge>
              
              <Button
                onClick={checkAiHealth}
                disabled={isCheckingHealth}
                variant="outline"
                size="sm"
              >
                {isCheckingHealth ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Health Check
              </Button>
            </div>
          </div>

          {/* AI Health Status */}
          {aiHealth && (
            <Alert className={aiHealth.status === 'healthy' ? '' : 'border-destructive'}>
              <div className="flex items-center gap-2">
                {aiHealth.status === 'healthy' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium">
                  AI Services: {aiHealth.status === 'healthy' ? 'Operational' : 'Degraded'}
                </span>
              </div>
              <AlertDescription className="mt-2">
                Gemini API: {aiHealth.services.gemini.status}
                {aiHealth.services.gemini.latency && (
                  <span className="ml-2">• {aiHealth.services.gemini.latency}ms response time</span>
                )}
                {aiHealth.services.gemini.quotaRemaining && (
                  <span className="ml-2">• {aiHealth.services.gemini.quotaRemaining} requests remaining</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Main Tabs */}
          <Tabs defaultValue="classify" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="classify" className="gap-2">
                <FileText className="h-4 w-4" />
                Classify Files
              </TabsTrigger>
              <TabsTrigger value="organize" className="gap-2">
                <FolderTree className="h-4 w-4" />
                Organization
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-2">
                <Wand2 className="h-4 w-4" />
                Smart Rules
              </TabsTrigger>
            </TabsList>

            {/* File Classification Tab */}
            <TabsContent value="classify" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* File Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Select Files
                    </CardTitle>
                    <CardDescription>
                      Choose files to analyze and classify
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {availableFiles.map((file) => (
                        <div key={file.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={file.id}
                            checked={selectedFiles.includes(file.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedFiles(prev => [...prev, file.id]);
                              } else {
                                setSelectedFiles(prev => prev.filter(id => id !== file.id));
                              }
                            }}
                          />
                          <label
                            htmlFor={file.id}
                            className="flex-1 text-sm cursor-pointer flex items-center justify-between"
                          >
                            <span>{file.name}</span>
                            <Badge variant="outline">{file.type}</Badge>
                          </label>
                        </div>
                      ))}
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="includeContent"
                          checked={includeContent}
                          onCheckedChange={(checked) => setIncludeContent(!!checked)}
                        />
                        <label htmlFor="includeContent" className="text-sm cursor-pointer">
                          Analyze file content (slower, more accurate)
                        </label>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Custom Categories (optional)</label>
                        <Input
                          placeholder="e.g., Invoices, Contracts, Photos"
                          value={selectedCategories.join(', ')}
                          onChange={(e) => {
                            const categories = e.target.value
                              .split(',')
                              .map(cat => cat.trim())
                              .filter(Boolean);
                            setSelectedCategories(categories);
                          }}
                        />
                      </div>
                    </div>
                    
                    <Button
                      onClick={classifyFiles}
                      disabled={isClassifying || selectedFiles.length === 0}
                      className="w-full"
                    >
                      {isClassifying ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Brain className="mr-2 h-4 w-4" />
                          Classify Files
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Classification Results */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5" />
                      Classification Results
                    </CardTitle>
                    <CardDescription>
                      AI-generated file categories and insights
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {classifications.length > 0 ? (
                      <div className="space-y-4">
                        {classifications.map((classification) => (
                          <div key={classification.fileId} className="p-4 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{classification.fileName}</h4>
                              <div className="flex items-center gap-2">
                                <Badge>{classification.category}</Badge>
                                <span className="text-sm text-muted-foreground">
                                  {Math.round(classification.confidence * 100)}%
                                </span>
                              </div>
                            </div>
                            
                            {classification.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {classification.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            
                            <p className="text-sm text-muted-foreground">
                              {classification.reasoning}
                            </p>
                            
                            <Progress value={classification.confidence * 100} className="h-2" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Select files and run classification to see AI analysis results
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Organization Suggestions Tab */}
            <TabsContent value="organize" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle>Analysis Settings</CardTitle>
                    <CardDescription>
                      Configure how AI analyzes your Drive structure
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Analysis Type</label>
                      <Select value={analysisType} onValueChange={(value: any) => setAnalysisType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="structure">Structure Only</SelectItem>
                          <SelectItem value="content">Content Analysis</SelectItem>
                          <SelectItem value="both">Both (Recommended)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Focus Area</label>
                      <Select value={focusArea} onValueChange={(value: any) => setFocusArea(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Files</SelectItem>
                          <SelectItem value="downloads">Downloads</SelectItem>
                          <SelectItem value="documents">Documents</SelectItem>
                          <SelectItem value="media">Media Files</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button
                      onClick={generateSuggestions}
                      disabled={isGeneratingSuggestions}
                      className="w-full"
                    >
                      {isGeneratingSuggestions ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="mr-2 h-4 w-4" />
                          Generate Suggestions
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Suggestions Results */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      Organization Suggestions
                    </CardTitle>
                    <CardDescription>
                      AI-powered recommendations to improve your Drive organization
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {suggestions.length > 0 ? (
                      <div className="space-y-4">
                        {suggestions.map((suggestion) => (
                          <div key={suggestion.id} className="p-4 border rounded-lg space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <h4 className="font-medium">{suggestion.title}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {suggestion.description}
                                </p>
                              </div>
                              <Badge
                                variant={suggestion.impact === 'high' ? 'default' : 
                                        suggestion.impact === 'medium' ? 'secondary' : 'outline'}
                              >
                                {suggestion.impact} impact
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span>{suggestion.affectedFiles} files affected</span>
                              <span>{suggestion.estimatedTimeMinutes} min to implement</span>
                              <span>{Math.round(suggestion.confidence * 100)}% confidence</span>
                            </div>
                            
                            {suggestion.prerequisites.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                <strong>Prerequisites:</strong> {suggestion.prerequisites.join(', ')}
                              </div>
                            )}
                            
                            <div className="flex justify-end">
                              <Button size="sm" variant="outline">
                                Apply Suggestion
                                <ArrowRight className="ml-2 h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Lightbulb className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Generate suggestions to see AI-powered organization recommendations
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Smart Rules Tab */}
            <TabsContent value="rules" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Rule Creation */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wand2 className="h-5 w-5" />
                      Create Smart Rule
                    </CardTitle>
                    <CardDescription>
                      Describe what you want to organize and AI will create the rule
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Rule Description</label>
                      <Textarea
                        placeholder="e.g., Move all PDF invoices to the Finance/Invoices folder"
                        value={ruleDescription}
                        onChange={(e) => setRuleDescription(e.target.value)}
                        rows={3}
                      />
                    </div>
                    
                    {selectedFiles.length > 0 && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-2">Sample Files Selected:</p>
                        <div className="space-y-1">
                          {selectedFiles.slice(0, 3).map(fileId => {
                            const file = availableFiles.find(f => f.id === fileId);
                            return file ? (
                              <p key={file.id} className="text-xs text-muted-foreground">
                                {file.name}
                              </p>
                            ) : null;
                          })}
                          {selectedFiles.length > 3 && (
                            <p className="text-xs text-muted-foreground">
                              +{selectedFiles.length - 3} more files
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <Button
                      onClick={proposeRule}
                      disabled={isProposingRule || !ruleDescription.trim()}
                      className="w-full"
                    >
                      {isProposingRule ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Rule...
                        </>
                      ) : (
                        <>
                          <Wand2 className="mr-2 h-4 w-4" />
                          Generate Rule
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Proposed Rule */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Proposed Rule
                    </CardTitle>
                    <CardDescription>
                      Review the AI-generated organization rule
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {proposedRule ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">{proposedRule.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {proposedRule.description}
                          </p>
                        </div>
                        
                        <div className="p-3 bg-muted rounded-lg space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Action:</span>
                            <Badge variant="outline">{proposedRule.action}</Badge>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Pattern:</span>
                            <code className="text-xs bg-background px-2 py-1 rounded">
                              {proposedRule.pattern}
                            </code>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Target:</span>
                            <span className="text-xs">{proposedRule.target}</span>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <h5 className="text-sm font-medium">Conditions:</h5>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {proposedRule.conditions.fileTypes && (
                              <div>File types: {proposedRule.conditions.fileTypes.join(', ')}</div>
                            )}
                            {proposedRule.conditions.namePattern && (
                              <div>Name pattern: {proposedRule.conditions.namePattern}</div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1">
                            Save Rule
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1">
                            Test Run
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Wand2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Describe your organization needs and AI will create a custom rule
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </RouteGuard>
    </MainLayout>
  );
}
