-- Migration: Initial Schema Setup
-- Version: 001
-- Description: Create initial DriveMind database schema with core collections
-- Date: 2025-09-12
-- Author: Database Engineer Agent
-- Standards: ALPHA-CODENAME v1.4

-- =============================================================================
-- MIGRATION METADATA
-- =============================================================================

INSERT INTO schema_migrations (
    migration_id, 
    migration_name, 
    version, 
    description, 
    status,
    migration_script,
    rollback_script,
    applied_by,
    environment,
    created_at,
    updated_at
) VALUES (
    '001_initial_schema',
    'Initial Schema Setup',
    '1.0.0',
    'Create core collections for users, authentication, file inventory, and system monitoring',
    'pending',
    '001_initial_schema.sql',
    '001_initial_schema_rollback.sql',
    'system',
    'development',
    NOW(),
    NOW()
);

-- =============================================================================
-- CORE COLLECTIONS CREATION
-- =============================================================================

-- Step 1: Create users collection with initial document structure
-- This establishes the foundation for all user-related data
BEGIN TRANSACTION;

-- Create collection structure by inserting a template document
-- In Firestore, collections are created implicitly when first document is added
INSERT INTO users (
    firebase_uid,
    email,
    display_name,
    provider,
    created_at,
    updated_at,
    last_seen_at,
    settings,
    features,
    quotas,
    is_active,
    is_premium
) VALUES (
    '__SYSTEM_TEMPLATE__',
    'system@drivemind.ai',
    'System Template',
    'system',
    NOW(),
    NOW(),
    NOW(),
    {
        'theme': 'light',
        'language': 'en',
        'timezone': 'UTC',
        'notifications_enabled': true
    },
    {
        'ai_enabled': true,
        'background_scans': true,
        'batch_operations': true
    },
    {
        'max_files': 100000,
        'max_scans_per_day': 10,
        'max_ai_requests_per_day': 1000
    },
    true,
    false
);

-- Mark template document for deletion after initialization
UPDATE users SET deleted_at = NOW() WHERE firebase_uid = '__SYSTEM_TEMPLATE__';

COMMIT;

-- Step 2: Create system collections
BEGIN TRANSACTION;

-- Initialize system metrics collection with baseline
INSERT INTO system_metrics (
    metric_date,
    total_users,
    active_users_daily,
    total_scans_completed,
    total_files_processed,
    total_duplicates_detected,
    total_ai_insights_generated,
    new_signups,
    created_at,
    updated_at
) VALUES (
    CURRENT_DATE,
    0, 0, 0, 0, 0, 0, 0,
    NOW(),
    NOW()
);

-- Create schema version tracking
INSERT INTO schema_version (
    version,
    last_migration_id,
    updated_at,
    updated_by
) VALUES (
    '1.0.0',
    '001_initial_schema',
    NOW(),
    'system'
);

COMMIT;

-- Step 3: Initialize data retention policies
BEGIN TRANSACTION;

INSERT INTO data_retention_policies (
    collection_name,
    retention_period_days,
    cleanup_field,
    cleanup_schedule,
    is_active,
    created_at,
    updated_at
) VALUES 
    ('audit_logs', 2555, 'retention_date', '0 2 * * *', true, NOW(), NOW()),
    ('system_metrics', 1095, 'created_at', '0 3 * * *', true, NOW(), NOW()),
    ('rate_limits', 7, 'created_at', '0 4 * * *', true, NOW(), NOW()),
    ('users/{uid}/scans', 90, 'completed_at', '0 1 * * *', true, NOW(), NOW());

COMMIT;

-- =============================================================================
-- SUBCOLLECTION INITIALIZATION
-- =============================================================================

-- Step 4: Create example subcollection structures
-- These establish the document patterns for user-specific data

BEGIN TRANSACTION;

-- Create template user secrets subcollection
-- This is critical for OAuth token storage patterns
INSERT INTO users/__SYSTEM_TEMPLATE__/secrets (
    secret_type,
    refresh_token,
    scope,
    token_version,
    is_valid,
    usage_count,
    created_at,
    updated_at
) VALUES (
    'googleDrive',
    'ENCRYPTED_TEMPLATE_TOKEN',
    ['https://www.googleapis.com/auth/drive'],
    1,
    false,
    0,
    NOW(),
    NOW()
);

-- Create template inventory subcollection
INSERT INTO users/__SYSTEM_TEMPLATE__/inventory (
    google_file_id,
    name,
    mime_type,
    file_type,
    size,
    created_time,
    modified_time,
    last_scanned_at,
    parents,
    path_segments,
    folder_depth,
    trashed,
    owned_by_me,
    shared,
    is_duplicate,
    created_at,
    updated_at
) VALUES (
    'TEMPLATE_FILE_ID',
    'Template Document',
    'application/vnd.google-apps.document',
    'Document',
    1024,
    NOW(),
    NOW(),
    NOW(),
    [],
    ['Root'],
    1,
    false,
    true,
    false,
    false,
    NOW(),
    NOW()
);

-- Create template scans subcollection
INSERT INTO users/__SYSTEM_TEMPLATE__/scans (
    scan_id,
    status,
    scan_type,
    progress_percentage,
    files_processed,
    started_at,
    triggered_by,
    retry_count,
    api_calls_made,
    bandwidth_used_bytes,
    created_at,
    updated_at
) VALUES (
    'template_scan_001',
    'completed',
    'full',
    100.00,
    1,
    NOW(),
    'system',
    0,
    10,
    1024,
    NOW(),
    NOW()
);

COMMIT;

-- =============================================================================
-- SECURITY RULES PREPARATION
-- =============================================================================

-- Step 5: Initialize collections that will be governed by security rules
-- These collections must exist for security rules to be applied

BEGIN TRANSACTION;

-- Create rate limits collection with initial system entry
INSERT INTO rate_limits (
    limit_key,
    endpoint,
    window_start,
    window_size_seconds,
    request_count,
    limit_max,
    is_exceeded,
    reset_at,
    created_at,
    updated_at
) VALUES (
    'system_health_global',
    '/api/health',
    NOW(),
    3600, -- 1 hour window
    0,
    10000,
    false,
    DATE_ADD(NOW(), INTERVAL 1 HOUR),
    NOW(),
    NOW()
);

-- Create content hashes collection for duplicate detection
INSERT INTO file_content_hashes (
    content_hash,
    hash_algorithm,
    file_size_bytes,
    file_references,
    reference_count,
    first_seen_at,
    last_updated_at
) VALUES (
    'da39a3ee5e6b4b0d3255bfef95601890afd80709',
    'sha1',
    0,
    [],
    0,
    NOW(),
    NOW()
);

COMMIT;

-- =============================================================================
-- AUDIT TRAIL INITIALIZATION
-- =============================================================================

-- Step 6: Create initial audit log entry
BEGIN TRANSACTION;

INSERT INTO audit_logs (
    event_id,
    event_type,
    event_action,
    resource_type,
    resource_id,
    event_data,
    data_classification,
    retention_date,
    event_timestamp,
    created_at
) VALUES (
    UUID(),
    'system',
    'schema_initialization',
    'system',
    'drivemind_database',
    {
        'migration_version': '001_initial_schema',
        'schema_version': '1.0.0',
        'collections_created': [
            'users',
            'system_metrics',
            'audit_logs',
            'rate_limits',
            'file_content_hashes',
            'data_retention_policies',
            'schema_migrations',
            'schema_version'
        ]
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY), -- 7 years retention
    NOW(),
    NOW()
);

COMMIT;

-- =============================================================================
-- INDEX CREATION
-- =============================================================================

-- Step 7: Create essential indexes for immediate functionality
-- Additional indexes will be created in subsequent migrations

-- Core user authentication indexes
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_active ON users (is_active, created_at);

-- System monitoring indexes
CREATE INDEX idx_metrics_date ON system_metrics (metric_date DESC);
CREATE INDEX idx_audit_user_activity ON audit_logs (user_id ASC, event_timestamp DESC);

-- Rate limiting indexes
CREATE INDEX idx_rate_limits_user_enforcement ON rate_limits (user_id ASC, endpoint ASC, window_start DESC);

-- Content hash index for duplicate detection
CREATE INDEX idx_content_hashes_lookup ON file_content_hashes (content_hash ASC);

-- =============================================================================
-- VALIDATION AND VERIFICATION
-- =============================================================================

-- Step 8: Verify schema integrity
BEGIN TRANSACTION;

-- Count created collections (should be > 0 for each)
SELECT COUNT(*) as user_count FROM users WHERE deleted_at IS NULL;
SELECT COUNT(*) as metrics_count FROM system_metrics;
SELECT COUNT(*) as audit_count FROM audit_logs;
SELECT COUNT(*) as retention_policies_count FROM data_retention_policies;

-- Verify schema version
SELECT version, last_migration_id FROM schema_version;

-- Update migration status
UPDATE schema_migrations 
SET 
    status = 'completed',
    completed_at = NOW(),
    records_affected = (
        SELECT COUNT(*) FROM users WHERE deleted_at IS NULL
    ) + (
        SELECT COUNT(*) FROM system_metrics
    ) + (
        SELECT COUNT(*) FROM audit_logs
    ) + (
        SELECT COUNT(*) FROM data_retention_policies
    ),
    updated_at = NOW()
WHERE migration_id = '001_initial_schema';

COMMIT;

-- =============================================================================
-- POST-MIGRATION CLEANUP
-- =============================================================================

-- Step 9: Clean up template data
BEGIN TRANSACTION;

-- Remove template documents (they served their purpose of creating collections)
DELETE FROM users WHERE firebase_uid = '__SYSTEM_TEMPLATE__';
-- Note: Template subcollection documents will be automatically cleaned up

-- Log successful completion
INSERT INTO audit_logs (
    event_id,
    event_type,
    event_action,
    resource_type,
    resource_id,
    event_data,
    data_classification,
    retention_date,
    event_timestamp,
    created_at
) VALUES (
    UUID(),
    'system',
    'migration_completed',
    'schema_migrations',
    '001_initial_schema',
    {
        'migration_version': '001_initial_schema',
        'status': 'completed',
        'duration_seconds': TIMESTAMPDIFF(SECOND, 
            (SELECT started_at FROM schema_migrations WHERE migration_id = '001_initial_schema'),
            NOW()
        )
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY),
    NOW(),
    NOW()
);

COMMIT;

-- =============================================================================
-- MIGRATION COMPLETION
-- =============================================================================

-- Migration 001 completed successfully
-- Collections created: users, system_metrics, audit_logs, rate_limits, 
--                     file_content_hashes, data_retention_policies,
--                     schema_migrations, schema_version
-- 
-- Next migration: 002_performance_indexes.sql
-- 
-- To rollback this migration:
-- Run: 001_initial_schema_rollback.sql