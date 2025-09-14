-- DriveMind Firestore Composite Indexes
-- Version: 1.0.0
-- Last Updated: 2025-09-12
-- Standards: ALPHA-CODENAME v1.4 compliant
--
-- This file defines composite indexes for Firebase Firestore to optimize
-- query performance for DriveMind's most critical access patterns.
-- 
-- All indexes are designed for production workloads with consideration for:
-- - Query performance optimization
-- - Index write costs
-- - Storage efficiency
-- - Real-time query requirements

-- =============================================================================
-- USER AUTHENTICATION & MANAGEMENT INDEXES
-- =============================================================================

-- High-priority user lookups by email for authentication
-- Supports: Login flows, user resolution, admin queries
CREATE INDEX idx_users_email_active 
ON users (email ASC, is_active ASC, last_seen_at DESC);

-- Active users by creation date for analytics and onboarding flows
-- Supports: User growth metrics, cohort analysis
CREATE INDEX idx_users_active_created 
ON users (is_active ASC, created_at DESC, is_premium ASC);

-- Premium user management and billing queries
-- Supports: Subscription management, feature access control
CREATE INDEX idx_users_premium_subscription 
ON users (is_premium ASC, subscription_expires_at ASC, is_active ASC)
WHERE is_premium = true;

-- User activity tracking for retention analysis
-- Supports: Activity reports, user engagement metrics
CREATE INDEX idx_users_activity_tracking 
ON users (last_seen_at DESC, created_at ASC, is_active ASC)
WHERE is_active = true;

-- Soft-deleted users for cleanup and compliance
-- Supports: Data retention, privacy compliance
CREATE INDEX idx_users_soft_deleted 
ON users (deleted_at ASC, created_at ASC)
WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- OAUTH TOKEN MANAGEMENT INDEXES
-- =============================================================================

-- Token validation and refresh operations
-- Supports: Authentication middleware, token refresh flows
CREATE INDEX idx_secrets_validation 
ON users/{uid}/secrets (is_valid DESC, last_validated_at ASC, token_version DESC);

-- Token usage tracking for monitoring and quotas
-- Supports: Usage analytics, rate limiting, suspicious activity detection
CREATE INDEX idx_secrets_usage 
ON users/{uid}/secrets (last_used_at DESC, usage_count DESC, is_valid ASC);

-- Expired token cleanup for security
-- Supports: Automated token cleanup, security maintenance
CREATE INDEX idx_secrets_expiry 
ON users/{uid}/secrets (access_token_expires_at ASC, is_valid ASC)
WHERE is_valid = true;

-- =============================================================================
-- FILE INVENTORY PERFORMANCE INDEXES
-- =============================================================================

-- Most recent file scans for dashboard display
-- Supports: File browser, recent activity views
CREATE INDEX idx_inventory_recent_activity 
ON users/{uid}/inventory (last_scanned_at DESC, modified_time DESC, trashed ASC);

-- File type analysis and filtering
-- Supports: File type dashboards, storage analysis
CREATE INDEX idx_inventory_type_analysis 
ON users/{uid}/inventory (file_type ASC, size DESC, created_time DESC)
WHERE trashed = false;

-- Large file identification for storage optimization
-- Supports: Storage cleanup recommendations, large file reports
CREATE INDEX idx_inventory_large_files 
ON users/{uid}/inventory (size DESC, file_type ASC, modified_time DESC)
WHERE trashed = false AND size > 0;

-- Duplicate file management - critical for cleanup workflows
-- Supports: Duplicate detection results, cleanup operations
CREATE INDEX idx_inventory_duplicates_comprehensive 
ON users/{uid}/inventory (is_duplicate ASC, duplicate_group_id ASC, size DESC, modified_time DESC)
WHERE is_duplicate = true;

-- AI analysis results for intelligent organization
-- Supports: AI-powered file organization, confidence filtering
CREATE INDEX idx_inventory_ai_insights 
ON users/{uid}/inventory (ai_category ASC, ai_confidence DESC, vault_score DESC, ai_analyzed_at DESC)
WHERE ai_category IS NOT NULL;

-- Shared files management
-- Supports: Collaboration features, shared file analysis
CREATE INDEX idx_inventory_sharing_status 
ON users/{uid}/inventory (shared ASC, shared_with_me ASC, owned_by_me ASC, modified_time DESC);

-- Folder hierarchy navigation and analysis
-- Supports: Folder structure analysis, navigation optimization
CREATE INDEX idx_inventory_folder_hierarchy 
ON users/{uid}/inventory (folder_depth ASC, file_type ASC, size DESC)
WHERE trashed = false;

-- File path optimization for search and navigation
-- Supports: Path-based search, folder structure queries
CREATE INDEX idx_inventory_path_search 
ON users/{uid}/inventory (path_segments ASC, name ASC, modified_time DESC)
WHERE trashed = false;

-- Trashed files management for recovery and cleanup
-- Supports: Trash management, recovery operations
CREATE INDEX idx_inventory_trashed_management 
ON users/{uid}/inventory (trashed ASC, modified_time DESC, size DESC)
WHERE trashed = true;

-- =============================================================================
-- BACKGROUND SCAN OPTIMIZATION INDEXES
-- =============================================================================

-- Active scan monitoring - critical for real-time status
-- Supports: Scan progress tracking, concurrent scan management
CREATE INDEX idx_scans_active_monitoring 
ON users/{uid}/scans (status ASC, updated_at DESC, started_at DESC)
WHERE status IN ('queued', 'running');

-- Scan history and performance analysis
-- Supports: Scan history, performance optimization, failure analysis
CREATE INDEX idx_scans_performance_analysis 
ON users/{uid}/scans (status ASC, processing_duration_seconds ASC, completed_at DESC, files_processed DESC);

-- Failed scan analysis for debugging and retry logic
-- Supports: Error analysis, retry mechanisms, reliability metrics
CREATE INDEX idx_scans_failure_analysis 
ON users/{uid}/scans (status ASC, error_code ASC, retry_count ASC, last_retry_at DESC)
WHERE status = 'failed';

-- Scan type performance tracking
-- Supports: Scan type optimization, resource planning
CREATE INDEX idx_scans_type_performance 
ON users/{uid}/scans (scan_type ASC, status ASC, processing_duration_seconds ASC, completed_at DESC);

-- Resource usage tracking for cost optimization
-- Supports: Cost analysis, resource optimization, quota management
CREATE INDEX idx_scans_resource_tracking 
ON users/{uid}/scans (completed_at DESC, api_calls_made DESC, bandwidth_used_bytes DESC)
WHERE status = 'completed';

-- =============================================================================
-- DUPLICATE DETECTION INDEXES
-- =============================================================================

-- Unresolved duplicates prioritized by space savings
-- Supports: Cleanup recommendations, storage optimization
CREATE INDEX idx_duplicates_optimization_priority 
ON users/{uid}/duplicate_groups (status ASC, space_wasted_bytes DESC, similarity_score DESC, detected_at DESC)
WHERE status = 'detected';

-- Duplicate resolution tracking for user experience
-- Supports: Resolution workflows, user progress tracking
CREATE INDEX idx_duplicates_resolution_tracking 
ON users/{uid}/duplicate_groups (status ASC, resolved_at DESC, resolution_action ASC)
WHERE status IN ('reviewed', 'resolved');

-- Duplicate type analysis for algorithm improvement
-- Supports: Algorithm performance analysis, detection quality metrics
CREATE INDEX idx_duplicates_algorithm_analysis 
ON users/{uid}/duplicate_groups (duplicate_type ASC, detection_confidence DESC, similarity_score DESC, detected_at DESC);

-- High-confidence duplicates for automatic processing
-- Supports: Automated cleanup, high-confidence recommendations
CREATE INDEX idx_duplicates_high_confidence 
ON users/{uid}/duplicate_groups (similarity_score DESC, duplicate_type ASC, space_wasted_bytes DESC)
WHERE similarity_score >= 0.95;

-- File count analysis for batch processing optimization
-- Supports: Batch processing optimization, resource planning
CREATE INDEX idx_duplicates_batch_processing 
ON users/{uid}/duplicate_groups (file_count DESC, status ASC, detected_at ASC);

-- =============================================================================
-- AI ORGANIZATION RULES INDEXES
-- =============================================================================

-- Active rules execution order - critical for rule processing
-- Supports: Rule execution engine, priority-based processing
CREATE INDEX idx_rules_execution_priority 
ON users/{uid}/organization_rules (is_active ASC, priority ASC, last_applied_at ASC)
WHERE is_active = true;

-- Rule performance tracking for optimization
-- Supports: Rule effectiveness analysis, performance optimization
CREATE INDEX idx_rules_performance_tracking 
ON users/{uid}/organization_rules (times_applied DESC, files_affected DESC, last_applied_at DESC)
WHERE is_active = true;

-- AI-generated rules analysis for improvement
-- Supports: AI rule quality analysis, confidence tracking
CREATE INDEX idx_rules_ai_analysis 
ON users/{uid}/organization_rules (created_by ASC, ai_confidence DESC, times_applied DESC, created_at DESC)
WHERE created_by = 'ai';

-- Rule validation status for maintenance
-- Supports: Rule validation workflows, error handling
CREATE INDEX idx_rules_validation_status 
ON users/{uid}/organization_rules (validation_status ASC, last_validated_at ASC, is_active ASC);

-- Auto-apply rules for automated processing
-- Supports: Automated rule execution, background processing
CREATE INDEX idx_rules_auto_apply 
ON users/{uid}/organization_rules (auto_apply ASC, is_active ASC, priority ASC)
WHERE auto_apply = true AND is_active = true;

-- =============================================================================
-- SYSTEM MONITORING & ANALYTICS INDEXES
-- =============================================================================

-- Time-series metrics for dashboards and alerting
-- Supports: Monitoring dashboards, trend analysis, alerting
CREATE INDEX idx_metrics_time_series 
ON system_metrics (metric_date DESC, total_users ASC, active_users_daily ASC);

-- Performance metrics tracking for SLA monitoring
-- Supports: SLA monitoring, performance analysis, capacity planning
CREATE INDEX idx_metrics_performance_sla 
ON system_metrics (metric_date DESC, avg_api_response_time_ms ASC, error_rate_percentage ASC);

-- Business metrics for growth analysis
-- Supports: Business intelligence, growth metrics, conversion tracking
CREATE INDEX idx_metrics_business_intelligence 
ON system_metrics (metric_date DESC, new_signups DESC, premium_conversions DESC, churn_count ASC);

-- Resource usage tracking for cost optimization
-- Supports: Cost analysis, resource optimization, capacity planning
CREATE INDEX idx_metrics_resource_usage 
ON system_metrics (metric_date DESC, total_bandwidth_gb DESC, total_storage_gb DESC);

-- =============================================================================
-- AUDIT LOG PERFORMANCE INDEXES
-- =============================================================================

-- User activity audit trails - critical for security and compliance
-- Supports: Security investigation, user activity tracking, compliance reporting
CREATE INDEX idx_audit_user_activity 
ON audit_logs (user_id ASC, event_timestamp DESC, event_type ASC)
WHERE user_id IS NOT NULL;

-- Resource access patterns for security analysis
-- Supports: Security analysis, access pattern monitoring, threat detection
CREATE INDEX idx_audit_resource_access 
ON audit_logs (resource_type ASC, resource_id ASC, event_timestamp DESC, user_id ASC);

-- Authentication events for security monitoring
-- Supports: Authentication monitoring, security alerts, fraud detection
CREATE INDEX idx_audit_auth_events 
ON audit_logs (event_type ASC, event_action ASC, event_timestamp DESC, ip_address ASC)
WHERE event_type = 'auth';

-- Data modification tracking for compliance
-- Supports: Compliance reporting, data modification tracking, audit trails
CREATE INDEX idx_audit_data_modifications 
ON audit_logs (event_type ASC, resource_type ASC, event_timestamp DESC, user_id ASC)
WHERE event_type = 'data_modification';

-- Geographic access patterns for security and analytics
-- Supports: Geographic analysis, security monitoring, user behavior analysis
CREATE INDEX idx_audit_geographic_access 
ON audit_logs (country_code ASC, event_timestamp DESC, user_id ASC, event_type ASC);

-- Data retention compliance for automated cleanup
-- Supports: Compliance automation, data retention, privacy compliance
CREATE INDEX idx_audit_retention_compliance 
ON audit_logs (retention_date ASC, data_classification ASC, created_at ASC)
WHERE retention_date IS NOT NULL;

-- API endpoint performance tracking
-- Supports: API performance analysis, optimization, monitoring
CREATE INDEX idx_audit_api_performance 
ON audit_logs (api_endpoint ASC, event_timestamp DESC, processing_time_ms ASC)
WHERE api_endpoint IS NOT NULL;

-- =============================================================================
-- RATE LIMITING PERFORMANCE INDEXES
-- =============================================================================

-- User rate limit tracking for real-time enforcement
-- Supports: Rate limiting middleware, abuse prevention, quota management
CREATE INDEX idx_rate_limits_user_enforcement 
ON rate_limits (user_id ASC, endpoint ASC, window_start DESC, is_exceeded ASC);

-- Rate limit cleanup for maintenance
-- Supports: Cleanup operations, maintenance tasks, storage optimization
CREATE INDEX idx_rate_limits_cleanup 
ON rate_limits (reset_at ASC, created_at ASC)
WHERE is_exceeded = false;

-- Abuse detection and monitoring
-- Supports: Abuse detection, security monitoring, anomaly detection
CREATE INDEX idx_rate_limits_abuse_detection 
ON rate_limits (is_exceeded ASC, request_count DESC, window_start DESC)
WHERE is_exceeded = true;

-- =============================================================================
-- CONTENT HASH DEDUPLICATION INDEXES
-- =============================================================================

-- Content hash lookup for duplicate detection - critical performance path
-- Supports: Real-time duplicate detection, content-based deduplication
CREATE INDEX idx_content_hashes_lookup 
ON file_content_hashes (content_hash ASC, reference_count DESC, last_updated_at DESC);

-- File size-based duplicate candidates
-- Supports: Optimization of duplicate detection algorithms
CREATE INDEX idx_content_hashes_size_optimization 
ON file_content_hashes (file_size_bytes ASC, reference_count DESC, hash_algorithm ASC);

-- Hash reference management for cleanup
-- Supports: Orphaned hash cleanup, reference integrity
CREATE INDEX idx_content_hashes_reference_management 
ON file_content_hashes (reference_count ASC, last_updated_at ASC)
WHERE reference_count = 0;

-- =============================================================================
-- MIGRATION AND MAINTENANCE INDEXES
-- =============================================================================

-- Schema migration tracking
-- Supports: Migration management, rollback operations, deployment tracking
CREATE INDEX idx_migrations_execution_tracking 
ON schema_migrations (status ASC, created_at DESC, version ASC);

-- Failed migration analysis
-- Supports: Migration troubleshooting, error analysis, reliability
CREATE INDEX idx_migrations_failure_analysis 
ON schema_migrations (status ASC, retry_count DESC, started_at DESC)
WHERE status IN ('failed', 'rolled_back');

-- Migration performance analysis
-- Supports: Performance optimization, resource planning, execution analysis
CREATE INDEX idx_migrations_performance_analysis 
ON schema_migrations (duration_seconds DESC, records_affected DESC, completed_at DESC)
WHERE status = 'completed';

-- Environment-specific migration tracking
-- Supports: Environment management, deployment coordination
CREATE INDEX idx_migrations_environment_tracking 
ON schema_migrations (environment ASC, status ASC, created_at DESC);

-- =============================================================================
-- DATA RETENTION POLICY INDEXES
-- =============================================================================

-- Active retention policies for cleanup operations
-- Supports: Automated cleanup, retention policy enforcement
CREATE INDEX idx_retention_policies_active 
ON data_retention_policies (is_active ASC, cleanup_schedule ASC, last_cleanup_at ASC)
WHERE is_active = true;

-- Retention performance tracking
-- Supports: Cleanup performance analysis, optimization
CREATE INDEX idx_retention_policies_performance 
ON data_retention_policies (last_cleanup_at DESC, records_cleaned_last_run DESC, retention_period_days ASC);

-- =============================================================================
-- COMPOUND INDEXES FOR COMPLEX QUERIES
-- =============================================================================

-- Multi-dimensional file analysis
-- Supports: Advanced file filtering, complex dashboard queries
CREATE INDEX idx_inventory_multi_dimensional 
ON users/{uid}/inventory (
    file_type ASC, 
    ai_category ASC, 
    is_duplicate ASC, 
    size DESC, 
    modified_time DESC
) WHERE trashed = false;

-- Comprehensive scan analysis
-- Supports: Detailed scan performance analysis, historical comparison
CREATE INDEX idx_scans_comprehensive_analysis 
ON users/{uid}/scans (
    scan_type ASC, 
    status ASC, 
    files_processed DESC, 
    processing_duration_seconds ASC, 
    completed_at DESC
);

-- Advanced duplicate analysis
-- Supports: Complex duplicate analysis, multi-criteria optimization
CREATE INDEX idx_duplicates_advanced_analysis 
ON users/{uid}/duplicate_groups (
    duplicate_type ASC, 
    similarity_score DESC, 
    file_count DESC, 
    space_wasted_bytes DESC, 
    status ASC
);

-- Rule effectiveness analysis
-- Supports: Advanced rule analysis, optimization recommendations
CREATE INDEX idx_rules_effectiveness_analysis 
ON users/{uid}/organization_rules (
    created_by ASC, 
    is_active ASC, 
    times_applied DESC, 
    ai_confidence DESC, 
    priority ASC
);

-- =============================================================================
-- QUERY OPTIMIZATION NOTES
-- =============================================================================

-- Performance Considerations:
-- 1. All indexes include frequently filtered fields first
-- 2. Sort fields are positioned last for optimal performance
-- 3. WHERE clauses are carefully considered for index efficiency
-- 4. Compound indexes support multiple query patterns
-- 5. Write costs are balanced against read performance needs

-- Firestore Specific Optimizations:
-- 1. Inequality filters are positioned appropriately
-- 2. Array membership queries have dedicated indexes
-- 3. Null value filtering is explicitly handled
-- 4. Geographic queries are optimized for security analysis

-- Index Maintenance:
-- 1. Monitor index usage with Firestore console
-- 2. Remove unused indexes to reduce write costs
-- 3. Optimize composite indexes based on actual query patterns
-- 4. Regular performance analysis and adjustment

-- =============================================================================
-- INDEX DEPLOYMENT COMMANDS
-- =============================================================================

-- Deploy indexes using Firebase CLI:
-- firebase deploy --only firestore:indexes
-- 
-- Monitor index build progress:
-- firebase firestore:indexes
-- 
-- Delete unused indexes:
-- firebase firestore:indexes --delete-index=[INDEX_ID]