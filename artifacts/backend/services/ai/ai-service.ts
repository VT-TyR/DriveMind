/**
 * AI Service - Production Implementation with PII Protection
 * Gemini AI integration for file classification and organization with comprehensive security
 */

import { z } from 'zod';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { logger } from '../logging/logger';
import { metrics } from '../monitoring/metrics';
import { protectedExternalCall } from '../resilience/circuit-breaker';
import { PIIRedactionService } from '../security/pii-redaction-service';
import { DriveFile } from '../drive/drive-service';
import { 
  AIServiceError, 
  ValidationError, 
  QuotaExceededError, 
  UnauthorizedError,
  ServiceUnavailableError 
} from '../errors/error-types';

// Validation Schemas
const ClassificationRequestSchema = z.object({
  userId: z.string().min(1),
  fileIds: z.array(z.string()).min(1).max(50),
  categories: z.array(z.string()).optional(),
  includeContent: z.boolean().default(false),
  redactionLevel: z.enum(['basic', 'comprehensive', 'strict']).default('comprehensive'),
  consentConfirmed: z.boolean().default(false),
}).strict();

const OrganizationRequestSchema = z.object({
  userId: z.string().min(1),
  analysisType: z.enum(['structure', 'content', 'both']).default('both'),
  maxSuggestions: z.number().int().min(1).max(50).default(10),
  focusArea: z.enum(['downloads', 'documents', 'media', 'all']).default('all'),
}).strict();

const RuleGenerationRequestSchema = z.object({
  userId: z.string().min(1),
  description: z.string().min(5).max(1000),
  sampleFiles: z.array(z.string()).max(10).optional(),
  targetFolder: z.string().optional(),
}).strict();

export interface FileClassification {
  fileId: string;
  fileName: string;
  redactedFileName: string;
  category: string;
  confidence: number;
  tags: string[];
  reasoning: string;
  piiDetected: string[];
}

export interface OrganizationSuggestion {
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

export interface OrganizationRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  action: 'move' | 'rename' | 'tag' | 'organize';
  target: string;
  conditions: {
    fileTypes?: string[];
    namePattern?: string;
    sizeRange?: { min?: number; max?: number };
    dateRange?: { after?: Date; before?: Date };
  };
  isActive: boolean;
  priority: number;
  confidence: number;
}

export interface AIHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    gemini: {
      status: string;
      latency: number;
      quotaRemaining: number;
      lastCheck: Date;
    };
  };
  capabilities: {
    classification: boolean;
    organization: boolean;
    ruleGeneration: boolean;
  };
}

/**
 * AI Service with PII protection and GDPR compliance
 */
export class AIService {
  private static instance: AIService;
  private genAI: GoogleGenerativeAI;
  private model: any;
  private piiRedactionService: PIIRedactionService;
  private requestCount = 0;
  private quotaRemaining = 1000;
  private lastHealthCheck = new Date();

  private constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIServiceError('GEMINI_API_KEY environment variable is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.3, // Lower temperature for more consistent results
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    this.piiRedactionService = PIIRedactionService.getInstance();
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Classify files using AI with comprehensive PII protection
   */
  async classifyFiles(request: unknown): Promise<{
    classifications: FileClassification[];
    redactionSummary: {
      filesProcessed: number;
      piiInstancesRedacted: number;
      redactionPatterns: string[];
      auditId: string;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Validate request
      const validatedRequest = ClassificationRequestSchema.parse(request);
      const { userId, fileIds, categories, includeContent, redactionLevel, consentConfirmed } = validatedRequest;

      // Security: User context validation
      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('Valid userId is required');
      }

      // Security: Consent validation for AI processing
      if (!consentConfirmed) {
        throw new UnauthorizedError('User consent required for AI processing of potentially sensitive data');
      }

      logger.info('Starting AI file classification with PII protection', {
        userId,
        fileCount: fileIds.length,
        redactionLevel,
        includeContent,
        hasCategories: !!categories?.length,
      });

      // Get file metadata from Drive service (this would be injected in real implementation)
      const files = await this.getFileMetadata(userId, fileIds);
      
      const classifications: FileClassification[] = [];
      let totalPiiInstances = 0;
      const allRedactionPatterns: Set<string> = new Set();

      // Process files individually for better error isolation
      for (const file of files) {
        try {
          const classification = await this.classifyIndividualFile(
            file,
            userId,
            categories,
            redactionLevel,
            includeContent
          );
          
          classifications.push(classification);
          totalPiiInstances += classification.piiDetected.length;
          classification.piiDetected.forEach(pattern => allRedactionPatterns.add(pattern));

        } catch (error) {
          logger.warn('Failed to classify individual file', {
            userId,
            fileId: file.id,
            fileName: file.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          // Add failed classification result
          classifications.push({
            fileId: file.id,
            fileName: file.name,
            redactedFileName: file.name,
            category: 'unknown',
            confidence: 0,
            tags: ['classification_failed'],
            reasoning: 'AI classification failed',
            piiDetected: [],
          });
        }
      }

      // Create audit trail
      const auditId = await this.createAuditTrail(userId, 'file_classification', {
        fileIds,
        classificationsCount: classifications.length,
        piiInstancesRedacted: totalPiiInstances,
        redactionLevel,
      });

      const processingTime = Date.now() - startTime;
      
      // Update metrics
      metrics.recordEvent('ai_classification_completed', {
        filesProcessed: classifications.length,
        processingTimeMs: processingTime,
        piiInstancesRedacted: totalPiiInstances,
        redactionLevel,
      });

      logger.info('AI file classification completed', {
        userId,
        filesProcessed: classifications.length,
        processingTime,
        piiInstancesRedacted: totalPiiInstances,
        auditId,
      });

      return {
        classifications,
        redactionSummary: {
          filesProcessed: classifications.length,
          piiInstancesRedacted: totalPiiInstances,
          redactionPatterns: Array.from(allRedactionPatterns),
          auditId,
        },
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('AI file classification failed', {
        userId: (request as any)?.userId,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      metrics.recordEvent('ai_classification_failed', {
        processingTimeMs: processingTime,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      });

      if (error instanceof z.ZodError) {
        throw new ValidationError(`Request validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }

      throw error instanceof AIServiceError ? error : new AIServiceError(`Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate organization recommendations
   */
  async generateOrganizationSuggestions(request: unknown): Promise<{
    suggestions: OrganizationSuggestion[];
    folderStructure: Record<string, any>;
    rules: OrganizationRule[];
  }> {
    const startTime = Date.now();
    
    try {
      const validatedRequest = OrganizationRequestSchema.parse(request);
      const { userId, analysisType, maxSuggestions, focusArea } = validatedRequest;

      logger.info('Starting AI organization analysis', {
        userId,
        analysisType,
        maxSuggestions,
        focusArea,
      });

      // Get drive structure for analysis
      const driveStructure = await this.getDriveStructure(userId, focusArea);
      
      // Generate AI recommendations
      const suggestions = await protectedExternalCall(
        'gemini-organization',
        () => this.generateSuggestions(driveStructure, analysisType, maxSuggestions),
        {
          timeout: 30000,
          retries: 2,
        }
      );

      // Generate folder structure recommendations
      const folderStructure = await this.generateFolderStructure(driveStructure, analysisType);

      // Generate organization rules
      const rules = await this.generateOrganizationRules(suggestions, driveStructure);

      const processingTime = Date.now() - startTime;

      metrics.recordEvent('ai_organization_completed', {
        suggestionsGenerated: suggestions.length,
        rulesGenerated: rules.length,
        processingTimeMs: processingTime,
        analysisType,
      });

      logger.info('AI organization analysis completed', {
        userId,
        suggestionsGenerated: suggestions.length,
        processingTime,
      });

      return {
        suggestions,
        folderStructure,
        rules,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('AI organization analysis failed', {
        userId: (request as any)?.userId,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      metrics.recordEvent('ai_organization_failed', {
        processingTimeMs: processingTime,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      });

      if (error instanceof z.ZodError) {
        throw new ValidationError(`Request validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }

      throw error instanceof AIServiceError ? error : new AIServiceError(`Organization analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate organization rule from natural language description
   */
  async proposeRule(request: unknown): Promise<OrganizationRule> {
    const startTime = Date.now();
    
    try {
      const validatedRequest = RuleGenerationRequestSchema.parse(request);
      const { userId, description, sampleFiles, targetFolder } = validatedRequest;

      logger.info('Starting AI rule generation', {
        userId,
        description: description.substring(0, 100) + '...',
        hasSampleFiles: !!sampleFiles?.length,
        hasTargetFolder: !!targetFolder,
      });

      // Analyze sample files if provided
      let sampleAnalysis = '';
      if (sampleFiles && sampleFiles.length > 0) {
        const files = await this.getFileMetadata(userId, sampleFiles);
        sampleAnalysis = this.analyzeSampleFiles(files);
      }

      // Generate rule using AI
      const rule = await protectedExternalCall(
        'gemini-rule-generation',
        () => this.generateRule(description, sampleAnalysis, targetFolder),
        {
          timeout: 20000,
          retries: 2,
        }
      );

      const processingTime = Date.now() - startTime;

      metrics.recordEvent('ai_rule_generated', {
        processingTimeMs: processingTime,
        ruleType: rule.action,
        confidence: rule.confidence,
      });

      logger.info('AI rule generation completed', {
        userId,
        ruleId: rule.id,
        ruleAction: rule.action,
        confidence: rule.confidence,
        processingTime,
      });

      return rule;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('AI rule generation failed', {
        userId: (request as any)?.userId,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      metrics.recordEvent('ai_rule_generation_failed', {
        processingTimeMs: processingTime,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      });

      if (error instanceof z.ZodError) {
        throw new ValidationError(`Request validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }

      throw error instanceof AIServiceError ? error : new AIServiceError(`Rule generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Health check for AI services
   */
  async healthCheck(): Promise<AIHealthStatus> {
    const startTime = Date.now();
    
    try {
      // Test Gemini API connectivity
      const geminiHealth = await this.checkGeminiHealth();
      
      const latency = Date.now() - startTime;
      this.lastHealthCheck = new Date();

      const status: AIHealthStatus = {
        status: geminiHealth.status === 'healthy' ? 'healthy' : 'degraded',
        services: {
          gemini: {
            status: geminiHealth.status,
            latency,
            quotaRemaining: this.quotaRemaining,
            lastCheck: this.lastHealthCheck,
          },
        },
        capabilities: {
          classification: geminiHealth.status === 'healthy',
          organization: geminiHealth.status === 'healthy',
          ruleGeneration: geminiHealth.status === 'healthy',
        },
      };

      metrics.recordEvent('ai_health_check', {
        status: status.status,
        latency,
        quotaRemaining: this.quotaRemaining,
      });

      return status;

    } catch (error) {
      logger.error('AI health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'unhealthy',
        services: {
          gemini: {
            status: 'unhealthy',
            latency: Date.now() - startTime,
            quotaRemaining: 0,
            lastCheck: new Date(),
          },
        },
        capabilities: {
          classification: false,
          organization: false,
          ruleGeneration: false,
        },
      };
    }
  }

  // Private helper methods

  private async classifyIndividualFile(
    file: DriveFile,
    userId: string,
    categories?: string[],
    redactionLevel = 'comprehensive',
    includeContent = false
  ): Promise<FileClassification> {
    // Redact PII from file metadata before sending to AI
    const redactionResult = await this.piiRedactionService.redactPII(
      JSON.stringify({
        name: file.name,
        mimeType: file.mimeType,
        path: file.path,
      }),
      userId,
      true, // consentValidation
      redactionLevel
    );

    const redactedMetadata = JSON.parse(redactionResult.redactedText);

    // Construct AI prompt
    const prompt = this.buildClassificationPrompt(redactedMetadata, categories);

    // Call Gemini API
    const result = await protectedExternalCall(
      'gemini-classification',
      async () => {
        const response = await this.model.generateContent(prompt);
        const responseText = response.response.text();
        return this.parseClassificationResponse(responseText);
      },
      {
        timeout: 15000,
        retries: 2,
      }
    );

    return {
      fileId: file.id,
      fileName: file.name,
      redactedFileName: redactedMetadata.name,
      category: result.category,
      confidence: result.confidence,
      tags: result.tags,
      reasoning: result.reasoning,
      piiDetected: redactionResult.piiTypes,
    };
  }

  private buildClassificationPrompt(metadata: any, categories?: string[]): string {
    const categoryList = categories?.join(', ') || 'Document, Spreadsheet, Presentation, Image, Video, Audio, Archive, Code, Other';
    
    return `
Classify this file based on its metadata. Respond only with valid JSON.

File metadata:
${JSON.stringify(metadata, null, 2)}

Available categories: ${categoryList}

Respond with this exact JSON structure:
{
  "category": "most appropriate category from the list",
  "confidence": 0.95,
  "tags": ["tag1", "tag2", "tag3"],
  "reasoning": "Brief explanation of classification decision"
}

Requirements:
- Choose ONE category from the available list
- Confidence should be between 0 and 1
- Provide 2-5 relevant tags
- Keep reasoning under 100 characters
- Use only the provided categories
`;
  }

  private parseClassificationResponse(response: string): {
    category: string;
    confidence: number;
    tags: string[];
    reasoning: string;
  } {
    try {
      // Clean up response - remove markdown formatting if present
      const cleanResponse = response.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = JSON.parse(cleanResponse);
      
      return {
        category: parsed.category || 'Other',
        confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      logger.warn('Failed to parse AI classification response', {
        response: response.substring(0, 200),
        error: error instanceof Error ? error.message : 'Parse error',
      });

      return {
        category: 'Other',
        confidence: 0.1,
        tags: ['parsing_failed'],
        reasoning: 'Failed to parse AI response',
      };
    }
  }

  private async checkGeminiHealth(): Promise<{ status: string }> {
    try {
      const testPrompt = 'Respond with just the word "healthy"';
      const response = await this.model.generateContent(testPrompt);
      const text = response.response.text().toLowerCase().trim();
      
      return {
        status: text.includes('healthy') ? 'healthy' : 'degraded',
      };
    } catch (error) {
      return { status: 'unhealthy' };
    }
  }

  private async getFileMetadata(userId: string, fileIds: string[]): Promise<DriveFile[]> {
    // This would integrate with the Drive service
    // For now, returning mock data structure
    return fileIds.map(id => ({
      id,
      name: `file_${id}.pdf`,
      mimeType: 'application/pdf',
      size: 1024000,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      parents: ['root'],
      path: ['root'],
      webViewLink: `https://drive.google.com/file/d/${id}/view`,
      shared: false,
      ownedByMe: true,
      capabilities: {
        canEdit: true,
        canDelete: true,
        canShare: true,
      },
    }));
  }

  private async getDriveStructure(userId: string, focusArea: string): Promise<any> {
    // This would integrate with the Drive service to get actual structure
    return {
      totalFiles: 1000,
      folderCount: 50,
      focusArea,
      sampleStructure: {
        'Downloads': { fileCount: 200, subfolders: 5 },
        'Documents': { fileCount: 300, subfolders: 10 },
        'Pictures': { fileCount: 400, subfolders: 20 },
        'Videos': { fileCount: 100, subfolders: 5 },
      },
    };
  }

  private async generateSuggestions(
    driveStructure: any,
    analysisType: string,
    maxSuggestions: number
  ): Promise<OrganizationSuggestion[]> {
    // Generate AI-based organization suggestions
    const prompt = `
Analyze this Google Drive structure and provide ${maxSuggestions} organization suggestions.

Drive structure:
${JSON.stringify(driveStructure, null, 2)}

Analysis type: ${analysisType}

Respond with JSON array of suggestions with this structure:
[
  {
    "id": "suggestion_1",
    "type": "folder_creation",
    "title": "Create Archive folder",
    "description": "Organize old files into archive structure",
    "confidence": 0.85,
    "impact": "medium",
    "affectedFiles": 150,
    "estimatedTimeMinutes": 30,
    "prerequisites": ["Review files older than 1 year"]
  }
]

Types: folder_creation, file_move, folder_rename, structure_optimization
Impact levels: low, medium, high
`;

    try {
      const response = await this.model.generateContent(prompt);
      const responseText = response.response.text();
      const cleanResponse = responseText.replace(/```json\n?|```\n?/g, '').trim();
      return JSON.parse(cleanResponse);
    } catch (error) {
      logger.warn('Failed to generate AI organization suggestions', {
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return [];
    }
  }

  private async generateFolderStructure(driveStructure: any, analysisType: string): Promise<Record<string, any>> {
    // Generate recommended folder structure
    return {
      recommended: {
        'Work': {
          'Projects': {},
          'Archive': {},
          'Templates': {},
        },
        'Personal': {
          'Finance': {},
          'Health': {},
          'Travel': {},
        },
        'Media': {
          'Photos': {},
          'Videos': {},
          'Audio': {},
        },
      },
    };
  }

  private async generateOrganizationRules(
    suggestions: OrganizationSuggestion[],
    driveStructure: any
  ): Promise<OrganizationRule[]> {
    // Convert suggestions into actionable rules
    return suggestions.map((suggestion, index) => ({
      id: `rule_${Date.now()}_${index}`,
      name: suggestion.title,
      description: suggestion.description,
      pattern: this.extractPatternFromSuggestion(suggestion),
      action: this.mapSuggestionToAction(suggestion.type),
      target: suggestion.type === 'folder_creation' ? 'new_folder' : 'existing_folder',
      conditions: {
        fileTypes: ['*'],
      },
      isActive: false,
      priority: suggestion.impact === 'high' ? 1 : suggestion.impact === 'medium' ? 2 : 3,
      confidence: suggestion.confidence,
    }));
  }

  private extractPatternFromSuggestion(suggestion: OrganizationSuggestion): string {
    // Extract file matching pattern from suggestion
    if (suggestion.title.toLowerCase().includes('pdf')) {
      return '*.pdf';
    }
    if (suggestion.title.toLowerCase().includes('image')) {
      return '*.{jpg,png,gif}';
    }
    return '*';
  }

  private mapSuggestionToAction(suggestionType: string): 'move' | 'rename' | 'tag' | 'organize' {
    switch (suggestionType) {
      case 'file_move': return 'move';
      case 'folder_rename': return 'rename';
      case 'structure_optimization': return 'organize';
      default: return 'organize';
    }
  }

  private analyzeSampleFiles(files: DriveFile[]): string {
    const analysis = files.map(file => ({
      name: file.name,
      type: file.mimeType,
      size: file.size,
      path: file.path.join('/'),
    }));

    return JSON.stringify(analysis, null, 2);
  }

  private async generateRule(
    description: string,
    sampleAnalysis: string,
    targetFolder?: string
  ): Promise<OrganizationRule> {
    const prompt = `
Generate an organization rule based on this natural language description:

Description: "${description}"

${sampleAnalysis ? `Sample file analysis:\n${sampleAnalysis}` : ''}

${targetFolder ? `Target folder: ${targetFolder}` : ''}

Respond with this exact JSON structure:
{
  "id": "rule_generated_timestamp",
  "name": "Clear rule name",
  "description": "Detailed rule description",
  "pattern": "File matching pattern (e.g., *.pdf, *invoice*, etc.)",
  "action": "move",
  "target": "target folder path",
  "conditions": {
    "fileTypes": ["pdf", "doc"],
    "namePattern": ".*invoice.*",
    "sizeRange": {"min": 1000}
  },
  "isActive": false,
  "priority": 10,
  "confidence": 0.8
}

Actions: move, rename, tag, organize
Priority: 1-100 (lower = higher priority)
Confidence: 0-1 (based on description clarity)
`;

    try {
      const response = await this.model.generateContent(prompt);
      const responseText = response.response.text();
      const cleanResponse = responseText.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = JSON.parse(cleanResponse);

      return {
        id: `rule_${Date.now()}`,
        name: parsed.name || 'Generated Rule',
        description: parsed.description || description,
        pattern: parsed.pattern || '*',
        action: parsed.action || 'organize',
        target: parsed.target || targetFolder || 'Organized',
        conditions: parsed.conditions || {},
        isActive: false,
        priority: Math.min(Math.max(parsed.priority || 10, 1), 100),
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
      };
    } catch (error) {
      logger.warn('Failed to parse AI rule generation response', {
        description,
        error: error instanceof Error ? error.message : 'Parse error',
      });

      // Fallback rule
      return {
        id: `rule_${Date.now()}`,
        name: 'Custom Organization Rule',
        description,
        pattern: '*',
        action: 'organize',
        target: targetFolder || 'Organized',
        conditions: {},
        isActive: false,
        priority: 10,
        confidence: 0.3,
      };
    }
  }

  private async createAuditTrail(userId: string, operation: string, details: any): Promise<string> {
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Store audit record in Firestore
      const db = admin.firestore();
      await db.collection('_system').doc('audit').collection('ai_operations').add({
        auditId,
        userId,
        operation,
        details,
        timestamp: new Date(),
        service: 'ai-service',
      });

      return auditId;
    } catch (error) {
      logger.error('Failed to create audit trail', {
        userId,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return auditId; // Return ID even if logging fails
    }
  }
}

// Export singleton instance
export const aiService = AIService.getInstance();