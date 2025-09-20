/**
 * @fileoverview Safety Infrastructure Central Export
 * Provides unified access to all safety components for DriveMind data migration
 * Complies with ALPHA-CODENAME v1.8 and Zero Loss Guarantee requirements
 */

// Core safety components
export * from './data-source-manager';
export * from './feature-flags';
export * from './rollback-manager';
export * from './migration-state';
export * from './performance-monitor';
export * from './validation-framework';
export * from './safety-controller';
export * from './types';

// Re-export the main controller for convenience
export { SafetyController as default } from './safety-controller';

// Version and compliance metadata
export const SAFETY_VERSION = '1.0.0';
export const COMPLIANCE = {
  standard: 'ALPHA-CODENAME v1.8',
  zeroLossGuarantee: true,
  rollbackTime: '<5 min',
  auditCompliant: true
} as const;