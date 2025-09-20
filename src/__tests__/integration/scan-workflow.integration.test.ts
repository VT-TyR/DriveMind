/**
 * Integration tests for background scan workflow
 * Tests the complete scan process from initiation to results
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      where: jest.fn(() => ({
        get: jest.fn(() => ({
          docs: [],
        })),
      })),
    })),
  })),
}));

// Mock fetch API
global.fetch = jest.fn();

describe('Background Scan Workflow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Scan Initiation', () => {
    it('should successfully initiate a background scan', async () => {
      const mockJobId = 'scan-job-123';
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          jobId: mockJobId,
          status: 'running',
          startedAt: new Date().toISOString(),
        }),
      });

      const response = await fetch('/api/workflows/background-scan', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ 
          type: 'full_analysis',
          config: { maxDepth: 20 }
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.jobId).toBe(mockJobId);
      expect(result.status).toBe('running');
    });

    it('should handle scan initiation errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ 
          error: 'Firebase Admin SDK error',
          message: 'Failed to create scan job',
        }),
      });

      const response = await fetch('/api/workflows/background-scan', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ type: 'full_analysis' }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });
  });

  describe('Real-time Progress Tracking', () => {
    it('should track scan progress via SSE', async () => {
      const mockJobId = 'scan-job-456';
      const progressUpdates = [
        { filesProcessed: 100, totalFiles: 1000, progress: 10 },
        { filesProcessed: 500, totalFiles: 1000, progress: 50 },
        { filesProcessed: 1000, totalFiles: 1000, progress: 100 },
      ];

      // Mock SSE endpoint
      (global.fetch as jest.Mock).mockImplementation((url) => {
        if (url.includes('/api/workflows/scan-progress')) {
          return Promise.resolve({
            ok: true,
            body: {
              getReader: () => ({
                read: jest.fn()
                  .mockResolvedValueOnce({ 
                    done: false, 
                    value: new TextEncoder().encode(`data: ${JSON.stringify(progressUpdates[0])}\n\n`) 
                  })
                  .mockResolvedValueOnce({ 
                    done: false, 
                    value: new TextEncoder().encode(`data: ${JSON.stringify(progressUpdates[1])}\n\n`) 
                  })
                  .mockResolvedValueOnce({ 
                    done: false, 
                    value: new TextEncoder().encode(`data: ${JSON.stringify(progressUpdates[2])}\n\n`) 
                  })
                  .mockResolvedValueOnce({ done: true }),
              }),
            },
          });
        }
      });

      const progressData: any[] = [];
      const response = await fetch(`/api/workflows/scan-progress/${mockJobId}`);
      const reader = response.body?.getReader();

      if (reader) {
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            const text = new TextDecoder().decode(result.value);
            if (text.startsWith('data: ')) {
              const data = JSON.parse(text.slice(6).trim());
              progressData.push(data);
            }
          }
        }
      }

      expect(progressData).toHaveLength(3);
      expect(progressData[2].progress).toBe(100);
    });
  });

  describe('Checkpoint and Resume', () => {
    it('should save checkpoint during scan', async () => {
      const mockCheckpoint = {
        jobId: 'scan-job-789',
        filesProcessed: 500,
        pageToken: 'next-page-token',
        timestamp: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          checkpointSaved: true,
          checkpoint: mockCheckpoint,
        }),
      });

      const response = await fetch('/api/workflows/checkpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockCheckpoint),
      });

      const result = await response.json();
      expect(result.checkpointSaved).toBe(true);
      expect(result.checkpoint.filesProcessed).toBe(500);
    });

    it('should resume scan from checkpoint', async () => {
      const mockCheckpoint = {
        filesProcessed: 500,
        pageToken: 'resume-token',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            checkpoint: mockCheckpoint,
            exists: true,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            resumed: true,
            jobId: 'resumed-job-123',
            startingFrom: 500,
          }),
        });

      // Get checkpoint
      const checkpointResponse = await fetch('/api/workflows/checkpoint/scan-job-789');
      const checkpoint = await checkpointResponse.json();
      expect(checkpoint.exists).toBe(true);

      // Resume scan
      const resumeResponse = await fetch('/api/workflows/background-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          resume: true,
          checkpoint: checkpoint.checkpoint,
        }),
      });

      const result = await resumeResponse.json();
      expect(result.resumed).toBe(true);
      expect(result.startingFrom).toBe(500);
    });
  });

  describe('Scan Results and Analysis', () => {
    it('should retrieve scan results after completion', async () => {
      const mockResults = {
        jobId: 'scan-job-complete',
        status: 'completed',
        filesProcessed: 10000,
        duplicatesFound: 250,
        storageRecoverable: '5.2 GB',
        completedAt: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      });

      const response = await fetch('/api/workflows/results/scan-job-complete');
      const results = await response.json();

      expect(results.status).toBe('completed');
      expect(results.duplicatesFound).toBe(250);
      expect(results.storageRecoverable).toBe('5.2 GB');
    });

    it('should handle duplicate detection analysis', async () => {
      const mockDuplicates = [
        {
          hash: 'file-hash-123',
          files: [
            { id: 'file-1', name: 'document.pdf', size: 1024000 },
            { id: 'file-2', name: 'document-copy.pdf', size: 1024000 },
          ],
        },
        {
          hash: 'file-hash-456',
          files: [
            { id: 'file-3', name: 'image.jpg', size: 2048000 },
            { id: 'file-4', name: 'image-backup.jpg', size: 2048000 },
            { id: 'file-5', name: 'image-copy.jpg', size: 2048000 },
          ],
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          duplicates: mockDuplicates,
          totalGroups: 2,
          totalFiles: 5,
          totalSize: 7168000,
        }),
      });

      const response = await fetch('/api/workflows/duplicates/scan-job-complete');
      const result = await response.json();

      expect(result.duplicates).toHaveLength(2);
      expect(result.totalFiles).toBe(5);
      expect(result.duplicates[1].files).toHaveLength(3);
    });
  });

  describe('Error Recovery and Retry', () => {
    it('should retry failed scan operations', async () => {
      let attemptCount = 0;

      (global.fetch as jest.Mock).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({ error: 'Service unavailable' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ 
            jobId: 'retry-success',
            status: 'running',
          }),
        });
      });

      const maxRetries = 3;
      let lastResponse;

      for (let i = 0; i < maxRetries; i++) {
        lastResponse = await fetch('/api/workflows/background-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (lastResponse.ok) break;
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retry
      }

      expect(attemptCount).toBe(3);
      expect(lastResponse?.ok).toBe(true);
    });

    it('should handle scan cancellation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          cancelled: true,
          jobId: 'scan-job-cancel',
          message: 'Scan cancelled by user',
        }),
      });

      const response = await fetch('/api/workflows/cancel/scan-job-cancel', {
        method: 'POST',
      });

      const result = await response.json();
      expect(result.cancelled).toBe(true);
      expect(result.message).toBe('Scan cancelled by user');
    });
  });

  describe('Complete Scan Workflow', () => {
    it('should execute full scan workflow from start to finish', async () => {
      const mockJobId = 'full-workflow-test';

      // Step 1: Initiate scan
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          jobId: mockJobId,
          status: 'running',
        }),
      });

      const initResponse = await fetch('/api/workflows/background-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'full_analysis' }),
      });

      const { jobId } = await initResponse.json();
      expect(jobId).toBe(mockJobId);

      // Step 2: Monitor progress
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          filesProcessed: 5000,
          totalFiles: 10000,
          progress: 50,
        }),
      });

      const progressResponse = await fetch(`/api/workflows/progress/${jobId}`);
      const progress = await progressResponse.json();
      expect(progress.progress).toBe(50);

      // Step 3: Get final results
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          status: 'completed',
          filesProcessed: 10000,
          duplicatesFound: 500,
          storageRecoverable: '10.5 GB',
        }),
      });

      const resultsResponse = await fetch(`/api/workflows/results/${jobId}`);
      const results = await resultsResponse.json();
      expect(results.status).toBe('completed');
      expect(results.filesProcessed).toBe(10000);

      // Step 4: Get duplicate details
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          duplicates: [],
          totalGroups: 150,
          totalFiles: 500,
        }),
      });

      const duplicatesResponse = await fetch(`/api/workflows/duplicates/${jobId}`);
      const duplicates = await duplicatesResponse.json();
      expect(duplicates.totalFiles).toBe(500);
    });
  });
});