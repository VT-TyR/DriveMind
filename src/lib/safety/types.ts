/**
 * @fileoverview Type definitions for the safety infrastructure
 * Defines all shared types used across safety components
 */

import { z } from 'zod';

// Data source types
export type DataSourceType = 'mock' | 'firebase' | 'hybrid';

export interface DataSourceConfig {
  type: DataSourceType;
  priority: number;
  fallbackEnabled: boolean;
  maxRetries: number;
  timeoutMs: number;
}

// Migration state
export type MigrationPhase = 
  | 'not_started'
  | 'preparing'
  | 'validation'
  | 'migration'
  | 'verification'
  | 'rollback'
  | 'completed'
  | 'failed';

export interface MigrationState {
  id: string;
  phase: MigrationPhase;
  startedAt: Date | null;
  completedAt: Date | null;
  progress: {
    current: number;
    total: number;
    percentage: number;
    estimatedTimeRemaining: number;
  };
  stats: {
    filesProcessed: number;
    filesTotal: number;
    errorsCount: number;
    warningsCount: number;
    bytesProcessed: number;
    bytesTotal: number;
  };
  checkpoints: MigrationCheckpoint[];
  errors: MigrationError[];
  rollbackAvailable: boolean;
}

export interface MigrationCheckpoint {
  id: string;
  phase: MigrationPhase;
  timestamp: Date;
  state: Record<string, unknown>;
  canRollbackTo: boolean;
}

export interface MigrationError {
  timestamp: Date;
  phase: MigrationPhase;
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  context?: Record<string, unknown>;
}

// Performance metrics
export interface PerformanceMetrics {
  timestamp: Date;
  operations: {
    reads: number;
    writes: number;
    deletes: number;
    updates: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  throughput: {
    bytesPerSecond: number;
    operationsPerSecond: number;
  };
  resources: {
    cpuUsage: number;
    memoryUsageMB: number;
    networkBandwidthKBps: number;
  };
  errors: {
    count: number;
    rate: number;
  };
}

// Validation results
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: {
    itemsValidated: number;
    itemsPassed: number;
    itemsFailed: number;
    validationTimeMs: number;
  };
}

export interface ValidationError {
  field: string;
  value: unknown;
  expected: string;
  actual: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// Rollback types
export interface RollbackSnapshot {
  id: string;
  createdAt: Date;
  phase: MigrationPhase;
  dataSource: DataSourceType;
  state: {
    featureFlags: Record<string, boolean>;
    migrationState: MigrationState;
    dataSnapshot: Record<string, unknown>;
  };
  metadata: {
    version: string;
    size: number;
    checksum: string;
  };
}

export interface RollbackPlan {
  snapshotId: string;
  estimatedDuration: number;
  steps: RollbackStep[];
  validationRequired: boolean;
}

export interface RollbackStep {
  order: number;
  action: string;
  target: string;
  estimatedDuration: number;
  critical: boolean;
  rollbackOnFailure: boolean;
}

// Safety gates
export interface SafetyGate {
  name: string;
  description: string;
  condition: () => Promise<boolean>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  blockOnFailure: boolean;
}

export interface SafetyGateResult {
  gate: SafetyGate;
  passed: boolean;
  timestamp: Date;
  message?: string;
  context?: Record<string, unknown>;
}

// Feature flag definitions
export interface FeatureFlag {
  key: string;
  value: boolean;
  description: string;
  defaultValue: boolean;
  requiresRestart: boolean;
  dependencies: string[];
}

// Event types for monitoring
export interface SafetyEvent {
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  action: string;
  message: string;
  context?: Record<string, unknown>;
  stackTrace?: string;
}

// Schemas for validation
export const DataSourceConfigSchema = z.object({
  type: z.enum(['mock', 'firebase', 'hybrid']),
  priority: z.number().min(0).max(100),
  fallbackEnabled: z.boolean(),
  maxRetries: z.number().min(0).max(10),
  timeoutMs: z.number().min(100).max(60000)
});

export const MigrationStateSchema = z.object({
  id: z.string(),
  phase: z.enum([
    'not_started',
    'preparing',
    'validation',
    'migration',
    'verification',
    'rollback',
    'completed',
    'failed'
  ]),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  progress: z.object({
    current: z.number(),
    total: z.number(),
    percentage: z.number(),
    estimatedTimeRemaining: z.number()
  }),
  stats: z.object({
    filesProcessed: z.number(),
    filesTotal: z.number(),
    errorsCount: z.number(),
    warningsCount: z.number(),
    bytesProcessed: z.number(),
    bytesTotal: z.number()
  }),
  checkpoints: z.array(z.any()),
  errors: z.array(z.any()),
  rollbackAvailable: z.boolean()
});

// Audit log types
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  component: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata: {
    ip?: string;
    userAgent?: string;
    sessionId?: string;
  };
  compliance: {
    standard: 'ALPHA-CODENAME v1.8';
    verified: boolean;
  };
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  components: {
    dataSource: ComponentHealth;
    migration: ComponentHealth;
    rollback: ComponentHealth;
    monitoring: ComponentHealth;
    validation: ComponentHealth;
  };
  metrics: {
    uptime: number;
    lastError?: Date;
    errorRate: number;
  };
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck: Date;
  details?: Record<string, unknown>;
}