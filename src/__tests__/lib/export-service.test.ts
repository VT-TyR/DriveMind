/**
 * Tests for the vault export service
 */

import { VaultExportService, ExportFormat, FileExportData } from '@/lib/export-service';

// Mock the logger
jest.mock('@/lib/logger');

describe('VaultExportService', () => {
  let exportService: VaultExportService;
  const mockUserId = 'user123';

  beforeEach(() => {
    exportService = new VaultExportService(mockUserId);
  });

  describe('Constructor', () => {
    it('should create service with user ID', () => {
      expect(exportService).toBeInstanceOf(VaultExportService);
    });
  });

  describe('File Inventory Export', () => {
    const mockFiles: FileExportData[] = [
      {
        id: 'file1',
        name: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        modifiedTime: '2024-01-15T10:00:00Z',
        path: '/documents/document.pdf',
        analysisResults: { category: 'document', confidence: 0.95 }
      },
      {
        id: 'file2',
        name: 'image.jpg',
        mimeType: 'image/jpeg',
        size: 2048,
        modifiedTime: '2024-01-16T11:00:00Z',
        path: '/images/image.jpg',
        analysisResults: { category: 'image', confidence: 0.98 }
      }
    ];

    describe('JSON Export', () => {
      it('should export file inventory as JSON', async () => {
        const result = await exportService.exportFileInventory(mockFiles, {
          format: 'json',
          includeMetadata: true,
          includePaths: true,
          includeAnalysis: true
        });

        expect(result.filename).toMatch(/file-inventory-\d+\.json/);
        expect(result.mimeType).toBe('application/json');
        expect(result.data).toBeInstanceOf(Blob);

        // Verify the content
        const text = await result.data.text();
        const data = JSON.parse(text);
        
        expect(data.userId).toBe(mockUserId);
        expect(data.totalFiles).toBe(2);
        expect(data.files).toHaveLength(2);
        expect(data.files[0].name).toBe('document.pdf');
      });

      it('should respect include options for JSON export', async () => {
        const result = await exportService.exportFileInventory(mockFiles, {
          format: 'json',
          includeMetadata: false,
          includePaths: false,
          includeAnalysis: false
        });

        const text = await result.data.text();
        const data = JSON.parse(text);
        
        expect(data.files[0]).toHaveProperty('id');
        expect(data.files[0]).toHaveProperty('name');
        expect(data.files[0]).toHaveProperty('mimeType');
        expect(data.files[0]).not.toHaveProperty('size');
        expect(data.files[0]).not.toHaveProperty('path');
        expect(data.files[0]).not.toHaveProperty('analysisResults');
      });
    });

    describe('CSV Export', () => {
      it('should export file inventory as CSV', async () => {
        const result = await exportService.exportFileInventory(mockFiles, {
          format: 'csv',
          includeMetadata: true,
          includePaths: true,
          includeAnalysis: false
        });

        expect(result.filename).toMatch(/file-inventory-\d+\.csv/);
        expect(result.mimeType).toBe('text/csv');

        const text = await result.data.text();
        const lines = text.split('\n');
        
        // Check headers
        expect(lines[0]).toBe('Name,Type,Size,Modified,Path');
        
        // Check data rows
        expect(lines[1]).toContain('document.pdf');
        expect(lines[2]).toContain('image.jpg');
      });

      it('should handle CSV escaping', async () => {
        const filesWithCommas: FileExportData[] = [{
          id: 'file1',
          name: 'document, with commas.pdf',
          mimeType: 'application/pdf',
          path: '/path/with, commas/'
        }];

        const result = await exportService.exportFileInventory(filesWithCommas, {
          format: 'csv',
          includePaths: true
        });

        const text = await result.data.text();
        expect(text).toContain('"document, with commas.pdf"');
        expect(text).toContain('"/path/with, commas/"');
      });
    });

    describe('Date Range Filtering', () => {
      it('should filter files by date range', async () => {
        const result = await exportService.exportFileInventory(mockFiles, {
          format: 'json',
          dateRange: {
            start: new Date('2024-01-16T00:00:00Z'),
            end: new Date('2024-01-17T00:00:00Z')
          }
        });

        const text = await result.data.text();
        const data = JSON.parse(text);
        
        expect(data.totalFiles).toBe(1);
        expect(data.files[0].name).toBe('image.jpg');
      });

      it('should include all files when no date range is specified', async () => {
        const result = await exportService.exportFileInventory(mockFiles, {
          format: 'json'
        });

        const text = await result.data.text();
        const data = JSON.parse(text);
        
        expect(data.totalFiles).toBe(2);
      });
    });
  });

  describe('Duplicate Report Export', () => {
    const mockDuplicateGroups = [
      {
        id: 'group1',
        files: [
          { id: 'file1', name: 'doc.pdf', path: '/docs/doc.pdf', size: 1024 },
          { id: 'file2', name: 'doc-copy.pdf', path: '/backup/doc-copy.pdf', size: 1024 }
        ],
        similarity: 100,
        type: 'exact'
      },
      {
        id: 'group2',
        files: [
          { id: 'file3', name: 'img1.jpg', path: '/images/img1.jpg', size: 2048 },
          { id: 'file4', name: 'img2.jpg', path: '/images/img2.jpg', size: 2100 }
        ],
        similarity: 95,
        type: 'similar'
      }
    ];

    it('should export duplicate report as JSON', async () => {
      const result = await exportService.exportDuplicateReport(mockDuplicateGroups, {
        format: 'json'
      });

      expect(result.filename).toMatch(/duplicate-report-\d+\.json/);
      expect(result.mimeType).toBe('application/json');

      const text = await result.data.text();
      const data = JSON.parse(text);
      
      expect(data.userId).toBe(mockUserId);
      expect(data.summary.totalGroups).toBe(2);
      expect(data.groups).toHaveLength(2);
      expect(data.summary.potentialSpaceSaved).toBeGreaterThan(0);
    });

    it('should export duplicate report as CSV', async () => {
      const result = await exportService.exportDuplicateReport(mockDuplicateGroups, {
        format: 'csv'
      });

      expect(result.mimeType).toBe('text/csv');

      const text = await result.data.text();
      const lines = text.split('\n');
      
      expect(lines[0]).toBe('Group ID,File Name,File Path,Size,Similarity,Type');
      expect(lines.length).toBeGreaterThan(4); // Header + 4 files
    });

    it('should calculate potential space savings correctly', async () => {
      const result = await exportService.exportDuplicateReport(mockDuplicateGroups, {
        format: 'json'
      });

      const text = await result.data.text();
      const data = JSON.parse(text);
      
      // Should save 1024 (second file in group1) + 2048 (smaller file in group2)
      const expectedSavings = 1024 + 2048;
      expect(data.summary.potentialSpaceSaved).toBe(expectedSavings);
    });
  });

  describe('Analysis Report Export', () => {
    const mockAnalysisResults = {
      fileTypes: { documents: 10, images: 20 },
      categories: { work: 15, personal: 15 },
      insights: { totalSize: '1 GB', oldestFile: '2020-01-01' }
    };

    it('should export analysis report as JSON', async () => {
      const result = await exportService.exportAnalysisReport(mockAnalysisResults, {
        format: 'json'
      });

      expect(result.filename).toMatch(/analysis-report-\d+\.json/);
      expect(result.mimeType).toBe('application/json');

      const text = await result.data.text();
      const data = JSON.parse(text);
      
      expect(data.userId).toBe(mockUserId);
      expect(data.analysis).toEqual(mockAnalysisResults);
    });

    it('should throw error for unsupported analysis export format', async () => {
      await expect(
        exportService.exportAnalysisReport(mockAnalysisResults, {
          format: 'csv' // Not supported for analysis
        })
      ).rejects.toThrow('Unsupported format for analysis report: csv');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported export format', async () => {
      await expect(
        exportService.exportFileInventory([], {
          format: 'xml' as ExportFormat // Invalid format
        })
      ).rejects.toThrow('Unsupported export format: xml');
    });
  });

  describe('File Size Calculations', () => {
    it('should calculate correct blob sizes', async () => {
      const mockFiles: FileExportData[] = [{
        id: 'file1',
        name: 'test.txt',
        mimeType: 'text/plain'
      }];

      const result = await exportService.exportFileInventory(mockFiles, {
        format: 'json'
      });

      expect(result.size).toBeGreaterThan(0);
      expect(result.size).toBe(result.data.size);
    });
  });
});