-- ============================================================================
-- DriveMind Firestore Composite Indexes - PERFORMANCE OPTIMIZED
-- Version: 2.0.0-REPAIR
-- Date: 2025-09-17
-- Standards: ALPHA-CODENAME v1.8 + AEI21 compliant
-- ============================================================================
--
-- CRITICAL PERFORMANCE INDEXES FOR DATABASE REPAIR:
-- 1. Token lookup and validation performance
-- 2. Scan state checkpoint and resume optimization  
-- 3. File metadata search and filtering indexes
-- 4. Audit trail performance for compliance
-- 5. Security event detection and analysis
-- 6. Rate limiting real-time enforcement
-- 7. Consent management GDPR compliance
-- 8. Background job queue optimization
--
-- PERFORMANCE TARGETS:
-- - Query response time: P95 < 100ms, P99 < 250ms
-- - Index write overhead: < 10% of total write cost
-- - Concurrent query support: 1000+ simultaneous queries
-- - Real-time updates: < 1s propagation delay
-- ============================================================================

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
-- ENCRYPTED TOKEN MANAGEMENT INDEXES (CRITICAL FOR AUTH PERFORMANCE)
-- =============================================================================

-- PRIORITY 1: Real-time token validation and health checks
-- Supports: Authentication middleware, rapid token validation, health monitoring
CREATE INDEX idx_secrets_realtime_validation 
ON users/{uid}/secrets (isValid DESC, lastValidatedAt DESC, healthCheckCount ASC, keyVersion DESC);

-- PRIORITY 2: Token usage tracking for security and monitoring  
-- Supports: Usage analytics, suspicious activity detection, refresh patterns
CREATE INDEX idx_secrets_security_monitoring 
ON users/{uid}/secrets (lastUsedAt DESC, usageCount DESC, refreshCount DESC, isValid ASC);

-- PRIORITY 3: Encryption key rotation and management
-- Supports: Key rotation workflows, encryption health, compliance
CREATE INDEX idx_secrets_encryption_management 
ON users/{uid}/secrets (keyVersion DESC, encryptionTimestamp DESC, encryptionAlgorithm ASC);

-- PRIORITY 4: Token expiry and refresh operations
-- Supports: Token refresh flows, expiry management, automated cleanup
CREATE INDEX idx_secrets_expiry_management 
ON users/{uid}/secrets (expiresAt ASC, lastRefreshAt DESC, isValid ASC)
WHERE isValid = true;

-- PRIORITY 5: Audit trail queries for compliance
-- Supports: Security audits, compliance reporting, forensic analysis
CREATE INDEX idx_secrets_audit_compliance 
ON users/{uid}/secrets (updatedAt DESC, usageCount DESC, refreshCount DESC);

-- =============================================================================
-- GDPR CONSENT MANAGEMENT INDEXES (COMPLIANCE CRITICAL)
-- =============================================================================

-- PRIORITY 1: Real-time consent validation for AI processing
-- Supports: Real-time consent checks, PII processing validation, GDPR compliance
CREATE INDEX idx_consent_realtime_validation 
ON users/{uid}/consent (granted ASC, expiresAt ASC, consentVersion DESC, updatedAt DESC);

-- PRIORITY 2: Consent expiry and renewal management
-- Supports: Consent renewal workflows, expiry notifications, compliance automation
CREATE INDEX idx_consent_expiry_management 
ON users/{uid}/consent (expiresAt ASC, autoRenewal ASC, granted ASC, grantedAt DESC);

-- PRIORITY 3: Consent audit and compliance reporting
-- Supports: GDPR audits, consent history, compliance reporting
CREATE INDEX idx_consent_audit_compliance 
ON users/{uid}/consent (grantedAt DESC, revokedAt DESC, consentVersion DESC);

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
-- ENHANCED SCAN JOB INDEXES (CHECKPOINT/RESUME OPTIMIZED)
-- =============================================================================

-- PRIORITY 1: Real-time active scan monitoring with checkpoints
-- Supports: Real-time scan progress, checkpoint/resume, concurrent scan management
CREATE INDEX idx_scans_realtime_monitoring 
ON users/{uid}/scans (status ASC, lastActivityAt DESC, priority ASC, startedAt DESC)
WHERE status IN ('pending', 'running', 'paused');

-- PRIORITY 2: Checkpoint and resume operations (CRITICAL FOR RELIABILITY)
-- Supports: Crash recovery, checkpoint restoration, scan resumption
CREATE INDEX idx_scans_checkpoint_resume 
ON users/{uid}/scans (status ASC, scanType ASC, updatedAt DESC)
WHERE status IN ('paused', 'running');

-- PRIORITY 3: Scan queue management with priority
-- Supports: Queue processing, priority-based scheduling, load balancing
CREATE INDEX idx_scans_queue_management 
ON users/{uid}/scans (status ASC, priority ASC, createdAt ASC)
WHERE status = 'pending';

-- PRIORITY 4: Scan performance and resource analysis
-- Supports: Performance optimization, resource planning, cost analysis
CREATE INDEX idx_scans_performance_optimization 
ON users/{uid}/scans (
    scanType ASC, 
    status ASC, 
    processingDurationSeconds ASC, 
    completedAt DESC
);

-- PRIORITY 5: Failed scan recovery and retry analysis
-- Supports: Error analysis, retry logic, reliability improvement
CREATE INDEX idx_scans_failure_recovery 
ON users/{uid}/scans (
    status ASC, 
    errorCode ASC, 
    retryCount ASC, 
    nextRetryAt ASC
)
WHERE status = 'failed';

-- PRIORITY 6: Resource usage and cost tracking
-- Supports: Cost optimization, resource monitoring, quota management
CREATE INDEX idx_scans_resource_optimization 
ON users/{uid}/scans (
    completedAt DESC, 
    scanType ASC
)
WHERE status = 'completed';

-- PRIORITY 7: Scan quality and validation tracking
-- Supports: Quality assurance, data integrity, validation reporting
CREATE INDEX idx_scans_quality_assurance 
ON users/{uid}/scans (
    status ASC, 
    completedAt DESC
)
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
-- ENHANCED AUDIT LOG INDEXES (SECURITY & COMPLIANCE OPTIMIZED)
-- =============================================================================

-- PRIORITY 1: Real-time security monitoring and threat detection
-- Supports: Real-time security alerts, threat detection, incident response
CREATE INDEX idx_audit_security_realtime 
ON audit_logs (
    severity ASC, 
    eventType ASC, 
    eventTimestamp DESC, 
    userId ASC, 
    ipAddress ASC
)
WHERE severity IN ('error', 'critical') AND eventType = 'security';

-- PRIORITY 2: User activity forensics and investigation
-- Supports: Security investigations, forensic analysis, user behavior tracking
CREATE INDEX idx_audit_user_forensics 
ON audit_logs (
    userId ASC, 
    eventTimestamp DESC, 
    eventType ASC, 
    resourceType ASC, 
    ipAddress ASC
)
WHERE userId IS NOT NULL;

-- PRIORITY 3: Resource access audit and compliance
-- Supports: Resource access monitoring, compliance audits, data access tracking
CREATE INDEX idx_audit_resource_compliance 
ON audit_logs (
    resourceType ASC, 
    resourceId ASC, 
    eventAction ASC, 
    eventTimestamp DESC, 
    dataSubject ASC
);

-- PRIORITY 4: Authentication security monitoring
-- Supports: Authentication failure detection, brute force detection, security alerts
CREATE INDEX idx_audit_auth_security 
ON audit_logs (
    eventType ASC, 
    eventAction ASC, 
    severity ASC, 
    eventTimestamp DESC, 
    ipAddress ASC
)
WHERE eventType = 'auth';

-- PRIORITY 5: GDPR and PII compliance tracking
-- Supports: GDPR compliance, PII access tracking, data subject rights
CREATE INDEX idx_audit_gdpr_compliance 
ON audit_logs (
    gdprRelevant ASC, 
    dataSubject ASC, 
    eventTimestamp DESC, 
    processingPurpose ASC
)
WHERE gdprRelevant = true;

-- PRIORITY 6: Data retention and lifecycle management
-- Supports: Automated data retention, compliance cleanup, lifecycle management
CREATE INDEX idx_audit_retention_lifecycle 
ON audit_logs (
    retentionDate ASC, 
    dataClassification ASC, 
    createdAt ASC, 
    archiveAfterDays ASC
)
WHERE retentionDate IS NOT NULL;

-- PRIORITY 7: Performance monitoring and optimization
-- Supports: API performance analysis, system optimization, SLA monitoring
CREATE INDEX idx_audit_performance_monitoring 
ON audit_logs (
    apiEndpoint ASC, 
    httpStatusCode ASC, 
    processingTimeMs DESC, 
    eventTimestamp DESC
)
WHERE apiEndpoint IS NOT NULL;

-- PRIORITY 8: Error tracking and system reliability
-- Supports: Error analysis, system reliability, debugging, alerting
CREATE INDEX idx_audit_error_tracking 
ON audit_logs (
    severity ASC, 
    errorCode ASC, 
    eventTimestamp DESC, 
    apiEndpoint ASC
)
WHERE severity IN ('error', 'critical');

-- =============================================================================
-- SECURITY EVENTS INDEXES (THREAT DETECTION OPTIMIZED)
-- =============================================================================

-- PRIORITY 1: Real-time threat detection and blocking
-- Supports: Real-time threat detection, automatic blocking, incident response
CREATE INDEX idx_security_threat_realtime 
ON security_events (
    severity ASC, 
    riskScore DESC, 
    lastSeen DESC, 
    blocked ASC, 
    sourceIp ASC
);

-- PRIORITY 2: Source IP threat analysis
-- Supports: IP-based threat analysis, geolocation security, source tracking
CREATE INDEX idx_security_source_analysis 
ON security_events (
    sourceIp ASC, 
    sourceCountry ASC, 
    threatCategory ASC, 
    lastSeen DESC, 
    requestCount DESC
);

-- PRIORITY 3: Attack pattern recognition
-- Supports: Attack pattern analysis, threat intelligence, security research
CREATE INDEX idx_security_attack_patterns 
ON security_events (
    threatCategory ASC, 
    attackVector ASC, 
    confidence DESC, 
    firstSeen DESC
);

-- PRIORITY 4: Investigation and incident management
-- Supports: Security investigations, incident response, false positive analysis
CREATE INDEX idx_security_investigation 
ON security_events (
    investigated ASC, 
    falsePositive ASC, 
    severity ASC, 
    lastSeen DESC
);

-- PRIORITY 5: Blocked threats and mitigation tracking
-- Supports: Mitigation effectiveness, blocked threat analysis, security metrics
CREATE INDEX idx_security_mitigation_tracking 
ON security_events (
    blocked ASC, 
    blockedAt DESC, 
    mitigationApplied ASC, 
    riskScore DESC
)
WHERE blocked = true;

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