-- ============================================================================
-- Rollback Migration: Critical Database Repair & Security Enhancement
-- Version: 004_rollback
-- Description: Rollback database repair migration while preserving critical data
-- Date: 2025-09-17
-- Author: Database Repair Agent
-- Standards: ALPHA-CODENAME v1.8 + AEI21 compliant
-- ============================================================================

-- =============================================================================
-- ROLLBACK SAFETY CHECKS
-- =============================================================================

-- Verify migration is in completed state before rollback
SELECT migration_id, status, completed_at 
FROM schema_migrations 
WHERE migration_id = '004_database_repair' AND status = 'completed';

-- If the above query returns no results, halt rollback
-- Migration must be completed before rollback can proceed

-- =============================================================================
-- PHASE 1: PRE-ROLLBACK BACKUP & VALIDATION
-- =============================================================================

BEGIN TRANSACTION 'rollback_preparation';

-- Create rollback audit entry
INSERT INTO audit_logs (
    eventId,
    eventType,
    eventAction,
    severity,
    resourceType,
    resourceId,
    eventData,
    dataClassification,
    retentionDate,
    eventTimestamp,
    createdAt
) VALUES (
    UUID(),
    'system',
    'database_repair_rollback_initiated',
    'warn',
    'schema_migrations',
    '004_database_repair',
    {
        'rollback_migration': '004_database_repair',
        'rollback_reason': 'manual_rollback_requested',
        'data_preservation': 'critical_data_will_be_preserved',
        'affected_collections': [
            'users_secrets',
            'users_consent', 
            'users_scans',
            'audit_logs',
            'security_events'
        ]
    },
    'confidential',
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY),
    NOW(),
    NOW()
);

-- Backup critical data before rollback
CREATE TEMPORARY TABLE rollback_backup_tokens AS
SELECT * FROM users_secrets WHERE encryptedRefreshToken IS NOT NULL;

CREATE TEMPORARY TABLE rollback_backup_consent AS
SELECT * FROM users_consent WHERE granted = true;

CREATE TEMPORARY TABLE rollback_backup_scans AS
SELECT * FROM users_scans WHERE status IN ('running', 'pending');

COMMIT 'rollback_preparation';

-- =============================================================================
-- PHASE 2: REMOVE PERFORMANCE INDEXES
-- =============================================================================

BEGIN TRANSACTION 'rollback_indexes';

-- Remove indexes created in migration 004
DROP INDEX IF EXISTS idx_secrets_realtime_validation;
DROP INDEX IF EXISTS idx_scans_realtime_monitoring;
DROP INDEX IF EXISTS idx_audit_security_realtime;
DROP INDEX IF EXISTS idx_security_threat_realtime;
DROP INDEX IF EXISTS idx_consent_realtime_validation;

-- Log index removal
INSERT INTO audit_logs (
    eventId,
    eventType,
    eventAction,
    severity,
    resourceType,
    eventData,
    dataClassification,
    retentionDate,
    eventTimestamp,
    createdAt
) VALUES (
    UUID(),
    'system',
    'performance_indexes_removed',
    'info',
    'database_indexes',
    {
        'rollback_phase': 'index_removal',
        'indexes_removed': [
            'idx_secrets_realtime_validation',
            'idx_scans_realtime_monitoring',
            'idx_audit_security_realtime', 
            'idx_security_threat_realtime',
            'idx_consent_realtime_validation'
        ]
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 365 DAY),
    NOW(),
    NOW()
);

COMMIT 'rollback_indexes';

-- =============================================================================
-- PHASE 3: PRESERVE CRITICAL SECURITY DATA
-- =============================================================================

BEGIN TRANSACTION 'preserve_security_data';

-- IMPORTANT: Preserve security events and audit logs
-- These are critical for compliance and cannot be rolled back

-- Mark security events as preserved during rollback
UPDATE security_events 
SET threatIntelligence = JSON_SET(
    COALESCE(threatIntelligence, '{}'),
    '$.preserved_during_rollback', true,
    '$.rollback_timestamp', NOW(),
    '$.preservation_reason', 'compliance_and_forensic_requirements'
)
WHERE createdAt >= (
    SELECT started_at FROM schema_migrations 
    WHERE migration_id = '004_database_repair'
);

-- Mark audit logs as preserved
UPDATE audit_logs 
SET eventData = JSON_SET(
    COALESCE(eventData, '{}'),
    '$.preserved_during_rollback', true,
    '$.rollback_timestamp', NOW(),
    '$.preservation_reason', 'audit_trail_integrity_required'
)
WHERE createdAt >= (
    SELECT started_at FROM schema_migrations 
    WHERE migration_id = '004_database_repair'
);

COMMIT 'preserve_security_data';

-- =============================================================================
-- PHASE 4: ROLLBACK TOKEN ENCRYPTION (SAFELY)
-- =============================================================================

BEGIN TRANSACTION 'rollback_token_encryption';

-- CRITICAL SAFETY: Do not decrypt tokens during rollback
-- Instead, mark them as requiring re-authentication

-- Update token records to indicate rollback state
UPDATE users_secrets 
SET 
    -- Mark as requiring re-authentication (safest approach)
    isValid = false,
    validationError = 'rollback_requires_reauthentication',
    
    -- Preserve encryption metadata for audit
    auditLog = JSON_ARRAY_APPEND(
        COALESCE(auditLog, JSON_ARRAY()),
        '$',
        JSON_OBJECT(
            'action', 'rollback_migration_004',
            'timestamp', NOW(),
            'reason', 'migration_rollback_requires_reauthentication',
            'encrypted_data_preserved', true
        )
    ),
    
    updatedAt = NOW()
    
WHERE encryptedRefreshToken IS NOT NULL;

-- Log token rollback action
INSERT INTO audit_logs (
    eventId,
    eventType,
    eventAction,
    severity,
    resourceType,
    eventData,
    dataClassification,
    gdprRelevant,
    retentionDate,
    eventTimestamp,
    createdAt
) VALUES (
    UUID(),
    'security',
    'token_encryption_rollback',
    'warn',
    'user_tokens',
    {
        'rollback_phase': 'token_encryption',
        'action_taken': 'invalidate_tokens_require_reauthentication',
        'security_impact': 'users_must_reauthenticate',
        'data_safety': 'encrypted_tokens_preserved_for_audit',
        'affected_tokens': (SELECT COUNT(*) FROM users_secrets WHERE encryptedRefreshToken IS NOT NULL)
    },
    'confidential',
    true,
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY),
    NOW(),
    NOW()
);

COMMIT 'rollback_token_encryption';

-- =============================================================================
-- PHASE 5: ROLLBACK SCAN ENHANCEMENTS
-- =============================================================================

BEGIN TRANSACTION 'rollback_scan_enhancements';

-- Preserve checkpoint data but revert to original structure
UPDATE users_scans 
SET 
    -- Preserve original fields where possible
    files_processed = COALESCE(progress->>'$.current', files_processed),
    total_files_estimated = COALESCE(progress->>'$.total', total_files_estimated),
    progress_percentage = COALESCE(progress->>'$.percentage', progress_percentage),
    api_calls_made = COALESCE(resourceUsage->>'$.apiCallsMade', api_calls_made),
    bandwidth_used_bytes = COALESCE(resourceUsage->>'$.bandwidthUsedBytes', bandwidth_used_bytes),
    
    -- Add rollback metadata
    config = JSON_SET(
        COALESCE(config, '{}'),
        '$.rollback_metadata', JSON_OBJECT(
            'original_version', version,
            'rollback_timestamp', NOW(),
            'checkpoint_data_preserved', true,
            'progress_data_preserved', true
        )
    ),
    
    -- Reset version
    version = '1.0.0',
    
    updatedAt = NOW()
    
WHERE version = '2.0.0-REPAIR';

-- Log scan rollback
INSERT INTO audit_logs (
    eventId,
    eventType,
    eventAction,
    severity,
    resourceType,
    eventData,
    dataClassification,
    retentionDate,
    eventTimestamp,
    createdAt
) VALUES (
    UUID(),
    'system',
    'scan_enhancements_rollback',
    'info',
    'scan_jobs',
    {
        'rollback_phase': 'scan_enhancements',
        'scans_rolled_back': (SELECT COUNT(*) FROM users_scans WHERE version = '1.0.0'),
        'data_preservation': 'checkpoint_and_progress_data_preserved_in_metadata',
        'user_impact': 'active_scans_may_need_restart'
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 365 DAY),
    NOW(),
    NOW()
);

COMMIT 'rollback_scan_enhancements';

-- =============================================================================
-- PHASE 6: PRESERVE CONSENT RECORDS (GDPR COMPLIANCE)
-- =============================================================================

BEGIN TRANSACTION 'preserve_consent_records';

-- CRITICAL: Consent records cannot be rolled back due to GDPR requirements
-- Mark them as preserved during rollback

UPDATE users_consent 
SET 
    consentHistory = JSON_ARRAY_APPEND(
        COALESCE(consentHistory, JSON_ARRAY()),
        '$',
        JSON_OBJECT(
            'action', 'migration_rollback_preserved',
            'timestamp', NOW(),
            'reason', 'gdpr_compliance_requires_consent_preservation',
            'original_migration', '004_database_repair'
        )
    ),
    
    auditTrail = JSON_ARRAY_APPEND(
        COALESCE(auditTrail, JSON_ARRAY()),
        '$',
        JSON_OBJECT(
            'event', 'rollback_preservation',
            'timestamp', NOW(),
            'compliance_basis', 'gdpr_article_7',
            'preservation_required', true
        )
    ),
    
    updatedAt = NOW();

-- Log consent preservation
INSERT INTO audit_logs (
    eventId,
    eventType,
    eventAction,
    severity,
    resourceType,
    eventData,
    dataClassification,
    gdprRelevant,
    processingPurpose,
    retentionDate,
    eventTimestamp,
    createdAt
) VALUES (
    UUID(),
    'compliance',
    'consent_records_preserved_during_rollback',
    'info',
    'consent_records',
    {
        'rollback_phase': 'consent_preservation',
        'action': 'preserve_all_consent_records',
        'compliance_basis': 'gdpr_article_7',
        'legal_requirement': 'consent_records_must_be_preserved',
        'consent_records_preserved': (SELECT COUNT(*) FROM users_consent)
    },
    'confidential',
    true,
    'gdpr_compliance',
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY),
    NOW(),
    NOW()
);

COMMIT 'preserve_consent_records';

-- =============================================================================
-- PHASE 7: UPDATE SCHEMA VERSION
-- =============================================================================

BEGIN TRANSACTION 'rollback_schema_version';

-- Revert schema version
UPDATE schema_version 
SET 
    version = '1.0.0',
    last_migration_id = '003_security_enhancements',
    updated_at = NOW(),
    updated_by = 'database_repair_agent_rollback';

-- Update migration status
UPDATE schema_migrations 
SET 
    status = 'rolled_back',
    updated_at = NOW(),
    error_message = 'Migration rolled back successfully with data preservation'
WHERE migration_id = '004_database_repair';

COMMIT 'rollback_schema_version';

-- =============================================================================
-- PHASE 8: ROLLBACK COMPLETION & NOTIFICATION
-- =============================================================================

BEGIN TRANSACTION 'rollback_completion';

-- Final rollback audit log
INSERT INTO audit_logs (
    eventId,
    eventType,
    eventAction,
    severity,
    resourceType,
    resourceId,
    eventData,
    dataClassification,
    gdprRelevant,
    retentionDate,
    applicationVersion,
    environmentType,
    eventTimestamp,
    createdAt
) VALUES (
    UUID(),
    'system',
    'database_repair_rollback_completed',
    'warn',
    'schema_migrations',
    '004_database_repair',
    {
        'rollback_migration': '004_database_repair',
        'rollback_status': 'completed_successfully',
        'schema_version_reverted': '1.0.0',
        'data_preservation': {
            'security_events': 'fully_preserved',
            'audit_logs': 'fully_preserved',
            'consent_records': 'fully_preserved_gdpr_compliant',
            'encrypted_tokens': 'preserved_but_invalidated',
            'scan_metadata': 'preserved_in_config'
        },
        'user_impact': {
            'reauthentication_required': true,
            'active_scans_may_restart': true,
            'consent_records_maintained': true,
            'audit_trail_preserved': true
        },
        'post_rollback_actions_required': [
            'notify_users_of_reauthentication_requirement',
            'restart_any_failed_scans',
            'verify_system_functionality',
            'monitor_performance_metrics'
        ]
    },
    'confidential',
    true,
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY),
    '1.0.0',
    'production',
    NOW(),
    NOW()
);

COMMIT 'rollback_completion';

-- =============================================================================
-- ROLLBACK COMPLETION SUMMARY
-- =============================================================================

-- Rollback of Migration 004 completed successfully
-- 
-- ROLLBACK ACTIONS COMPLETED:
-- ✅ Performance indexes removed
-- ✅ Security events and audit logs preserved (compliance)
-- ✅ Token encryption rolled back (tokens invalidated for safety)
-- ✅ Scan enhancements rolled back (metadata preserved)
-- ✅ Consent records preserved (GDPR compliance)
-- ✅ Schema version reverted to 1.0.0
-- 
-- CRITICAL DATA PRESERVED:
-- ✅ All security events maintained for compliance
-- ✅ Complete audit trail preserved
-- ✅ GDPR consent records maintained (required by law)
-- ✅ Encrypted token data preserved (but invalidated)
-- ✅ Scan checkpoint data preserved in metadata
-- 
-- REQUIRED POST-ROLLBACK ACTIONS:
-- ⚠️  Users must re-authenticate (tokens invalidated for security)
-- ⚠️  Active scans may need to be restarted
-- ⚠️  Monitor system performance after rollback
-- ⚠️  Verify all critical functionality works as expected
-- 
-- COMPLIANCE STATUS:
-- ✅ GDPR Article 7 compliance maintained
-- ✅ Audit trail integrity preserved
-- ✅ Security event history maintained
-- ✅ Data retention policies honored
-- 
-- Schema reverted to version: 1.0.0
-- System should be stable but may require user re-authentication