'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Download, FileText, Database, BarChart3, Loader2, CheckCircle } from 'lucide-react';
import { VaultExportService, ExportFormat, ExportOptions } from '@/lib/export-service';
import { useAuth } from '@/contexts/auth-context';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface ExportDialogProps {
  trigger: React.ReactNode;
  exportType: 'inventory' | 'duplicates' | 'analysis';
  data: any;
  title?: string;
  description?: string;
}

export function ExportDialog({ 
  trigger, 
  exportType, 
  data, 
  title, 
  description 
}: ExportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { handleAsyncError } = useErrorHandler({ component: 'ExportDialog', userId: user?.uid });
  
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'json',
    includeMetadata: true,
    includePaths: true,
    includeAnalysis: false
  });

  const exportService = user ? new VaultExportService(user.uid) : null;

  const formatOptions: Array<{ value: ExportFormat; label: string; description: string; icon: React.ReactNode }> = [
    { 
      value: 'json', 
      label: 'JSON', 
      description: 'Machine-readable format for developers',
      icon: <Database className="h-4 w-4" />
    },
    { 
      value: 'csv', 
      label: 'CSV', 
      description: 'Spreadsheet-compatible format',
      icon: <FileText className="h-4 w-4" />
    },
    { 
      value: 'xlsx', 
      label: 'Excel', 
      description: 'Microsoft Excel spreadsheet',
      icon: <BarChart3 className="h-4 w-4" />
    },
    { 
      value: 'pdf', 
      label: 'PDF', 
      description: 'Printable document format',
      icon: <FileText className="h-4 w-4" />
    }
  ];

  const getExportTypeInfo = () => {
    switch (exportType) {
      case 'inventory':
        return {
          title: title || 'Export File Inventory',
          description: description || 'Export your complete file inventory with metadata and analysis results',
          icon: <Database className="h-5 w-5" />,
          dataCount: Array.isArray(data) ? data.length : 0
        };
      case 'duplicates':
        return {
          title: title || 'Export Duplicate Report',
          description: description || 'Export duplicate file detection results and recommendations',
          icon: <BarChart3 className="h-5 w-5" />,
          dataCount: Array.isArray(data) ? data.length : 0
        };
      case 'analysis':
        return {
          title: title || 'Export Analysis Report',
          description: description || 'Export AI analysis results and insights',
          icon: <BarChart3 className="h-5 w-5" />,
          dataCount: typeof data === 'object' ? Object.keys(data).length : 0
        };
      default:
        return {
          title: 'Export Data',
          description: 'Export your data',
          icon: <Download className="h-5 w-5" />,
          dataCount: 0
        };
    }
  };

  const handleExport = async () => {
    if (!exportService || !user) {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: 'User authentication required'
      });
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      logger.info('Starting export process', {
        userId: user.uid,
        exportType,
        format: exportOptions.format,
        dataCount: getExportTypeInfo().dataCount
      });

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setExportProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      let result;
      
      switch (exportType) {
        case 'inventory':
          result = await exportService.exportFileInventory(data, exportOptions);
          break;
        case 'duplicates':
          result = await exportService.exportDuplicateReport(data, exportOptions);
          break;
        case 'analysis':
          result = await exportService.exportAnalysisReport(data, exportOptions);
          break;
        default:
          throw new Error(`Unsupported export type: ${exportType}`);
      }

      clearInterval(progressInterval);
      setExportProgress(100);

      // Download the file
      const url = URL.createObjectURL(result.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.info('Export completed successfully', {
        userId: user.uid,
        exportType,
        filename: result.filename,
        size: result.size
      });

      toast({
        title: 'Export successful',
        description: `${result.filename} has been downloaded (${(result.size / 1024).toFixed(1)} KB)`
      });

      setTimeout(() => {
        setOpen(false);
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);

    } catch (error) {
      handleAsyncError(async () => {
        throw error;
      }, { exportType, format: exportOptions.format });
      
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const typeInfo = getExportTypeInfo();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {typeInfo.icon}
            <span>{typeInfo.title}</span>
          </DialogTitle>
          <DialogDescription>
            {typeInfo.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Data Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Export Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {exportType === 'inventory' ? 'Files to export' : 
                   exportType === 'duplicates' ? 'Duplicate groups' : 
                   'Analysis items'}
                </span>
                <Badge variant="secondary">
                  {typeInfo.dataCount.toLocaleString()}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Format Selection */}
          <div className="space-y-3">
            <Label htmlFor="format">Export Format</Label>
            <Select 
              value={exportOptions.format} 
              onValueChange={(format: ExportFormat) => 
                setExportOptions(prev => ({ ...prev, format }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formatOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center space-x-2">
                      {option.icon}
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {option.description}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Export Options */}
          <div className="space-y-3">
            <Label>Export Options</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeMetadata"
                  checked={exportOptions.includeMetadata}
                  onCheckedChange={(checked) =>
                    setExportOptions(prev => ({ ...prev, includeMetadata: !!checked }))
                  }
                />
                <Label htmlFor="includeMetadata" className="text-sm">
                  Include file metadata (size, dates)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includePaths"
                  checked={exportOptions.includePaths}
                  onCheckedChange={(checked) =>
                    setExportOptions(prev => ({ ...prev, includePaths: !!checked }))
                  }
                />
                <Label htmlFor="includePaths" className="text-sm">
                  Include file paths and folder structure
                </Label>
              </div>

              {exportType === 'inventory' && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeAnalysis"
                    checked={exportOptions.includeAnalysis}
                    onCheckedChange={(checked) =>
                      setExportOptions(prev => ({ ...prev, includeAnalysis: !!checked }))
                    }
                  />
                  <Label htmlFor="includeAnalysis" className="text-sm">
                    Include AI analysis results
                  </Label>
                </div>
              )}
            </div>
          </div>

          {/* Export Progress */}
          {isExporting && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Exporting data...</span>
                <span>{exportProgress}%</span>
              </div>
              <Progress value={exportProgress} className="w-full" />
              {exportProgress === 100 && (
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span>Export complete! Download starting...</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || !user}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}