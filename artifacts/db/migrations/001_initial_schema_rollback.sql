-- Migration Rollback: Initial Schema Setup
-- Version: 001
-- Description: Rollback initial DriveMind database schema
-- Date: 2025-09-12
-- Author: Database Engineer Agent
-- Standards: ALPHA-CODENAME v1.4
-- 
-- CAUTION: This rollback will DELETE ALL DATA in the database
-- Only use this for development/testing environments

-- =============================================================================
-- ROLLBACK SAFETY CHECKS
-- =============================================================================

-- Verify this is not a production environment
-- This check should be implemented at the application level
-- DO NOT EXECUTE IN PRODUCTION

-- Log rollback initiation
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
    'migration_rollback_initiated',
    'schema_migrations',
    '001_initial_schema',
    {
        'migration_version': '001_initial_schema',
        'rollback_reason': 'manual_rollback',
        'warning': 'all_data_will_be_lost'
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY), -- Short retention for rollback logs
    NOW(),
    NOW()
);

-- =============================================================================
-- BACKUP CRITICAL DATA (if needed)
-- =============================================================================

-- If this rollback is being performed with data preservation needs,
-- uncomment and modify these backup operations:

-- CREATE TEMPORARY TABLE users_backup AS SELECT * FROM users WHERE deleted_at IS NULL;
-- CREATE TEMPORARY TABLE metrics_backup AS SELECT * FROM system_metrics;
-- CREATE TEMPORARY TABLE audit_backup AS SELECT * FROM audit_logs WHERE event_timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY);

-- =============================================================================
-- DROP INDEXES FIRST
-- =============================================================================

-- Step 1: Drop all indexes created in the initial migration
-- This must be done before dropping collections

DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_active;
DROP INDEX IF EXISTS idx_metrics_date;
DROP INDEX IF EXISTS idx_audit_user_activity;
DROP INDEX IF EXISTS idx_rate_limits_user_enforcement;
DROP INDEX IF EXISTS idx_content_hashes_lookup;

-- =============================================================================
-- DELETE SUBCOLLECTION DATA
-- =============================================================================

-- Step 2: Delete all subcollection data
-- In Firestore, subcollections must be deleted explicitly

BEGIN TRANSACTION;

-- Delete all user secrets (contains OAuth tokens)
-- This is critical for security - ensure all tokens are invalidated
DELETE FROM users/{uid}/secrets WHERE secret_type IS NOT NULL;

-- Delete all user inventory data
DELETE FROM users/{uid}/inventory WHERE google_file_id IS NOT NULL;

-- Delete all user scan data
DELETE FROM users/{uid}/scans WHERE scan_id IS NOT NULL;

-- Delete all user duplicate groups
DELETE FROM users/{uid}/duplicate_groups WHERE group_id IS NOT NULL;

-- Delete all user organization rules
DELETE FROM users/{uid}/organization_rules WHERE rule_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- DELETE COLLECTION DATA
-- =============================================================================

-- Step 3: Delete all documents from main collections

BEGIN TRANSACTION;

-- Delete rate limiting data
DELETE FROM rate_limits WHERE limit_key IS NOT NULL;

-- Delete content hash data
DELETE FROM file_content_hashes WHERE content_hash IS NOT NULL;

-- Delete retention policy data
DELETE FROM data_retention_policies WHERE collection_name IS NOT NULL;

-- Delete system metrics (keep recent for analysis if needed)
DELETE FROM system_metrics WHERE metric_date < DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY);

-- Delete all users (this will cascade to subcollections in Firestore)
DELETE FROM users WHERE firebase_uid IS NOT NULL;

COMMIT;

-- =============================================================================
-- UPDATE MIGRATION STATUS
-- =============================================================================

-- Step 4: Mark migration as rolled back

BEGIN TRANSACTION;

UPDATE schema_migrations 
SET 
    status = 'rolled_back',
    completed_at = NOW(),
    updated_at = NOW()
WHERE migration_id = '001_initial_schema';

-- Update schema version to indicate rollback
UPDATE schema_version 
SET 
    version = '0.0.0',
    last_migration_id = '000_none',
    updated_at = NOW(),
    updated_by = 'rollback_system'
WHERE version IS NOT NULL;

COMMIT;

-- =============================================================================
-- LOG ROLLBACK COMPLETION
-- =============================================================================

-- Step 5: Create final audit log entry
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
    'migration_rollback_completed',
    'schema_migrations',
    '001_initial_schema',
    {
        'migration_version': '001_initial_schema',
        'rollback_status': 'completed',
        'collections_affected': [
            'users',
            'users/{uid}/secrets',
            'users/{uid}/inventory', 
            'users/{uid}/scans',
            'users/{uid}/duplicate_groups',
            'users/{uid}/organization_rules',
            'system_metrics',
            'rate_limits',
            'file_content_hashes',
            'data_retention_policies'
        ],
        'data_retention': 'most_data_deleted',
        'schema_version_reset': '0.0.0'
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY), -- Long retention for rollback records
    NOW(),
    NOW()
);

-- =============================================================================
-- OPTIONAL: COMPLETE DATABASE RESET
-- =============================================================================

-- Step 6: Uncomment the following section if complete database reset is needed
-- WARNING: This will delete ALL data including audit logs and migration history

-- BEGIN TRANSACTION;
-- DELETE FROM audit_logs WHERE event_id IS NOT NULL;
-- DELETE FROM schema_migrations WHERE migration_id IS NOT NULL;
-- DELETE FROM schema_version WHERE version IS NOT NULL;
-- COMMIT;

-- =============================================================================
-- POST-ROLLBACK VERIFICATION
-- =============================================================================

-- Step 7: Verify rollback completion

-- Check that core collections are empty (or don't exist)
SELECT 'users' as collection_name, COUNT(*) as document_count FROM users;
SELECT 'system_metrics' as collection_name, COUNT(*) as document_count FROM system_metrics;
SELECT 'rate_limits' as collection_name, COUNT(*) as document_count FROM rate_limits;
SELECT 'file_content_hashes' as collection_name, COUNT(*) as document_count FROM file_content_hashes;

-- Verify schema version reset
SELECT version, last_migration_id, updated_at FROM schema_version;

-- Check remaining audit log entries
SELECT COUNT(*) as remaining_audit_logs FROM audit_logs;

-- Check migration status
SELECT migration_id, status, completed_at FROM schema_migrations WHERE migration_id = '001_initial_schema';

-- =============================================================================
-- ROLLBACK COMPLETION NOTES
-- =============================================================================

-- Rollback 001_initial_schema completed
-- 
-- What was rolled back:
-- - All user accounts and associated data
-- - OAuth tokens and authentication data
-- - File inventory and analysis data
-- - Background scan history
-- - Duplicate detection results
-- - Organization rules
-- - Most system metrics
-- - Rate limiting data
-- - Content hashes for deduplication
-- - Data retention policies
-- - Database indexes
--
-- What was preserved:
-- - Migration history (unless complete reset was performed)
-- - Recent audit logs for compliance
-- - Current day system metrics for monitoring
--
-- To re-run the initial migration:
-- Execute: 001_initial_schema.sql
--
-- Next steps after rollback:
-- 1. Verify application configuration
-- 2. Re-run migration if needed
-- 3. Restore any backed up data
-- 4. Notify stakeholders of data loss

-- =============================================================================
-- SECURITY NOTES
-- =============================================================================

-- Security considerations after rollback:
-- 1. All OAuth tokens have been deleted - users must re-authenticate
-- 2. All file access permissions have been reset
-- 3. All rate limiting counters have been cleared
-- 4. All audit trails older than recent activity have been preserved
-- 5. Content hashes for duplicate detection have been cleared
--
-- Recommended actions:
-- 1. Invalidate all user sessions
-- 2. Clear any cached authentication data
-- 3. Reset rate limiting middleware
-- 4. Notify users of required re-authentication
-- 5. Monitor for unusual activity post-rollback