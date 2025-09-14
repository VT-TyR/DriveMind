/**
 * AI Service Unit Tests
 * Comprehensive test suite for AI-powered file classification and organization
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AIService } from '../../services/ai/ai-service';
import { PIIRedactionService } from '../../services/security/pii-redaction-service';
import { ValidationError, AIServiceError, UnauthorizedError } from '../../services/errors/error-types';

// Mock dependencies
jest.mock('../../services/security/pii-redaction-service');
jest.mock('../../services/logging/logger');
jest.mock('../../services/monitoring/metrics');
jest.mock('../../services/resilience/circuit-breaker');
jest.mock('../../../src/lib/admin');

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

describe('AIService', () => {
  let aiService: AIService;
  let mockPiiRedactionService: jest.Mocked<PIIRedactionService>;
  let mockModel: any;

  beforeEach(() => {
    // Reset environment
    process.env.GEMINI_API_KEY = 'test-api-key';
    
    // Create fresh instance
    jest.clearAllMocks();
    
    // Mock PII redaction service
    mockPiiRedactionService = {
      redactPII: jest.fn(),
    } as any;
    
    (PIIRedactionService.getInstance as jest.Mock).mockReturnValue(mockPiiRedactionService);
    
    // Mock Gemini model
    mockModel = {
      generateContent: jest.fn(),
    };
    
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    }));
    
    // Mock circuit breaker
    const { protectedExternalCall } = require('../../services/resilience/circuit-breaker');
    (protectedExternalCall as jest.Mock).mockImplementation(async (name, fn) => fn());
    
    aiService = AIService.getInstance();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  describe('Constructor', () => {
    it('should throw error if GEMINI_API_KEY is not provided', () => {
      delete process.env.GEMINI_API_KEY;
      expect(() => {
        // Force new instance creation by clearing singleton
        (AIService as any).instance = null;
        AIService.getInstance();
      }).toThrow('GEMINI_API_KEY environment variable is required');
    });

    it('should initialize with proper safety settings', () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const mockConstructor = GoogleGenerativeAI as jest.Mock;
      
      expect(mockConstructor).toHaveBeenCalledWith('test-api-key');
      
      const mockInstance = mockConstructor.mock.results[0].value;
      expect(mockInstance.getGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
        safetySettings: expect.arrayContaining([
          expect.objectContaining({
            category: 'HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          }),
        ]),
      });
    });
  });

  describe('classifyFiles', () => {
    beforeEach(() => {
      // Mock PII redaction response
      mockPiiRedactionService.redactPII.mockResolvedValue({
        redactedText: JSON.stringify({
          name: 'redacted_document.pdf',
          mimeType: 'application/pdf',
          path: ['root', 'documents'],
        }),
        piiTypes: ['email', 'phone'],
        redactionCount: 2,
        auditId: 'audit_123',
        consentValidated: true,
      });

      // Mock Gemini API response
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            category: 'Document',
            confidence: 0.95,
            tags: ['pdf', 'business', 'document'],
            reasoning: 'PDF document with business content',
          }),
        },
      });

      // Mock admin.firestore() for audit trail
      const mockFirestore = {
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue({
            collection: jest.fn().mockReturnValue({
              add: jest.fn().mockResolvedValue({ id: 'audit_doc_123' }),
            }),
          }),
        }),
      };
      
      const { admin } = require('../../../src/lib/admin');
      admin.firestore = jest.fn().mockReturnValue(mockFirestore);
    });

    it('should successfully classify files with PII protection', async () => {
      const request = {
        userId: 'user123',
        fileIds: ['file1', 'file2'],
        redactionLevel: 'comprehensive',
        consentConfirmed: true,
      };

      const result = await aiService.classifyFiles(request);

      expect(result).toHaveProperty('classifications');
      expect(result).toHaveProperty('redactionSummary');
      expect(result.classifications).toHaveLength(2);
      
      // Check individual classification
      const classification = result.classifications[0];
      expect(classification).toEqual({
        fileId: 'file1',
        fileName: 'file_file1.pdf',
        redactedFileName: 'redacted_document.pdf',
        category: 'Document',
        confidence: 0.95,
        tags: ['pdf', 'business', 'document'],
        reasoning: 'PDF document with business content',
        piiDetected: ['email', 'phone'],
      });

      // Check redaction summary
      expect(result.redactionSummary).toEqual({
        filesProcessed: 2,
        piiInstancesRedacted: 4, // 2 files × 2 PII types each
        redactionPatterns: ['email', 'phone'],
        auditId: expect.stringMatching(/^audit_/),
      });

      // Verify PII redaction was called
      expect(mockPiiRedactionService.redactPII).toHaveBeenCalledTimes(2);
      expect(mockPiiRedactionService.redactPII).toHaveBeenCalledWith(
        expect.stringContaining('file_file1.pdf'),
        'user123',
        true,
        'comprehensive'
      );
    });

    it('should require user consent for AI processing', async () => {
      const request = {
        userId: 'user123',
        fileIds: ['file1'],
        consentConfirmed: false,
      };

      await expect(aiService.classifyFiles(request)).rejects.toThrow(UnauthorizedError);
      await expect(aiService.classifyFiles(request)).rejects.toThrow('User consent required for AI processing');
    });

    it('should validate request parameters', async () => {
      const invalidRequest = {
        userId: '', // Invalid empty userId
        fileIds: [],
        consentConfirmed: true,
      };

      await expect(aiService.classifyFiles(invalidRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle file count limits', async () => {
      const request = {
        userId: 'user123',
        fileIds: new Array(51).fill(0).map((_, i) => `file${i}`), // Exceeds 50 file limit
        consentConfirmed: true,
      };

      await expect(aiService.classifyFiles(request)).rejects.toThrow(ValidationError);
    });

    it('should handle individual file classification failures gracefully', async () => {
      mockPiiRedactionService.redactPII
        .mockResolvedValueOnce({
          redactedText: JSON.stringify({ name: 'file1.pdf', mimeType: 'application/pdf', path: [] }),
          piiTypes: [],
          redactionCount: 0,
          auditId: 'audit_1',
          consentValidated: true,
        })
        .mockRejectedValueOnce(new Error('PII redaction failed'));

      const request = {
        userId: 'user123',
        fileIds: ['file1', 'file2'],
        consentConfirmed: true,
      };

      const result = await aiService.classifyFiles(request);

      expect(result.classifications).toHaveLength(2);
      expect(result.classifications[0].category).toBe('Document');
      expect(result.classifications[1].category).toBe('unknown');
      expect(result.classifications[1].tags).toContain('classification_failed');
    });

    it('should handle malformed AI responses', async () => {
      mockPiiRedactionService.redactPII.mockResolvedValue({
        redactedText: JSON.stringify({ name: 'test.pdf', mimeType: 'application/pdf', path: [] }),
        piiTypes: [],
        redactionCount: 0,
        auditId: 'audit_123',
        consentValidated: true,
      });

      // Mock invalid JSON response
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'Invalid JSON response',
        },
      });

      const request = {
        userId: 'user123',
        fileIds: ['file1'],
        consentConfirmed: true,
      };

      const result = await aiService.classifyFiles(request);

      expect(result.classifications[0]).toEqual({
        fileId: 'file1',
        fileName: 'file_file1.pdf',
        redactedFileName: 'test.pdf',
        category: 'Other',
        confidence: 0.1,
        tags: ['parsing_failed'],
        reasoning: 'Failed to parse AI response',
        piiDetected: [],
      });
    });

    it('should respect custom categories', async () => {
      mockPiiRedactionService.redactPII.mockResolvedValue({
        redactedText: JSON.stringify({ name: 'invoice.pdf', mimeType: 'application/pdf', path: [] }),
        piiTypes: [],
        redactionCount: 0,
        auditId: 'audit_123',
        consentValidated: true,
      });

      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            category: 'Invoice',
            confidence: 0.9,
            tags: ['financial', 'business'],
            reasoning: 'Financial document',
          }),
        },
      });

      const request = {
        userId: 'user123',
        fileIds: ['file1'],
        categories: ['Invoice', 'Receipt', 'Contract'],
        consentConfirmed: true,
      };

      await aiService.classifyFiles(request);

      // Verify custom categories were included in prompt
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('Invoice, Receipt, Contract')
      );
    });
  });

  describe('generateOrganizationSuggestions', () => {
    beforeEach(() => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            {
              id: 'suggestion_1',
              type: 'folder_creation',
              title: 'Create Archive folder',
              description: 'Organize old files into archive structure',
              confidence: 0.85,
              impact: 'medium',
              affectedFiles: 150,
              estimatedTimeMinutes: 30,
              prerequisites: ['Review files older than 1 year'],
            },
          ]),
        },
      });
    });

    it('should generate organization suggestions successfully', async () => {
      const request = {
        userId: 'user123',
        analysisType: 'both',
        maxSuggestions: 5,
        focusArea: 'documents',
      };

      const result = await aiService.generateOrganizationSuggestions(request);

      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('folderStructure');
      expect(result).toHaveProperty('rules');
      
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]).toEqual({
        id: 'suggestion_1',
        type: 'folder_creation',
        title: 'Create Archive folder',
        description: 'Organize old files into archive structure',
        confidence: 0.85,
        impact: 'medium',
        affectedFiles: 150,
        estimatedTimeMinutes: 30,
        prerequisites: ['Review files older than 1 year'],
      });

      expect(result.folderStructure).toHaveProperty('recommended');
      expect(result.rules).toBeInstanceOf(Array);
    });

    it('should validate request parameters', async () => {
      const invalidRequest = {
        userId: '',
        maxSuggestions: 0,
      };

      await expect(aiService.generateOrganizationSuggestions(invalidRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle AI generation failures gracefully', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'Invalid JSON',
        },
      });

      const request = {
        userId: 'user123',
        analysisType: 'structure',
        maxSuggestions: 3,
        focusArea: 'all',
      };

      const result = await aiService.generateOrganizationSuggestions(request);

      expect(result.suggestions).toEqual([]);
      expect(result.folderStructure).toHaveProperty('recommended');
      expect(result.rules).toEqual([]);
    });
  });

  describe('proposeRule', () => {
    beforeEach(() => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            id: 'rule_123',
            name: 'PDF Invoice Organization',
            description: 'Move PDF invoices to Finance folder',
            pattern: '*invoice*.pdf',
            action: 'move',
            target: 'Finance/Invoices',
            conditions: {
              fileTypes: ['pdf'],
              namePattern: '.*invoice.*',
            },
            isActive: false,
            priority: 10,
            confidence: 0.9,
          }),
        },
      });
    });

    it('should generate rule from natural language description', async () => {
      const request = {
        userId: 'user123',
        description: 'Move all PDF invoices to the Finance folder',
        targetFolder: 'Finance',
      };

      const result = await aiService.proposeRule(request);

      expect(result).toMatchObject({
        name: 'PDF Invoice Organization',
        description: 'Move PDF invoices to Finance folder',
        pattern: '*invoice*.pdf',
        action: 'move',
        target: 'Finance/Invoices',
        confidence: 0.9,
        isActive: false,
      });

      expect(result.id).toMatch(/^rule_\d+$/);
    });

    it('should validate request parameters', async () => {
      const invalidRequest = {
        userId: '',
        description: 'x', // Too short
      };

      await expect(aiService.proposeRule(invalidRequest)).rejects.toThrow(ValidationError);
    });

    it('should provide fallback rule on AI failure', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'Invalid JSON response',
        },
      });

      const request = {
        userId: 'user123',
        description: 'Organize my documents better',
      };

      const result = await aiService.proposeRule(request);

      expect(result).toMatchObject({
        name: 'Custom Organization Rule',
        description: 'Organize my documents better',
        pattern: '*',
        action: 'organize',
        target: 'Organized',
        confidence: 0.3,
      });
    });

    it('should analyze sample files when provided', async () => {
      const request = {
        userId: 'user123',
        description: 'Create rule based on these samples',
        sampleFiles: ['file1', 'file2'],
      };

      await aiService.proposeRule(request);

      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('Sample file analysis')
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when AI service is working', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'healthy',
        },
      });

      const result = await aiService.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.services.gemini.status).toBe('healthy');
      expect(result.capabilities).toEqual({
        classification: true,
        organization: true,
        ruleGeneration: true,
      });
    });

    it('should return unhealthy status when AI service fails', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('API Error'));

      const result = await aiService.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.services.gemini.status).toBe('unhealthy');
      expect(result.capabilities).toEqual({
        classification: false,
        organization: false,
        ruleGeneration: false,
      });
    });

    it('should return degraded status for unexpected responses', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'unexpected response',
        },
      });

      const result = await aiService.healthCheck();

      expect(result.status).toBe('degraded');
      expect(result.services.gemini.status).toBe('degraded');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = AIService.getInstance();
      const instance2 = AIService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Error Handling', () => {
    it('should handle Zod validation errors properly', async () => {
      const invalidRequest = {
        userId: 123, // Should be string
        fileIds: 'not-array',
      };

      await expect(aiService.classifyFiles(invalidRequest)).rejects.toThrow(ValidationError);
    });

    it('should wrap unknown errors in AIServiceError', async () => {
      mockPiiRedactionService.redactPII.mockRejectedValue(new Error('Unknown error'));

      const request = {
        userId: 'user123',
        fileIds: ['file1'],
        consentConfirmed: true,
      };

      await expect(aiService.classifyFiles(request)).rejects.toThrow(AIServiceError);
    });
  });

  describe('Performance and Limits', () => {
    it('should respect file batch limits', async () => {
      const request = {
        userId: 'user123',
        fileIds: new Array(60).fill(0).map((_, i) => `file${i}`), // Exceeds 50 limit
        consentConfirmed: true,
      };

      await expect(aiService.classifyFiles(request)).rejects.toThrow(ValidationError);
      expect(mockModel.generateContent).not.toHaveBeenCalled();
    });

    it('should respect suggestion limits', async () => {
      const request = {
        userId: 'user123',
        maxSuggestions: 60, // Exceeds 50 limit
      };

      await expect(aiService.generateOrganizationSuggestions(request)).rejects.toThrow(ValidationError);
    });
  });
});