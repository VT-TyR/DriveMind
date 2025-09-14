-- Migration: Performance Indexes
-- Version: 002
-- Description: Create comprehensive performance indexes for production workloads
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
    '002_performance_indexes',
    'Performance Indexes Creation',
    '1.1.0',
    'Create comprehensive composite indexes for optimal query performance in production workloads',
    'pending',
    '002_performance_indexes.sql',
    '002_performance_indexes_rollback.sql',
    'system',
    'development',
    NOW(),
    NOW()
);

-- =============================================================================
-- USER MANAGEMENT PERFORMANCE INDEXES
-- =============================================================================

-- Step 1: Enhanced user authentication and management indexes
BEGIN TRANSACTION;

-- Multi-dimensional user lookup optimization
CREATE INDEX idx_users_email_active_premium 
ON users (email ASC, is_active ASC, is_premium ASC, last_seen_at DESC)
WHERE deleted_at IS NULL;

-- User activity and engagement tracking
CREATE INDEX idx_users_engagement_analysis 
ON users (last_seen_at DESC, created_at ASC, is_active ASC)
WHERE is_active = true AND deleted_at IS NULL;

-- Premium user lifecycle management
CREATE INDEX idx_users_subscription_management 
ON users (is_premium ASC, subscription_expires_at ASC, is_active ASC)
WHERE is_premium = true AND deleted_at IS NULL;

-- User onboarding and cohort analysis
CREATE INDEX idx_users_cohort_analysis 
ON users (created_at DESC, is_active ASC, last_seen_at DESC)
WHERE deleted_at IS NULL;

COMMIT;

-- =============================================================================
-- OAUTH TOKEN MANAGEMENT INDEXES
-- =============================================================================

-- Step 2: OAuth token lifecycle and security indexes
BEGIN TRANSACTION;

-- Token validation and refresh optimization
CREATE INDEX idx_secrets_security_management 
ON users/{uid}/secrets (is_valid DESC, last_validated_at ASC, token_version DESC, usage_count ASC);

-- Token usage analytics and monitoring
CREATE INDEX idx_secrets_usage_analytics 
ON users/{uid}/secrets (last_used_at DESC, usage_count DESC, is_valid ASC, secret_type ASC);

-- Expired token cleanup automation
CREATE INDEX idx_secrets_expiry_cleanup 
ON users/{uid}/secrets (access_token_expires_at ASC, is_valid ASC, created_at ASC)
WHERE is_valid = true;

COMMIT;

-- =============================================================================
-- FILE INVENTORY PERFORMANCE OPTIMIZATION
-- =============================================================================

-- Step 3: File inventory query optimization for large datasets
BEGIN TRANSACTION;

-- File browser and dashboard queries
CREATE INDEX idx_inventory_dashboard_optimization 
ON users/{uid}/inventory (
    last_scanned_at DESC, 
    modified_time DESC, 
    file_type ASC, 
    size DESC
) WHERE trashed = false;

-- File type and size analysis for storage optimization
CREATE INDEX idx_inventory_storage_analysis 
ON users/{uid}/inventory (
    file_type ASC, 
    size DESC, 
    created_time DESC, 
    modified_time DESC
) WHERE trashed = false AND size > 0;

-- Large file identification with multiple dimensions
CREATE INDEX idx_inventory_large_file_management 
ON users/{uid}/inventory (
    size DESC, 
    file_type ASC, 
    modified_time DESC, 
    viewed_by_me_time DESC
) WHERE trashed = false AND size >= 10485760; -- Files >= 10MB

-- AI-powered file organization optimization
CREATE INDEX idx_inventory_ai_organization 
ON users/{uid}/inventory (
    ai_category ASC, 
    ai_confidence DESC, 
    vault_score DESC, 
    ai_analyzed_at DESC,
    file_type ASC
) WHERE ai_category IS NOT NULL;

-- Duplicate file management with priority scoring
CREATE INDEX idx_inventory_duplicate_management 
ON users/{uid}/inventory (
    is_duplicate ASC, 
    duplicate_group_id ASC, 
    size DESC, 
    modified_time DESC,
    ai_confidence DESC
) WHERE is_duplicate = true;

-- Shared file collaboration analytics
CREATE INDEX idx_inventory_collaboration_analytics 
ON users/{uid}/inventory (
    shared ASC, 
    shared_with_me ASC, 
    owned_by_me ASC, 
    modified_time DESC,
    file_type ASC
) WHERE trashed = false;

-- File hierarchy and navigation optimization
CREATE INDEX idx_inventory_hierarchy_navigation 
ON users/{uid}/inventory (
    folder_depth ASC, 
    path_segments ASC, 
    file_type ASC, 
    name ASC,
    size DESC
) WHERE trashed = false;

-- Recently accessed files for user experience
CREATE INDEX idx_inventory_recent_activity 
ON users/{uid}/inventory (
    viewed_by_me_time DESC, 
    modified_time DESC, 
    file_type ASC, 
    size DESC
) WHERE trashed = false AND viewed_by_me_time IS NOT NULL;

-- Trashed file recovery and cleanup
CREATE INDEX idx_inventory_trash_management 
ON users/{uid}/inventory (
    trashed ASC, 
    modified_time DESC, 
    size DESC, 
    file_type ASC
) WHERE trashed = true;

COMMIT;

-- =============================================================================
-- BACKGROUND SCAN PERFORMANCE INDEXES
-- =============================================================================

-- Step 4: Background scan monitoring and optimization
BEGIN TRANSACTION;

-- Real-time scan progress tracking
CREATE INDEX idx_scans_realtime_monitoring 
ON users/{uid}/scans (
    status ASC, 
    updated_at DESC, 
    progress_percentage DESC, 
    started_at DESC
) WHERE status IN ('queued', 'running');

-- Scan performance analysis and optimization
CREATE INDEX idx_scans_performance_optimization 
ON users/{uid}/scans (
    status ASC, 
    processing_duration_seconds ASC, 
    files_processed DESC, 
    completed_at DESC,
    scan_type ASC
);

-- Failed scan troubleshooting and retry logic
CREATE INDEX idx_scans_failure_management 
ON users/{uid}/scans (
    status ASC, 
    error_code ASC, 
    retry_count ASC, 
    last_retry_at DESC,
    error_message ASC
) WHERE status = 'failed';

-- Scan resource utilization tracking
CREATE INDEX idx_scans_resource_optimization 
ON users/{uid}/scans (
    completed_at DESC, 
    api_calls_made DESC, 
    bandwidth_used_bytes DESC, 
    processing_duration_seconds ASC
) WHERE status = 'completed';

-- Scan type performance comparison
CREATE INDEX idx_scans_type_analysis 
ON users/{uid}/scans (
    scan_type ASC, 
    status ASC, 
    processing_duration_seconds ASC, 
    files_processed DESC,
    completed_at DESC
);

COMMIT;

-- =============================================================================
-- DUPLICATE DETECTION OPTIMIZATION
-- =============================================================================

-- Step 5: Advanced duplicate detection and resolution indexes
BEGIN TRANSACTION;

-- High-priority duplicate cleanup optimization
CREATE INDEX idx_duplicates_cleanup_priority 
ON users/{uid}/duplicate_groups (
    status ASC, 
    space_wasted_bytes DESC, 
    similarity_score DESC, 
    file_count DESC,
    detected_at DESC
) WHERE status = 'detected';

-- Duplicate resolution workflow tracking
CREATE INDEX idx_duplicates_resolution_workflow 
ON users/{uid}/duplicate_groups (
    status ASC, 
    resolved_at DESC, 
    resolution_action ASC, 
    space_wasted_bytes DESC
) WHERE status IN ('reviewed', 'resolved');

-- Algorithm performance and accuracy analysis
CREATE INDEX idx_duplicates_algorithm_performance 
ON users/{uid}/duplicate_groups (
    duplicate_type ASC, 
    detection_confidence DESC, 
    similarity_score DESC, 
    detected_at DESC,
    detection_algorithm ASC
);

-- High-confidence automatic processing
CREATE INDEX idx_duplicates_auto_processing 
ON users/{uid}/duplicate_groups (
    similarity_score DESC, 
    duplicate_type ASC, 
    space_wasted_bytes DESC, 
    file_count DESC
) WHERE similarity_score >= 0.95 AND status = 'detected';

-- Batch duplicate processing optimization
CREATE INDEX idx_duplicates_batch_optimization 
ON users/{uid}/duplicate_groups (
    file_count DESC, 
    status ASC, 
    detected_at ASC, 
    space_wasted_bytes DESC
);

COMMIT;

-- =============================================================================
-- AI ORGANIZATION RULES OPTIMIZATION
-- =============================================================================

-- Step 6: AI-powered organization rule performance
BEGIN TRANSACTION;

-- Rule execution priority and order
CREATE INDEX idx_rules_execution_optimization 
ON users/{uid}/organization_rules (
    is_active ASC, 
    priority ASC, 
    last_applied_at ASC, 
    auto_apply ASC
) WHERE is_active = true;

-- Rule effectiveness and performance tracking
CREATE INDEX idx_rules_effectiveness_analysis 
ON users/{uid}/organization_rules (
    times_applied DESC, 
    files_affected DESC, 
    last_applied_at DESC, 
    ai_confidence DESC
) WHERE is_active = true;

-- AI-generated rule quality analysis
CREATE INDEX idx_rules_ai_quality_analysis 
ON users/{uid}/organization_rules (
    created_by ASC, 
    ai_confidence DESC, 
    times_applied DESC, 
    validation_status ASC,
    created_at DESC
) WHERE created_by = 'ai';

-- Rule validation and maintenance
CREATE INDEX idx_rules_validation_maintenance 
ON users/{uid}/organization_rules (
    validation_status ASC, 
    last_validated_at ASC, 
    is_active ASC, 
    validation_error ASC
);

-- Automatic rule processing optimization
CREATE INDEX idx_rules_automatic_processing 
ON users/{uid}/organization_rules (
    auto_apply ASC, 
    is_active ASC, 
    priority ASC, 
    last_applied_at ASC
) WHERE auto_apply = true AND is_active = true;

COMMIT;

-- =============================================================================
-- SYSTEM MONITORING AND ANALYTICS INDEXES
-- =============================================================================

-- Step 7: System performance and business intelligence indexes
BEGIN TRANSACTION;

-- Time-series metrics for dashboards and alerting
CREATE INDEX idx_metrics_time_series_analysis 
ON system_metrics (
    metric_date DESC, 
    active_users_daily DESC, 
    total_users ASC, 
    error_rate_percentage ASC
);

-- Performance SLA monitoring and alerting
CREATE INDEX idx_metrics_sla_monitoring 
ON system_metrics (
    metric_date DESC, 
    avg_api_response_time_ms ASC, 
    error_rate_percentage ASC, 
    total_api_calls DESC
);

-- Business growth and conversion tracking
CREATE INDEX idx_metrics_business_intelligence 
ON system_metrics (
    metric_date DESC, 
    new_signups DESC, 
    premium_conversions DESC, 
    churn_count ASC,
    active_users_monthly DESC
);

-- Resource utilization and cost optimization
CREATE INDEX idx_metrics_resource_optimization 
ON system_metrics (
    metric_date DESC, 
    total_bandwidth_gb DESC, 
    total_storage_gb DESC, 
    total_files_processed DESC
);

-- Usage pattern analysis for capacity planning
CREATE INDEX idx_metrics_capacity_planning 
ON system_metrics (
    metric_date DESC, 
    total_scans_completed DESC, 
    total_ai_insights_generated DESC, 
    active_users_daily DESC
);

COMMIT;

-- =============================================================================
-- AUDIT AND COMPLIANCE OPTIMIZATION
-- =============================================================================

-- Step 8: Advanced audit trail and compliance indexes
BEGIN TRANSACTION;

-- User security event tracking
CREATE INDEX idx_audit_security_monitoring 
ON audit_logs (
    user_id ASC, 
    event_type ASC, 
    event_timestamp DESC, 
    ip_address ASC,
    event_action ASC
) WHERE event_type = 'auth' AND user_id IS NOT NULL;

-- Resource access pattern analysis
CREATE INDEX idx_audit_access_pattern_analysis 
ON audit_logs (
    resource_type ASC, 
    resource_id ASC, 
    event_timestamp DESC, 
    user_id ASC,
    event_action ASC
);

-- Data modification compliance tracking
CREATE INDEX idx_audit_compliance_tracking 
ON audit_logs (
    event_type ASC, 
    data_classification ASC, 
    event_timestamp DESC, 
    user_id ASC
) WHERE event_type = 'data_modification';

-- Geographic access analysis for security
CREATE INDEX idx_audit_geographic_security 
ON audit_logs (
    country_code ASC, 
    event_timestamp DESC, 
    user_id ASC, 
    event_type ASC,
    ip_address ASC
) WHERE country_code IS NOT NULL;

-- Data retention compliance automation
CREATE INDEX idx_audit_retention_automation 
ON audit_logs (
    retention_date ASC, 
    data_classification ASC, 
    created_at ASC, 
    event_type ASC
) WHERE retention_date IS NOT NULL;

-- API performance and error analysis
CREATE INDEX idx_audit_api_performance_analysis 
ON audit_logs (
    api_endpoint ASC, 
    event_timestamp DESC, 
    processing_time_ms ASC, 
    event_action ASC
) WHERE api_endpoint IS NOT NULL;

COMMIT;

-- =============================================================================
-- RATE LIMITING AND ABUSE PREVENTION
-- =============================================================================

-- Step 9: Rate limiting enforcement and monitoring indexes
BEGIN TRANSACTION;

-- Real-time rate limit enforcement
CREATE INDEX idx_rate_limits_enforcement_optimization 
ON rate_limits (
    user_id ASC, 
    endpoint ASC, 
    window_start DESC, 
    is_exceeded ASC,
    request_count DESC
);

-- Abuse detection and prevention
CREATE INDEX idx_rate_limits_abuse_detection 
ON rate_limits (
    is_exceeded ASC, 
    request_count DESC, 
    window_start DESC, 
    endpoint ASC
) WHERE is_exceeded = true;

-- Rate limit cleanup and maintenance
CREATE INDEX idx_rate_limits_maintenance_cleanup 
ON rate_limits (
    reset_at ASC, 
    created_at ASC, 
    is_exceeded ASC
) WHERE reset_at < NOW();

-- Endpoint-specific rate limit analysis
CREATE INDEX idx_rate_limits_endpoint_analysis 
ON rate_limits (
    endpoint ASC, 
    window_start DESC, 
    request_count DESC, 
    is_exceeded ASC
);

COMMIT;

-- =============================================================================
-- CONTENT DEDUPLICATION OPTIMIZATION
-- =============================================================================

-- Step 10: Advanced content hash and deduplication indexes
BEGIN TRANSACTION;

-- High-performance hash lookup for real-time deduplication
CREATE INDEX idx_content_hashes_realtime_lookup 
ON file_content_hashes (
    content_hash ASC, 
    hash_algorithm ASC, 
    reference_count DESC, 
    last_updated_at DESC
);

-- File size optimization for duplicate detection algorithms
CREATE INDEX idx_content_hashes_size_optimization 
ON file_content_hashes (
    file_size_bytes ASC, 
    reference_count DESC, 
    hash_algorithm ASC, 
    first_seen_at DESC
);

-- Orphaned hash cleanup for storage optimization
CREATE INDEX idx_content_hashes_orphan_cleanup 
ON file_content_hashes (
    reference_count ASC, 
    last_updated_at ASC, 
    file_size_bytes DESC
) WHERE reference_count = 0;

-- Hash reference integrity monitoring
CREATE INDEX idx_content_hashes_integrity_monitoring 
ON file_content_hashes (
    reference_count DESC, 
    last_updated_at DESC, 
    first_seen_at ASC
) WHERE reference_count > 1;

COMMIT;

-- =============================================================================
-- COMPOUND INDEXES FOR COMPLEX QUERIES
-- =============================================================================

-- Step 11: Multi-dimensional compound indexes for advanced analytics
BEGIN TRANSACTION;

-- Comprehensive file analysis dashboard
CREATE INDEX idx_inventory_comprehensive_dashboard 
ON users/{uid}/inventory (
    file_type ASC, 
    ai_category ASC, 
    is_duplicate ASC, 
    size DESC, 
    modified_time DESC,
    vault_score DESC
) WHERE trashed = false;

-- Advanced scan performance analytics
CREATE INDEX idx_scans_advanced_analytics 
ON users/{uid}/scans (
    scan_type ASC, 
    status ASC, 
    files_processed DESC, 
    processing_duration_seconds ASC, 
    api_calls_made DESC,
    completed_at DESC
);

-- Multi-criteria duplicate optimization
CREATE INDEX idx_duplicates_multi_criteria_optimization 
ON users/{uid}/duplicate_groups (
    duplicate_type ASC, 
    similarity_score DESC, 
    file_count DESC, 
    space_wasted_bytes DESC, 
    status ASC,
    detection_confidence DESC
);

-- Comprehensive rule effectiveness analysis
CREATE INDEX idx_rules_comprehensive_effectiveness 
ON users/{uid}/organization_rules (
    created_by ASC, 
    is_active ASC, 
    times_applied DESC, 
    ai_confidence DESC, 
    priority ASC,
    validation_status ASC
);

COMMIT;

-- =============================================================================
-- VALIDATION AND PERFORMANCE TESTING
-- =============================================================================

-- Step 12: Verify index creation and performance
BEGIN TRANSACTION;

-- Test critical query patterns
-- These queries should execute efficiently with the new indexes

-- User authentication query test
EXPLAIN SELECT * FROM users 
WHERE email = 'test@example.com' 
  AND is_active = true 
  AND deleted_at IS NULL;

-- File inventory dashboard query test
EXPLAIN SELECT * FROM users/test_uid/inventory 
WHERE trashed = false 
  AND file_type = 'Document' 
ORDER BY modified_time DESC 
LIMIT 50;

-- Active scan monitoring query test
EXPLAIN SELECT * FROM users/test_uid/scans 
WHERE status IN ('running', 'queued') 
ORDER BY updated_at DESC;

-- Duplicate cleanup priority query test
EXPLAIN SELECT * FROM users/test_uid/duplicate_groups 
WHERE status = 'detected' 
ORDER BY space_wasted_bytes DESC 
LIMIT 20;

COMMIT;

-- =============================================================================
-- MIGRATION COMPLETION
-- =============================================================================

-- Step 13: Update migration status and create completion audit
BEGIN TRANSACTION;

-- Count total indexes created
SET @index_count = (
    SELECT COUNT(*) FROM information_schema.statistics 
    WHERE table_schema = DATABASE() 
    AND index_name LIKE 'idx_%'
);

-- Update migration record
UPDATE schema_migrations 
SET 
    status = 'completed',
    completed_at = NOW(),
    duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()),
    records_affected = @index_count,
    validation_query = 'SELECT COUNT(*) FROM information_schema.statistics WHERE index_name LIKE "idx_%"',
    validation_result = JSON_OBJECT('indexes_created', @index_count),
    updated_at = NOW()
WHERE migration_id = '002_performance_indexes';

-- Update schema version
UPDATE schema_version 
SET 
    version = '1.1.0',
    last_migration_id = '002_performance_indexes',
    updated_at = NOW(),
    updated_by = 'system'
WHERE version IS NOT NULL;

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
    '002_performance_indexes',
    JSON_OBJECT(
        'migration_version', '002_performance_indexes',
        'schema_version', '1.1.0',
        'indexes_created', @index_count,
        'duration_seconds', TIMESTAMPDIFF(SECOND, 
            (SELECT started_at FROM schema_migrations WHERE migration_id = '002_performance_indexes'),
            NOW()
        )
    ),
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY),
    NOW(),
    NOW()
);

COMMIT;

-- =============================================================================
-- PERFORMANCE MONITORING RECOMMENDATIONS
-- =============================================================================

-- Migration 002 completed successfully
-- 
-- Indexes created for optimal performance:
-- - User authentication and management (4 indexes)
-- - OAuth token lifecycle (3 indexes) 
-- - File inventory optimization (9 indexes)
-- - Background scan monitoring (5 indexes)
-- - Duplicate detection (5 indexes)
-- - AI organization rules (5 indexes)
-- - System monitoring (5 indexes)
-- - Audit and compliance (6 indexes)
-- - Rate limiting (4 indexes)
-- - Content deduplication (4 indexes)
-- - Compound analytics (4 indexes)
-- 
-- Total: 54+ performance-optimized indexes
--
-- Next recommended actions:
-- 1. Monitor index usage with Firestore console
-- 2. Run performance tests on critical queries
-- 3. Adjust indexes based on actual usage patterns
-- 4. Consider additional specialized indexes as needed
--
-- Next migration: 003_security_enhancements.sql