/**
 * Vault export service for exporting various data formats
 */

import { logger, withTiming } from './logger';
import { AppError } from './error-handler';

export type ExportFormat = 'json' | 'csv' | 'pdf' | 'xlsx';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includePaths?: boolean;
  includeAnalysis?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface FileExportData {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  createdTime?: string;
  path?: string;
  parents?: string[];
  duplicateGroup?: string;
  analysisResults?: Record<string, any>;
}

export interface ExportResult {
  filename: string;
  data: Blob;
  mimeType: string;
  size: number;
}

export class VaultExportService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Export file inventory in various formats
   */
  async exportFileInventory(
    files: FileExportData[],
    options: ExportOptions
  ): Promise<ExportResult> {
    return withTiming('exportFileInventory', async () => {
      logger.info('Starting file inventory export', {
        userId: this.userId,
        fileCount: files.length,
        format: options.format,
        operation: 'export'
      });

      const filteredFiles = this.filterFilesByDateRange(files, options.dateRange);

      switch (options.format) {
        case 'json':
          return this.exportToJSON(filteredFiles, options);
        case 'csv':
          return this.exportToCSV(filteredFiles, options);
        case 'xlsx':
          return this.exportToExcel(filteredFiles, options);
        case 'pdf':
          return this.exportToPDF(filteredFiles, options);
        default:
          throw new AppError(`Unsupported export format: ${options.format}`, 'INVALID_FORMAT', 400);
      }
    }, { userId: this.userId, operation: 'exportFileInventory' });
  }

  /**
   * Export duplicate detection results
   */
  async exportDuplicateReport(
    duplicateGroups: Array<{
      id: string;
      files: FileExportData[];
      similarity: number;
      type: string;
    }>,
    options: ExportOptions
  ): Promise<ExportResult> {
    return withTiming('exportDuplicateReport', async () => {
      logger.info('Starting duplicate report export', {
        userId: this.userId,
        groupCount: duplicateGroups.length,
        format: options.format
      });

      const reportData = {
        generatedAt: new Date().toISOString(),
        userId: this.userId,
        summary: {
          totalGroups: duplicateGroups.length,
          totalDuplicates: duplicateGroups.reduce((sum, group) => sum + group.files.length, 0),
          potentialSpaceSaved: this.calculateSpaceSavings(duplicateGroups)
        },
        groups: duplicateGroups
      };

      switch (options.format) {
        case 'json':
          return this.createExportResult(
            JSON.stringify(reportData, null, 2),
            'application/json',
            `duplicate-report-${Date.now()}.json`
          );
        case 'csv':
          return this.exportDuplicatesToCSV(duplicateGroups);
        case 'pdf':
          return this.exportDuplicatesToPDF(duplicateGroups);
        default:
          throw new AppError(`Unsupported format for duplicate report: ${options.format}`, 'INVALID_FORMAT', 400);
      }
    }, { userId: this.userId, operation: 'exportDuplicateReport' });
  }

  /**
   * Export AI analysis results
   */
  async exportAnalysisReport(
    analysisResults: Record<string, any>,
    options: ExportOptions
  ): Promise<ExportResult> {
    return withTiming('exportAnalysisReport', async () => {
      const reportData = {
        generatedAt: new Date().toISOString(),
        userId: this.userId,
        analysis: analysisResults
      };

      switch (options.format) {
        case 'json':
          return this.createExportResult(
            JSON.stringify(reportData, null, 2),
            'application/json',
            `analysis-report-${Date.now()}.json`
          );
        case 'pdf':
          return this.exportAnalysisToPDF(analysisResults);
        default:
          throw new AppError(`Unsupported format for analysis report: ${options.format}`, 'INVALID_FORMAT', 400);
      }
    }, { userId: this.userId, operation: 'exportAnalysisReport' });
  }

  private filterFilesByDateRange(files: FileExportData[], dateRange?: { start: Date; end: Date }) {
    if (!dateRange) return files;

    return files.filter(file => {
      if (!file.modifiedTime) return true;
      const modifiedDate = new Date(file.modifiedTime);
      return modifiedDate >= dateRange.start && modifiedDate <= dateRange.end;
    });
  }

  private async exportToJSON(files: FileExportData[], options: ExportOptions): Promise<ExportResult> {
    const exportData = {
      generatedAt: new Date().toISOString(),
      userId: this.userId,
      totalFiles: files.length,
      options,
      files: files.map(file => this.sanitizeFileData(file, options))
    };

    return this.createExportResult(
      JSON.stringify(exportData, null, 2),
      'application/json',
      `file-inventory-${Date.now()}.json`
    );
  }

  private async exportToCSV(files: FileExportData[], options: ExportOptions): Promise<ExportResult> {
    const headers = ['Name', 'Type', 'Size', 'Modified'];
    if (options.includePaths) headers.push('Path');
    if (options.includeAnalysis) headers.push('Analysis');

    const csvRows = [headers.join(',')];

    files.forEach(file => {
      const row = [
        this.escapeCSV(file.name),
        this.escapeCSV(file.mimeType || ''),
        file.size?.toString() || '0',
        file.modifiedTime || ''
      ];

      if (options.includePaths) {
        row.push(this.escapeCSV(file.path || ''));
      }

      if (options.includeAnalysis) {
        row.push(this.escapeCSV(JSON.stringify(file.analysisResults || {})));
      }

      csvRows.push(row.join(','));
    });

    return this.createExportResult(
      csvRows.join('\n'),
      'text/csv',
      `file-inventory-${Date.now()}.csv`
    );
  }

  private async exportToExcel(files: FileExportData[], options: ExportOptions): Promise<ExportResult> {
    // For now, we'll use CSV format as a placeholder
    // In a real implementation, you'd use a library like xlsx
    const csvResult = await this.exportToCSV(files, options);
    
    return {
      ...csvResult,
      filename: csvResult.filename.replace('.csv', '.xlsx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }

  private async exportToPDF(files: FileExportData[], options: ExportOptions): Promise<ExportResult> {
    // For now, we'll create a simple text-based PDF content
    // In a real implementation, you'd use a PDF library like jsPDF or pdfkit
    const content = this.generatePDFContent(files, options);
    
    return this.createExportResult(
      content,
      'application/pdf',
      `file-inventory-${Date.now()}.pdf`
    );
  }

  private exportDuplicatesToCSV(duplicateGroups: Array<{ id: string; files: FileExportData[]; similarity: number; type: string }>): ExportResult {
    const headers = ['Group ID', 'File Name', 'File Path', 'Size', 'Similarity', 'Type'];
    const csvRows = [headers.join(',')];

    duplicateGroups.forEach(group => {
      group.files.forEach(file => {
        const row = [
          group.id,
          this.escapeCSV(file.name),
          this.escapeCSV(file.path || ''),
          file.size?.toString() || '0',
          group.similarity.toString(),
          group.type
        ];
        csvRows.push(row.join(','));
      });
    });

    return this.createExportResult(
      csvRows.join('\n'),
      'text/csv',
      `duplicate-report-${Date.now()}.csv`
    );
  }

  private exportDuplicatesToPDF(duplicateGroups: Array<{ id: string; files: FileExportData[]; similarity: number; type: string }>): ExportResult {
    const content = `Duplicate Files Report\nGenerated: ${new Date().toISOString()}\n\n${
      duplicateGroups.map(group => 
        `Group ${group.id} (${group.similarity}% similarity):\n${
          group.files.map(file => `  - ${file.name} (${file.size} bytes)`).join('\n')
        }\n`
      ).join('\n')
    }`;

    return this.createExportResult(
      content,
      'application/pdf',
      `duplicate-report-${Date.now()}.pdf`
    );
  }

  private exportAnalysisToPDF(analysisResults: Record<string, any>): ExportResult {
    const content = `AI Analysis Report\nGenerated: ${new Date().toISOString()}\n\n${
      JSON.stringify(analysisResults, null, 2)
    }`;

    return this.createExportResult(
      content,
      'application/pdf',
      `analysis-report-${Date.now()}.pdf`
    );
  }

  private generatePDFContent(files: FileExportData[], options: ExportOptions): string {
    return `File Inventory Report\nGenerated: ${new Date().toISOString()}\nTotal Files: ${files.length}\n\n${
      files.map(file => 
        `${file.name}\n  Type: ${file.mimeType}\n  Size: ${file.size} bytes\n  Modified: ${file.modifiedTime}\n`
      ).join('\n')
    }`;
  }

  private calculateSpaceSavings(duplicateGroups: Array<{ files: FileExportData[] }>): number {
    return duplicateGroups.reduce((total, group) => {
      if (group.files.length <= 1) return total;
      
      // Sort files by size (descending) to keep the largest
      const sortedFiles = [...group.files].sort((a, b) => (b.size || 0) - (a.size || 0));
      
      // Calculate space saved by removing all files except the largest (first after sorting)
      const duplicateSpace = sortedFiles
        .slice(1) // Keep the first (largest) file, remove the rest
        .reduce((sum, f) => sum + (f.size || 0), 0);
      
      return total + duplicateSpace;
    }, 0);
  }

  private sanitizeFileData(file: FileExportData, options: ExportOptions): Partial<FileExportData> {
    const sanitized: Partial<FileExportData> = {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType
    };

    if (options.includeMetadata) {
      sanitized.size = file.size;
      sanitized.modifiedTime = file.modifiedTime;
      sanitized.createdTime = file.createdTime;
    }

    if (options.includePaths) {
      sanitized.path = file.path;
      sanitized.parents = file.parents;
    }

    if (options.includeAnalysis) {
      sanitized.analysisResults = file.analysisResults;
    }

    return sanitized;
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private createExportResult(content: string, mimeType: string, filename: string): ExportResult {
    const blob = new Blob([content], { type: mimeType });
    return {
      filename,
      data: blob,
      mimeType,
      size: blob.size
    };
  }
}