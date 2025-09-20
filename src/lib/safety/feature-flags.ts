/**
 * @fileoverview Enhanced Feature Flag System for Data Migration
 * Provides centralized control over migration behavior and safety gates
 * Required flags as per Safety Coordinator requirements
 */

import { FeatureFlag } from './types';
import { logger } from '@/lib/logger';

// Feature flag keys as constants for type safety
export const FEATURE_FLAGS = {
  // Data source flags
  DATA_SOURCE_MOCK: 'FEATURE_DATA_SOURCE_MOCK',
  DATA_SOURCE_FIREBASE: 'FEATURE_DATA_SOURCE_FIREBASE',
  
  // Migration control flags
  MIGRATION_PHASE: 'FEATURE_MIGRATION_PHASE',
  MIGRATION_ENABLED: 'FEATURE_MIGRATION_ENABLED',
  MIGRATION_DRY_RUN: 'FEATURE_MIGRATION_DRY_RUN',
  
  // Safety flags
  FALLBACK_ENABLED: 'FEATURE_FALLBACK_ENABLED',
  AUTO_ROLLBACK: 'FEATURE_AUTO_ROLLBACK',
  VALIDATION_STRICT: 'FEATURE_VALIDATION_STRICT',
  
  // Performance flags
  PERFORMANCE_MONITORING: 'FEATURE_PERFORMANCE_MONITORING',
  RATE_LIMITING: 'FEATURE_RATE_LIMITING',
  BATCH_PROCESSING: 'FEATURE_BATCH_PROCESSING',
  
  // Debug flags
  DEBUG_MODE: 'FEATURE_DEBUG_MODE',
  VERBOSE_LOGGING: 'FEATURE_VERBOSE_LOGGING',
  
  // Legacy compatibility
  FILE_OPS_ENABLED: 'FEATURE_FILE_OPS_ENABLED'
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Feature flag definitions with metadata
 */
const featureFlagDefinitions: Map<string, FeatureFlag> = new Map([
  [FEATURE_FLAGS.DATA_SOURCE_MOCK, {
    key: FEATURE_FLAGS.DATA_SOURCE_MOCK,
    value: false,
    description: 'Enable mock data source for testing',
    defaultValue: false,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.DATA_SOURCE_FIREBASE, {
    key: FEATURE_FLAGS.DATA_SOURCE_FIREBASE,
    value: true,
    description: 'Enable Firebase data source for production',
    defaultValue: true,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.MIGRATION_PHASE, {
    key: FEATURE_FLAGS.MIGRATION_PHASE,
    value: false,
    description: 'Current migration phase control',
    defaultValue: false,
    requiresRestart: false,
    dependencies: [FEATURE_FLAGS.MIGRATION_ENABLED]
  }],
  [FEATURE_FLAGS.MIGRATION_ENABLED, {
    key: FEATURE_FLAGS.MIGRATION_ENABLED,
    value: false,
    description: 'Master switch for migration process',
    defaultValue: false,
    requiresRestart: true,
    dependencies: []
  }],
  [FEATURE_FLAGS.MIGRATION_DRY_RUN, {
    key: FEATURE_FLAGS.MIGRATION_DRY_RUN,
    value: true,
    description: 'Run migration in dry-run mode without actual changes',
    defaultValue: true,
    requiresRestart: false,
    dependencies: [FEATURE_FLAGS.MIGRATION_ENABLED]
  }],
  [FEATURE_FLAGS.FALLBACK_ENABLED, {
    key: FEATURE_FLAGS.FALLBACK_ENABLED,
    value: true,
    description: 'Enable automatic fallback to previous data source on error',
    defaultValue: true,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.AUTO_ROLLBACK, {
    key: FEATURE_FLAGS.AUTO_ROLLBACK,
    value: true,
    description: 'Automatically rollback on critical errors',
    defaultValue: true,
    requiresRestart: false,
    dependencies: [FEATURE_FLAGS.FALLBACK_ENABLED]
  }],
  [FEATURE_FLAGS.VALIDATION_STRICT, {
    key: FEATURE_FLAGS.VALIDATION_STRICT,
    value: true,
    description: 'Enable strict validation mode',
    defaultValue: true,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.PERFORMANCE_MONITORING, {
    key: FEATURE_FLAGS.PERFORMANCE_MONITORING,
    value: true,
    description: 'Enable performance metric collection',
    defaultValue: true,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.RATE_LIMITING, {
    key: FEATURE_FLAGS.RATE_LIMITING,
    value: true,
    description: 'Enable rate limiting for API calls',
    defaultValue: true,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.BATCH_PROCESSING, {
    key: FEATURE_FLAGS.BATCH_PROCESSING,
    value: true,
    description: 'Enable batch processing for bulk operations',
    defaultValue: true,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.DEBUG_MODE, {
    key: FEATURE_FLAGS.DEBUG_MODE,
    value: process.env.NODE_ENV === 'development',
    description: 'Enable debug mode with additional logging',
    defaultValue: false,
    requiresRestart: false,
    dependencies: []
  }],
  [FEATURE_FLAGS.VERBOSE_LOGGING, {
    key: FEATURE_FLAGS.VERBOSE_LOGGING,
    value: process.env.NODE_ENV === 'development',
    description: 'Enable verbose logging for debugging',
    defaultValue: false,
    requiresRestart: false,
    dependencies: [FEATURE_FLAGS.DEBUG_MODE]
  }],
  [FEATURE_FLAGS.FILE_OPS_ENABLED, {
    key: FEATURE_FLAGS.FILE_OPS_ENABLED,
    value: process.env.FEATURE_FILE_OPS_ENABLED === 'true',
    description: 'Enable file operations (legacy)',
    defaultValue: false,
    requiresRestart: true,
    dependencies: []
  }]
]);

/**
 * Runtime feature flag overrides (for testing and dynamic control)
 */
const runtimeOverrides: Map<string, boolean> = new Map();

/**
 * Get a feature flag value
 */
export function getFeatureFlag(key: string): boolean {
  // Check runtime override first
  if (runtimeOverrides.has(key)) {
    return runtimeOverrides.get(key)!;
  }

  // Check environment variable
  const envValue = process.env[key];
  if (envValue !== undefined) {
    return envValue === 'true';
  }

  // Check flag definition
  const flag = featureFlagDefinitions.get(key);
  if (flag) {
    return flag.value;
  }

  // Default to false for unknown flags
  logger.warn('Unknown feature flag requested', { key });
  return false;
}

/**
 * Set a feature flag value (runtime override)
 */
export function setFeatureFlag(key: string, value: boolean): void {
  const flag = featureFlagDefinitions.get(key);
  
  if (flag && flag.requiresRestart && runtimeOverrides.has(key)) {
    logger.warn('Feature flag requires restart to take effect', { key, value });
  }

  runtimeOverrides.set(key, value);
  logger.info('Feature flag updated', { key, value, source: 'runtime' });

  // Check dependencies
  if (flag && value && flag.dependencies.length > 0) {
    for (const dep of flag.dependencies) {
      if (!getFeatureFlag(dep)) {
        logger.warn('Feature flag dependency not enabled', { key, dependency: dep });
      }
    }
  }
}

/**
 * Reset all runtime overrides
 */
export function resetFeatureFlags(): void {
  runtimeOverrides.clear();
  logger.info('Feature flags reset to defaults');
}

/**
 * Get all feature flags and their current values
 */
export function getAllFeatureFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  
  for (const [key] of featureFlagDefinitions) {
    flags[key] = getFeatureFlag(key);
  }
  
  return flags;
}

/**
 * Get feature flag metadata
 */
export function getFeatureFlagMetadata(key: string): FeatureFlag | undefined {
  return featureFlagDefinitions.get(key);
}

/**
 * Check if migration is currently active
 */
export function isMigrationActive(): boolean {
  return getFeatureFlag(FEATURE_FLAGS.MIGRATION_ENABLED) &&
         getFeatureFlag(FEATURE_FLAGS.MIGRATION_PHASE);
}

/**
 * Check which data source is currently active
 */
export function getActiveDataSource(): 'mock' | 'firebase' | 'hybrid' {
  const mockEnabled = getFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_MOCK);
  const firebaseEnabled = getFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_FIREBASE);
  
  if (mockEnabled && firebaseEnabled) {
    return 'hybrid';
  } else if (mockEnabled) {
    return 'mock';
  } else {
    return 'firebase';
  }
}

/**
 * Check if fallback is enabled
 */
export function isFallbackEnabled(): boolean {
  return getFeatureFlag(FEATURE_FLAGS.FALLBACK_ENABLED);
}

/**
 * Check if strict validation is enabled
 */
export function isStrictValidation(): boolean {
  return getFeatureFlag(FEATURE_FLAGS.VALIDATION_STRICT);
}

/**
 * Export feature flag state for snapshots
 */
export function exportFeatureFlagState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  
  // Export all flags including runtime overrides
  for (const [key] of featureFlagDefinitions) {
    state[key] = getFeatureFlag(key);
  }
  
  // Include any runtime-only overrides
  for (const [key, value] of runtimeOverrides) {
    if (!state.hasOwnProperty(key)) {
      state[key] = value;
    }
  }
  
  return state;
}

/**
 * Import feature flag state from snapshot
 */
export function importFeatureFlagState(state: Record<string, boolean>): void {
  runtimeOverrides.clear();
  
  for (const [key, value] of Object.entries(state)) {
    const flag = featureFlagDefinitions.get(key);
    
    if (flag) {
      // Only set as override if different from default
      if (flag.defaultValue !== value) {
        runtimeOverrides.set(key, value);
      }
    } else {
      // Unknown flag, add as runtime override
      runtimeOverrides.set(key, value);
    }
  }
  
  logger.info('Feature flag state imported', { 
    flagCount: Object.keys(state).length,
    overrideCount: runtimeOverrides.size 
  });
}

/**
 * Validate feature flag dependencies
 */
export function validateFeatureFlagDependencies(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [key, flag] of featureFlagDefinitions) {
    if (getFeatureFlag(key) && flag.dependencies.length > 0) {
      for (const dep of flag.dependencies) {
        if (!getFeatureFlag(dep)) {
          errors.push(`Flag ${key} requires ${dep} to be enabled`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Helper functions for backward compatibility
export function isFileOpsEnabledServer(): boolean {
  return getFeatureFlag(FEATURE_FLAGS.FILE_OPS_ENABLED);
}

export function isFileOpsEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_FILE_OPS === 'true';
}