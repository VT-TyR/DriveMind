/**
 * @fileoverview Validation Framework
 * Ensures data integrity and correctness during migration
 * Provides comprehensive validation for all data operations
 */

import { z } from 'zod';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SafetyGate,
  SafetyGateResult
} from './types';
import { isStrictValidation } from './feature-flags';
import { logger } from '@/lib/logger';
import { ActionBatchSchema } from '@/lib/ai-types';

type ActionBatch = z.infer<typeof ActionBatchSchema>;

/**
 * Validation rules for different data types
 */
const ValidationSchemas = {
  // File metadata schema
  fileMetadata: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(255),
    mimeType: z.string(),
    size: z.number().min(0),
    modifiedTime: z.string().datetime().optional(),
    parentId: z.string().optional(),
    md5Checksum: z.string().optional()
  }),

  // Folder structure schema
  folderStructure: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(255),
    parentId: z.string().optional(),
    children: z.array(z.string()).optional()
  }),

  // Migration configuration schema
  migrationConfig: z.object({
    sourceType: z.enum(['mock', 'firebase']),
    targetType: z.enum(['mock', 'firebase']),
    batchSize: z.number().min(1).max(1000),
    parallelism: z.number().min(1).max(10),
    validateBeforeWrite: z.boolean(),
    dryRun: z.boolean()
  })
};

/**
 * Validation Framework for data integrity
 */
export class ValidationFramework {
  private static instance: ValidationFramework;
  private safetyGates: Map<string, SafetyGate> = new Map();
  private validationHistory: ValidationResult[] = [];
  private customValidators: Map<string, (data: any) => Promise<ValidationResult>> = new Map();

  private constructor() {
    this.registerDefaultSafetyGates();
    this.registerDefaultValidators();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ValidationFramework {
    if (!ValidationFramework.instance) {
      ValidationFramework.instance = new ValidationFramework();
    }
    return ValidationFramework.instance;
  }

  /**
   * Register default safety gates
   */
  private registerDefaultSafetyGates(): void {
    // Data source availability gate
    this.registerSafetyGate({
      name: 'data_source_available',
      description: 'Verify data sources are available and healthy',
      condition: async () => {
        const { getDataSourceManager } = await import('./data-source-manager');
        const manager = getDataSourceManager();
        const health = await manager.checkHealth();
        return health.status === 'healthy';
      },
      severity: 'critical',
      blockOnFailure: true
    });

    // Feature flag consistency gate
    this.registerSafetyGate({
      name: 'feature_flags_valid',
      description: 'Verify feature flag dependencies are satisfied',
      condition: async () => {
        const { validateFeatureFlagDependencies } = await import('./feature-flags');
        const result = validateFeatureFlagDependencies();
        return result.valid;
      },
      severity: 'error',
      blockOnFailure: true
    });

    // Rollback availability gate
    this.registerSafetyGate({
      name: 'rollback_available',
      description: 'Verify rollback capability is available',
      condition: async () => {
        const { getRollbackManager } = await import('./rollback-manager');
        const manager = getRollbackManager();
        return manager.isRollbackAvailable();
      },
      severity: 'warning',
      blockOnFailure: false
    });

    // Performance thresholds gate
    this.registerSafetyGate({
      name: 'performance_acceptable',
      description: 'Verify performance is within acceptable thresholds',
      condition: async () => {
        const { getPerformanceMonitor } = await import('./performance-monitor');
        const monitor = getPerformanceMonitor();
        const report = monitor.generateReport();
        return report.health !== 'unhealthy';
      },
      severity: 'warning',
      blockOnFailure: false
    });

    // Storage capacity gate
    this.registerSafetyGate({
      name: 'storage_capacity',
      description: 'Verify sufficient storage capacity',
      condition: async () => {
        // Check if we have at least 1GB free space
        // This is a simplified check
        return true; // Would check actual disk space in production
      },
      severity: 'error',
      blockOnFailure: true
    });
  }

  /**
   * Register default validators
   */
  private registerDefaultValidators(): void {
    // Action batch validator
    this.registerValidator('action_batch', async (data: any) => {
      return this.validateWithSchema(data, ActionBatchSchema);
    });

    // File metadata validator
    this.registerValidator('file_metadata', async (data: any) => {
      return this.validateWithSchema(data, ValidationSchemas.fileMetadata);
    });

    // Folder structure validator
    this.registerValidator('folder_structure', async (data: any) => {
      return this.validateWithSchema(data, ValidationSchemas.folderStructure);
    });

    // Migration config validator
    this.registerValidator('migration_config', async (data: any) => {
      return this.validateWithSchema(data, ValidationSchemas.migrationConfig);
    });
  }

  /**
   * Validate data with a Zod schema
   */
  private validateWithSchema(data: any, schema: z.ZodSchema): ValidationResult {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      schema.parse(data);
      
      return {
        isValid: true,
        errors: [],
        warnings: [],
        stats: {
          itemsValidated: 1,
          itemsPassed: 1,
          itemsFailed: 0,
          validationTimeMs: Date.now() - startTime
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          errors.push({
            field: issue.path.join('.'),
            value: data,
            expected: issue.message,
            actual: JSON.stringify(issue),
            message: issue.message
          });
        }
      } else {
        errors.push({
          field: 'unknown',
          value: data,
          expected: 'valid data',
          actual: 'invalid',
          message: (error as Error).message
        });
      }

      return {
        isValid: false,
        errors,
        warnings,
        stats: {
          itemsValidated: 1,
          itemsPassed: 0,
          itemsFailed: 1,
          validationTimeMs: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Register a safety gate
   */
  public registerSafetyGate(gate: SafetyGate): void {
    this.safetyGates.set(gate.name, gate);
    logger.info('Safety gate registered', { name: gate.name });
  }

  /**
   * Register a custom validator
   */
  public registerValidator(
    name: string,
    validator: (data: any) => Promise<ValidationResult>
  ): void {
    this.customValidators.set(name, validator);
    logger.info('Custom validator registered', { name });
  }

  /**
   * Run all safety gates
   */
  public async runSafetyGates(): Promise<{
    passed: boolean;
    results: SafetyGateResult[];
    blockers: string[];
  }> {
    const results: SafetyGateResult[] = [];
    const blockers: string[] = [];
    let allPassed = true;

    for (const [name, gate] of this.safetyGates) {
      try {
        const passed = await gate.condition();
        const result: SafetyGateResult = {
          gate,
          passed,
          timestamp: new Date(),
          message: passed 
            ? `Safety gate '${name}' passed`
            : `Safety gate '${name}' failed: ${gate.description}`
        };

        results.push(result);

        if (!passed) {
          allPassed = false;
          if (gate.blockOnFailure) {
            blockers.push(name);
          }
          
          logger[gate.severity === 'critical' ? 'error' : 'warn'](
            `Safety gate failed: ${name}`,
            { gate: gate.name, severity: gate.severity }
          );
        } else {
          logger.info(`Safety gate passed: ${name}`);
        }
      } catch (error) {
        const result: SafetyGateResult = {
          gate,
          passed: false,
          timestamp: new Date(),
          message: `Safety gate '${name}' error: ${(error as Error).message}`,
          context: { error: (error as Error).message }
        };

        results.push(result);
        allPassed = false;
        
        if (gate.blockOnFailure) {
          blockers.push(name);
        }

        logger.error(`Safety gate error: ${name}`, undefined, {
          error: (error as Error).message
        });
      }
    }

    return {
      passed: allPassed && blockers.length === 0,
      results,
      blockers
    };
  }

  /**
   * Validate data using a named validator
   */
  public async validate(
    validatorName: string,
    data: any
  ): Promise<ValidationResult> {
    const validator = this.customValidators.get(validatorName);
    
    if (!validator) {
      return {
        isValid: false,
        errors: [{
          field: 'validator',
          value: validatorName,
          expected: 'valid validator name',
          actual: validatorName,
          message: `Validator '${validatorName}' not found`
        }],
        warnings: [],
        stats: {
          itemsValidated: 0,
          itemsPassed: 0,
          itemsFailed: 1,
          validationTimeMs: 0
        }
      };
    }

    try {
      const result = await validator(data);
      this.validationHistory.push(result);
      
      if (!result.isValid) {
        logger.warn('Validation failed', {
          validator: validatorName,
          errors: result.errors.length,
          warnings: result.warnings.length
        });
      }

      return result;
    } catch (error) {
      const result: ValidationResult = {
        isValid: false,
        errors: [{
          field: 'unknown',
          value: data,
          expected: 'valid data',
          actual: 'error',
          message: (error as Error).message
        }],
        warnings: [],
        stats: {
          itemsValidated: 1,
          itemsPassed: 0,
          itemsFailed: 1,
          validationTimeMs: 0
        }
      };

      this.validationHistory.push(result);
      logger.error('Validation error', undefined, {
        validator: validatorName,
        error: (error as Error).message
      });

      return result;
    }
  }

  /**
   * Validate batch of items
   */
  public async validateBatch<T>(
    validatorName: string,
    items: T[]
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const result = await this.validate(validatorName, items[i]);
      
      if (result.isValid) {
        passed++;
      } else {
        failed++;
        // Prefix errors with item index
        for (const error of result.errors) {
          errors.push({
            ...error,
            field: `[${i}].${error.field}`
          });
        }
        for (const warning of result.warnings) {
          warnings.push({
            ...warning,
            field: `[${i}].${warning.field}`
          });
        }
      }

      // In strict mode, fail fast
      if (!result.isValid && isStrictValidation()) {
        break;
      }
    }

    return {
      isValid: failed === 0,
      errors,
      warnings,
      stats: {
        itemsValidated: items.length,
        itemsPassed: passed,
        itemsFailed: failed,
        validationTimeMs: Date.now() - startTime
      }
    };
  }

  /**
   * Compare two data sets for consistency
   */
  public async compareDataSets(
    source: any[],
    target: any[],
    keyField: string = 'id'
  ): Promise<{
    consistent: boolean;
    missing: any[];
    extra: any[];
    different: Array<{ key: string; source: any; target: any }>;
  }> {
    const sourceMap = new Map(source.map(item => [item[keyField], item]));
    const targetMap = new Map(target.map(item => [item[keyField], item]));
    
    const missing: any[] = [];
    const extra: any[] = [];
    const different: Array<{ key: string; source: any; target: any }> = [];

    // Check for missing items in target
    for (const [key, item] of sourceMap) {
      if (!targetMap.has(key)) {
        missing.push(item);
      } else {
        // Check for differences
        const targetItem = targetMap.get(key);
        if (JSON.stringify(item) !== JSON.stringify(targetItem)) {
          different.push({ key, source: item, target: targetItem });
        }
      }
    }

    // Check for extra items in target
    for (const [key, item] of targetMap) {
      if (!sourceMap.has(key)) {
        extra.push(item);
      }
    }

    const consistent = missing.length === 0 && extra.length === 0 && different.length === 0;

    if (!consistent) {
      logger.warn('Data set comparison found inconsistencies', {
        missing: missing.length,
        extra: extra.length,
        different: different.length
      });
    }

    return {
      consistent,
      missing,
      extra,
      different
    };
  }

  /**
   * Validate migration integrity
   */
  public async validateMigrationIntegrity(
    sourceData: any[],
    targetData: any[],
    config?: {
      allowDataLoss?: boolean;
      allowDuplicates?: boolean;
      validateContent?: boolean;
    }
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Compare data sets
    const comparison = await this.compareDataSets(sourceData, targetData);

    // Check for data loss
    if (!config?.allowDataLoss && comparison.missing.length > 0) {
      errors.push({
        field: 'migration',
        value: comparison.missing,
        expected: 'no data loss',
        actual: `${comparison.missing.length} items missing`,
        message: `Data loss detected: ${comparison.missing.length} items missing in target`
      });
    }

    // Check for duplicates
    if (!config?.allowDuplicates) {
      const targetIds = targetData.map(item => item.id || item);
      const duplicates = targetIds.filter((id, index) => targetIds.indexOf(id) !== index);
      
      if (duplicates.length > 0) {
        errors.push({
          field: 'migration',
          value: duplicates,
          expected: 'no duplicates',
          actual: `${duplicates.length} duplicates`,
          message: `Duplicates detected: ${duplicates.length} duplicate items in target`
        });
      }
    }

    // Check for unexpected items
    if (comparison.extra.length > 0) {
      warnings.push({
        field: 'migration',
        message: `${comparison.extra.length} unexpected items found in target`,
        suggestion: 'Review and remove unexpected items if necessary'
      });
    }

    // Content validation
    if (config?.validateContent && comparison.different.length > 0) {
      for (const diff of comparison.different) {
        warnings.push({
          field: `item.${diff.key}`,
          message: 'Content differs between source and target',
          suggestion: 'Verify content integrity'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      stats: {
        itemsValidated: sourceData.length + targetData.length,
        itemsPassed: errors.length === 0 ? sourceData.length : 0,
        itemsFailed: errors.length > 0 ? sourceData.length : 0,
        validationTimeMs: Date.now() - startTime
      }
    };
  }

  /**
   * Get validation history
   */
  public getValidationHistory(limit?: number): ValidationResult[] {
    if (limit) {
      return this.validationHistory.slice(-limit);
    }
    return [...this.validationHistory];
  }

  /**
   * Clear validation history
   */
  public clearValidationHistory(): void {
    this.validationHistory = [];
  }

  /**
   * Get validation statistics
   */
  public getValidationStats(): {
    totalValidations: number;
    passed: number;
    failed: number;
    successRate: number;
    avgValidationTime: number;
  } {
    const total = this.validationHistory.length;
    const passed = this.validationHistory.filter(r => r.isValid).length;
    const failed = total - passed;
    const successRate = total > 0 ? (passed / total) * 100 : 0;
    const avgTime = total > 0
      ? this.validationHistory.reduce((sum, r) => sum + r.stats.validationTimeMs, 0) / total
      : 0;

    return {
      totalValidations: total,
      passed,
      failed,
      successRate: Math.round(successRate * 100) / 100,
      avgValidationTime: Math.round(avgTime)
    };
  }

  /**
   * Export state for snapshots
   */
  public exportState(): Record<string, unknown> {
    return {
      validationHistory: this.validationHistory.slice(-10),
      stats: this.getValidationStats()
    };
  }

  /**
   * Import state from snapshot
   */
  public importState(state: Record<string, unknown>): void {
    if (state.validationHistory && Array.isArray(state.validationHistory)) {
      this.validationHistory = state.validationHistory as ValidationResult[];
    }
  }
}

// Export singleton instance getter
export const getValidationFramework = () => ValidationFramework.getInstance();