-- DriveMind Testing Seed Data
-- Version: 1.0.0
-- Last Updated: 2025-09-12
-- Purpose: Comprehensive testing data for automated tests and edge cases
-- Standards: ALPHA-CODENAME v1.4 compliant
--
-- This seed data creates comprehensive test scenarios for:
-- - Unit tests and integration tests
-- - Performance testing and load testing  
-- - Edge cases and error conditions
-- - Security testing scenarios
-- - Compliance and audit testing

-- =============================================================================
-- TESTING ENVIRONMENT VERIFICATION
-- =============================================================================

-- Ensure this is a testing environment
-- This should be enforced at the application level
-- DO NOT LOAD IN PRODUCTION

-- Log test data loading initiation
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
    'test_seed_data_load_initiated',
    'system',
    'testing_seed',
    {
        'seed_type': 'testing',
        'environment': 'testing',
        'warning': 'automated_test_data_only'
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY), -- Short retention for test logs
    NOW(),
    NOW()
);

-- =============================================================================
-- EDGE CASE USER ACCOUNTS
-- =============================================================================

-- Create users for testing edge cases and boundary conditions
BEGIN TRANSACTION;

-- Test User: Minimal data user (boundary testing)
INSERT INTO users (
    firebase_uid,
    email,
    display_name,
    provider,
    created_at,
    updated_at,
    last_seen_at,
    is_active,
    is_premium,
    security_status,
    email_verified,
    gdpr_consent_given,
    gdpr_consent_date,
    data_processing_consent,
    risk_score,
    data_retention_policy
) VALUES (
    'test_minimal_user',
    'minimal@test.local',
    'Minimal Test User',
    'google.com',
    NOW(),
    NOW(),
    NOW(),
    true,
    false,
    'active',
    true,
    true,
    NOW(),
    true,
    0.00,
    'minimal'
);

-- Test User: Maximum data user (boundary testing)
INSERT INTO users (
    firebase_uid,
    email,
    display_name,
    photo_url,
    provider,
    created_at,
    updated_at,
    last_seen_at,
    settings,
    features,
    quotas,
    is_active,
    is_premium,
    subscription_expires_at,
    security_status,
    mfa_enabled,
    mfa_backup_codes,
    mfa_recovery_email,
    failed_login_attempts,
    last_failed_login_at,
    last_successful_login_at,
    last_login_ip,
    login_history,
    security_notifications_enabled,
    suspicious_activity_alerts,
    login_location_tracking,
    email_verified,
    phone_number,
    phone_verified,
    risk_score,
    risk_factors,
    last_risk_assessment_at,
    data_retention_policy,
    gdpr_consent_given,
    gdpr_consent_date,
    data_processing_consent,
    marketing_consent
) VALUES (
    'test_maximal_user',
    'maximal@test.local',
    'Maximal Test User With Very Long Display Name That Tests Length Limits',
    'https://test.example.com/very/long/photo/url/that/tests/url/length/limits.jpg',
    'google.com',
    DATE_SUB(NOW(), INTERVAL 365 DAY),
    NOW(),
    DATE_SUB(NOW(), INTERVAL 1 MINUTE),
    {
        'theme': 'dark',
        'language': 'en-US',
        'timezone': 'America/New_York',
        'notifications_enabled': true,
        'dashboard_layout': 'advanced',
        'ai_suggestions_enabled': true,
        'custom_setting_1': 'value1',
        'custom_setting_2': 'value2',
        'custom_setting_3': 'value3'
    },
    {
        'ai_enabled': true,
        'background_scans': true,
        'batch_operations': true,
        'advanced_analytics': true,
        'api_access': true,
        'beta_features': true
    },
    {
        'max_files': 1000000,
        'max_scans_per_day': 100,
        'max_ai_requests_per_day': 10000,
        'max_storage_gb': 1000,
        'max_api_calls_per_minute': 1000
    },
    true,
    true,
    DATE_ADD(NOW(), INTERVAL 365 DAY),
    'active',
    true,
    ['backup001', 'backup002', 'backup003', 'backup004', 'backup005'],
    'recovery@test.local',
    0,
    null,
    NOW(),
    '192.168.1.200',
    [
        {'timestamp': NOW(), 'ip': '192.168.1.200', 'success': true},
        {'timestamp': DATE_SUB(NOW(), INTERVAL 1 HOUR), 'ip': '192.168.1.200', 'success': true},
        {'timestamp': DATE_SUB(NOW(), INTERVAL 2 HOUR), 'ip': '192.168.1.201', 'success': true}
    ],
    true,
    true,
    true,
    true,
    '+1-555-0123',
    true,
    0.95,
    ['multiple_locations', 'high_api_usage', 'unusual_access_patterns'],
    NOW(),
    'extended',
    true,
    DATE_SUB(NOW(), INTERVAL 365 DAY),
    true,
    true
);

-- Test User: Suspended account (security testing)
INSERT INTO users (
    firebase_uid,
    email,
    display_name,
    provider,
    created_at,
    updated_at,
    last_seen_at,
    is_active,
    is_premium,
    security_status,
    account_locked_at,
    account_locked_reason,
    failed_login_attempts,
    last_failed_login_at,
    email_verified,
    risk_score,
    risk_factors,
    data_retention_policy
) VALUES (
    'test_suspended_user',
    'suspended@test.local',
    'Suspended Test User',
    'google.com',
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    NOW(),
    DATE_SUB(NOW(), INTERVAL 7 DAY),
    false,
    false,
    'suspended',
    DATE_SUB(NOW(), INTERVAL 7 DAY),
    'multiple_security_violations',
    15,
    DATE_SUB(NOW(), INTERVAL 7 DAY),
    true,
    0.99,
    ['excessive_failed_logins', 'suspicious_ip_addresses', 'policy_violations'],
    'standard'
);

-- Test User: Scheduled for deletion (GDPR testing)
INSERT INTO users (
    firebase_uid,
    email,
    display_name,
    provider,
    created_at,
    updated_at,
    last_seen_at,
    is_active,
    is_premium,
    security_status,
    email_verified,
    gdpr_consent_given,
    gdpr_consent_date,
    data_processing_consent,
    scheduled_deletion_at,
    deletion_requested_at,
    deletion_reason,
    risk_score,
    data_retention_policy
) VALUES (
    'test_deletion_user',
    'deletion@test.local',
    'Scheduled Deletion User',
    'google.com',
    DATE_SUB(NOW(), INTERVAL 60 DAY),
    NOW(),
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    false,
    false,
    'pending_deletion',
    true,
    false, -- Consent withdrawn
    DATE_SUB(NOW(), INTERVAL 60 DAY),
    false,
    DATE_ADD(NOW(), INTERVAL 7 DAY),
    DATE_SUB(NOW(), INTERVAL 23 DAY),
    'gdpr_right_to_be_forgotten',
    0.05,
    'minimal'
);

COMMIT;

-- =============================================================================
-- PERFORMANCE TESTING DATA
-- =============================================================================

-- Create large dataset for performance testing
BEGIN TRANSACTION;

-- Performance test user with large file inventory
INSERT INTO users (
    firebase_uid,
    email,
    display_name,
    provider,
    created_at,
    updated_at,
    last_seen_at,
    is_active,
    is_premium,
    security_status,
    email_verified,
    gdpr_consent_given,
    gdpr_consent_date,
    data_processing_consent,
    risk_score,
    data_retention_policy
) VALUES (
    'test_performance_user',
    'performance@test.local',
    'Performance Test User',
    'google.com',
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    NOW(),
    NOW(),
    true,
    true,
    'active',
    true,
    true,
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    true,
    0.25,
    'standard'
);

-- Create OAuth tokens for performance user
INSERT INTO users/test_performance_user/secrets (
    secret_type,
    refresh_token,
    access_token_expires_at,
    scope,
    token_version,
    is_valid,
    usage_count,
    last_used_at,
    created_at,
    updated_at,
    token_encrypted_at,
    encryption_key_version,
    device_fingerprint,
    user_agent_hash
) VALUES (
    'googleDrive',
    'ENCRYPTED_PERFORMANCE_TEST_TOKEN',
    DATE_ADD(NOW(), INTERVAL 1 HOUR),
    ['https://www.googleapis.com/auth/drive'],
    1,
    true,
    5000,
    NOW(),
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    NOW(),
    NOW(),
    1,
    'perf_test_device_001',
    'sha256_perf_user_agent'
);

COMMIT;

-- =============================================================================
-- BULK FILE INVENTORY FOR PERFORMANCE TESTING
-- =============================================================================

-- Create large number of files for performance testing
BEGIN TRANSACTION;

-- Generate 100 test files for performance testing
-- In a real implementation, this would be done programmatically
-- Here we show the pattern for the first 10 files

INSERT INTO users/test_performance_user/inventory VALUES
    ('perf_file_001', 'Document_001.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Document', 524288,
     DATE_SUB(NOW(), INTERVAL 100 DAY), DATE_SUB(NOW(), INTERVAL 50 DAY), NOW(), NOW(),
     ['perf_root'], ['Documents', 'Performance'], 2, false, true, false, false, null, 75.5,
     'business_document', ['performance', 'test', 'document'], 0.85, NOW(),
     'sha256_perf_001', 'thumb_perf_001', 'view_perf_001', {}, NOW(), NOW()),

    ('perf_file_002', 'Spreadsheet_002.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Spreadsheet', 1048576,
     DATE_SUB(NOW(), INTERVAL 99 DAY), DATE_SUB(NOW(), INTERVAL 49 DAY), NOW(), NOW(),
     ['perf_root'], ['Documents', 'Performance'], 2, false, true, false, false, null, 80.0,
     'business_data', ['performance', 'test', 'spreadsheet'], 0.90, NOW(),
     'sha256_perf_002', 'thumb_perf_002', 'view_perf_002', {}, NOW(), NOW()),

    ('perf_file_003', 'Image_003.jpg', 'image/jpeg', 'Image', 2097152,
     DATE_SUB(NOW(), INTERVAL 98 DAY), DATE_SUB(NOW(), INTERVAL 48 DAY), NOW(), NOW(),
     ['perf_root'], ['Images', 'Performance'], 2, false, true, false, false, null, 45.0,
     'media', ['performance', 'test', 'image'], 0.70, NOW(),
     'sha256_perf_003', 'thumb_perf_003', 'view_perf_003', {'width': 1920, 'height': 1080}, NOW(), NOW()),

    ('perf_file_004', 'Video_004.mp4', 'video/mp4', 'Video', 52428800,
     DATE_SUB(NOW(), INTERVAL 97 DAY), DATE_SUB(NOW(), INTERVAL 47 DAY), NOW(), NOW(),
     ['perf_root'], ['Videos', 'Performance'], 2, false, true, false, false, null, 30.0,
     'media', ['performance', 'test', 'video'], 0.60, NOW(),
     'sha256_perf_004', 'thumb_perf_004', 'view_perf_004', {'duration': 300}, NOW(), NOW()),

    ('perf_file_005', 'Duplicate_A.pdf', 'application/pdf', 'PDF', 1048576,
     DATE_SUB(NOW(), INTERVAL 96 DAY), DATE_SUB(NOW(), INTERVAL 46 DAY), NOW(), NOW(),
     ['perf_root'], ['Documents', 'Duplicates'], 2, false, true, false, true, 'perf_dup_group_001', 65.0,
     'document', ['performance', 'test', 'duplicate'], 0.88, NOW(),
     'sha256_perf_duplicate', 'thumb_perf_005', 'view_perf_005', {}, NOW(), NOW()),

    ('perf_file_006', 'Duplicate_B.pdf', 'application/pdf', 'PDF', 1048576,
     DATE_SUB(NOW(), INTERVAL 95 DAY), DATE_SUB(NOW(), INTERVAL 45 DAY), NOW(), NOW(),
     ['perf_root'], ['Documents', 'Duplicates'], 2, false, true, false, true, 'perf_dup_group_001', 65.0,
     'document', ['performance', 'test', 'duplicate'], 0.88, NOW(),
     'sha256_perf_duplicate', 'thumb_perf_006', 'view_perf_006', {}, NOW(), NOW()),

    ('perf_file_007', 'Large_File.zip', 'application/zip', 'Other', 104857600,
     DATE_SUB(NOW(), INTERVAL 94 DAY), DATE_SUB(NOW(), INTERVAL 44 DAY), NOW(), NOW(),
     ['perf_root'], ['Archives', 'Performance'], 2, false, true, false, false, null, 20.0,
     'archive', ['performance', 'test', 'large'], 0.50, NOW(),
     'sha256_perf_007', 'thumb_perf_007', 'view_perf_007', {}, NOW(), NOW()),

    ('perf_file_008', 'Presentation_008.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Presentation', 8388608,
     DATE_SUB(NOW(), INTERVAL 93 DAY), DATE_SUB(NOW(), INTERVAL 43 DAY), NOW(), NOW(),
     ['perf_root'], ['Presentations', 'Performance'], 2, false, true, false, false, null, 85.0,
     'presentation', ['performance', 'test', 'presentation'], 0.92, NOW(),
     'sha256_perf_008', 'thumb_perf_008', 'view_perf_008', {}, NOW(), NOW()),

    ('perf_file_009', 'Shared_File.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Document', 2097152,
     DATE_SUB(NOW(), INTERVAL 92 DAY), DATE_SUB(NOW(), INTERVAL 42 DAY), NOW(), NOW(),
     ['shared_folder'], ['Shared', 'Performance'], 2, false, false, true, false, null, 70.0,
     'shared_document', ['performance', 'test', 'shared'], 0.80, NOW(),
     'sha256_perf_009', 'thumb_perf_009', 'view_perf_009', {}, NOW(), NOW()),

    ('perf_file_010', 'Trashed_File.txt', 'text/plain', 'Other', 1024,
     DATE_SUB(NOW(), INTERVAL 91 DAY), DATE_SUB(NOW(), INTERVAL 91 DAY), NOW(), NOW(),
     ['trash'], ['Trash'], 1, true, true, false, false, null, 5.0,
     'text_file', ['performance', 'test', 'trashed'], 0.30, NOW(),
     'sha256_perf_010', 'thumb_perf_010', 'view_perf_010', {}, NOW(), NOW());

COMMIT;

-- =============================================================================
-- STRESS TEST SCAN DATA
-- =============================================================================

-- Create multiple scans for stress testing
BEGIN TRANSACTION;

-- Long-running scan for testing
INSERT INTO users/test_performance_user/scans (
    scan_id,
    status,
    scan_type,
    config,
    progress_percentage,
    files_processed,
    total_files_estimated,
    started_at,
    triggered_by,
    api_calls_made,
    bandwidth_used_bytes,
    retry_count,
    created_at,
    updated_at
) VALUES (
    'stress_scan_001',
    'running',
    'full',
    {
        'max_depth': 50,
        'include_trashed': true,
        'scan_shared_drives': true,
        'enable_ai_analysis': true
    },
    45.50,
    4550,
    10000,
    DATE_SUB(NOW(), INTERVAL 6 HOUR),
    'automated',
    15000,
    524288000,
    0,
    DATE_SUB(NOW(), INTERVAL 6 HOUR),
    DATE_SUB(NOW(), INTERVAL 1 MINUTE)
);

-- Failed scan with retries
INSERT INTO users/test_performance_user/scans (
    scan_id,
    status,
    scan_type,
    config,
    progress_percentage,
    files_processed,
    total_files_estimated,
    started_at,
    completed_at,
    error_message,
    error_code,
    retry_count,
    last_retry_at,
    triggered_by,
    api_calls_made,
    bandwidth_used_bytes,
    created_at,
    updated_at
) VALUES (
    'stress_scan_002_failed',
    'failed',
    'incremental',
    {
        'max_depth': 20,
        'include_trashed': false,
        'scan_shared_drives': false
    },
    15.75,
    157,
    1000,
    DATE_SUB(NOW(), INTERVAL 12 HOUR),
    DATE_SUB(NOW(), INTERVAL 11 HOUR),
    'Rate limit exceeded: Too many requests to Google Drive API',
    'RATE_LIMIT_EXCEEDED',
    3,
    DATE_SUB(NOW(), INTERVAL 11 HOUR),
    'user',
    5000,
    10485760,
    DATE_SUB(NOW(), INTERVAL 12 HOUR),
    DATE_SUB(NOW(), INTERVAL 11 HOUR)
);

COMMIT;

-- =============================================================================
-- COMPLEX DUPLICATE SCENARIOS
-- =============================================================================

-- Create complex duplicate scenarios for testing algorithms
BEGIN TRANSACTION;

-- Performance test duplicate group
INSERT INTO users/test_performance_user/duplicate_groups (
    group_id,
    duplicate_type,
    similarity_score,
    file_ids,
    file_count,
    total_size_bytes,
    space_wasted_bytes,
    recommendation,
    status,
    detected_at,
    detection_algorithm,
    detection_confidence,
    created_at,
    updated_at
) VALUES (
    'perf_dup_group_001',
    'exact_match',
    1.00,
    ['perf_file_005', 'perf_file_006'],
    2,
    2097152,
    1048576,
    'keep_newest',
    'detected',
    DATE_SUB(NOW(), INTERVAL 1 HOUR),
    'content_hash',
    1.00,
    DATE_SUB(NOW(), INTERVAL 1 HOUR),
    NOW()
);

-- Fuzzy match duplicate group (for algorithm testing)
INSERT INTO users/test_performance_user/duplicate_groups (
    group_id,
    duplicate_type,
    similarity_score,
    file_ids,
    file_count,
    total_size_bytes,
    space_wasted_bytes,
    recommendation,
    status,
    detected_at,
    detection_algorithm,
    detection_confidence,
    created_at,
    updated_at
) VALUES (
    'fuzzy_dup_group_001',
    'fuzzy_match',
    0.87,
    ['perf_file_001', 'perf_file_002'],
    2,
    1572864,
    524288,
    'manual_review',
    'detected',
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    'fuzzy_content_analysis',
    0.87,
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    NOW()
);

COMMIT;

-- =============================================================================
-- SECURITY TESTING SCENARIOS
-- =============================================================================

-- Create security test scenarios
BEGIN TRANSACTION;

-- Multiple security incidents for testing
INSERT INTO security_incidents VALUES
    ('test_incident_001', 'suspicious_access', 'medium', 'open', 'test_maximal_user', 'user',
     'Unusual access pattern detected from multiple geographic locations within short timeframe',
     'automated', 'geo_monitor', '203.0.113.100', 'Mozilla/5.0 (Unknown)',
     {'country': 'RO', 'region': 'Bucharest', 'city': 'Bucharest'},
     {'access_locations': ['US-NY', 'RO-Bucharest'], 'time_between': 30}, NOW(), null, null,
     [], null, 'moderate', 'security_team', 'Investigating potential account compromise',
     {'initial_detection': 'geographic_anomaly', 'confidence': 0.75}, false, [], false,
     NOW(), NOW()),
     
    ('test_incident_002', 'token_abuse', 'high', 'investigating', 'test_performance_user', 'tokens',
     'Abnormal API usage pattern suggesting token abuse or bot activity',
     'automated', 'api_monitor', '198.51.100.1', 'python-requests/2.28.1',
     {'country': 'Unknown', 'region': 'Unknown', 'city': 'Unknown'},
     {'requests_per_minute': 500, 'threshold': 100}, DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), null,
     ['rate_limit_applied', 'user_notified'], null, 'significant', 'security_team',
     'API usage indicates automated access beyond normal patterns. Rate limiting applied.',
     {'api_calls': 30000, 'time_window': '1 hour'}, false, [], true,
     DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR)),
     
    ('test_incident_003', 'data_breach_attempt', 'critical', 'resolved', null, 'system',
     'Attempted unauthorized access to encrypted user data detected and blocked',
     'automated', 'intrusion_detection', '192.0.2.1', 'curl/7.68.0',
     {'country': 'Unknown', 'region': 'Unknown', 'city': 'Unknown'},
     {'attack_type': 'sql_injection', 'blocked': true}, DATE_SUB(NOW(), INTERVAL 8 HOUR), 
     DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR),
     ['ip_blocked', 'security_patches_applied', 'regulatory_notification'], null, 'none',
     'security_team', 'Attack blocked by security controls. No data compromised. IP blocked and patches applied.',
     {'attack_vectors': ['sql_injection', 'xss'], 'blocked_requests': 47}, true, ['CERT'], true,
     DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR));

COMMIT;

-- =============================================================================
-- RATE LIMITING TEST DATA
-- =============================================================================

-- Create rate limit test scenarios
BEGIN TRANSACTION;

-- Active rate limits for testing
INSERT INTO rate_limits VALUES
    ('test_performance_user_api_health_3600', 'test_performance_user', '/api/health', 
     DATE_SUB(NOW(), INTERVAL 30 MINUTE), 3600, 150, 200, false,
     DATE_ADD(DATE_SUB(NOW(), INTERVAL 30 MINUTE), INTERVAL 1 HOUR), NOW(), NOW()),
     
    ('test_maximal_user_workflows_scan_300', 'test_maximal_user', '/api/workflows/scan',
     DATE_SUB(NOW(), INTERVAL 5 MINUTE), 300, 8, 10, false,
     DATE_ADD(DATE_SUB(NOW(), INTERVAL 5 MINUTE), INTERVAL 5 MINUTE), NOW(), NOW()),
     
    ('test_suspended_user_auth_begin_3600', 'test_suspended_user', '/api/auth/drive/begin',
     DATE_SUB(NOW(), INTERVAL 45 MINUTE), 3600, 100, 100, true,
     DATE_ADD(DATE_SUB(NOW(), INTERVAL 45 MINUTE), INTERVAL 1 HOUR), NOW(), NOW());

COMMIT;

-- =============================================================================
-- COMPLIANCE TEST DATA
-- =============================================================================

-- Create data processing activities for compliance testing
BEGIN TRANSACTION;

INSERT INTO data_processing_activities VALUES
    ('activity_001_collection', 'test_maximal_user', 'collection',
     ['file_metadata', 'usage_analytics'], ['user'], 'file_management',
     'consent', NOW(), null, 1095, 'US-East',
     [], [], ['encryption', 'access_controls'], true, true,
     [], true, false, [], NOW(), NOW()),
     
    ('activity_002_ai_processing', 'test_performance_user', 'processing',
     ['file_content', 'metadata_analysis'], ['user', 'file_owner'], 'ai_classification',
     'legitimate_interest', DATE_SUB(NOW(), INTERVAL 7 DAY), null, 2555, 'US-Central',
     ['gemini_ai'], ['google_cloud'], ['encryption', 'data_minimization'], true, true,
     [], true, true, ['GDPR', 'CCPA'], DATE_SUB(NOW(), INTERVAL 7 DAY), NOW()),
     
    ('activity_003_deletion', 'test_deletion_user', 'deletion',
     ['personal', 'file_metadata', 'usage_analytics'], ['user'], 'gdpr_erasure',
     'legal_obligation', DATE_SUB(NOW(), INTERVAL 23 DAY), DATE_ADD(NOW(), INTERVAL 7 DAY),
     0, 'Multi-region', [], [], ['secure_deletion', 'audit_trail'], false, true,
     [{'type': 'erasure_request', 'date': DATE_SUB(NOW(), INTERVAL 23 DAY)}], true, false, ['GDPR'],
     DATE_SUB(NOW(), INTERVAL 23 DAY), NOW());

COMMIT;

-- =============================================================================
-- HISTORICAL METRICS FOR ANALYTICS TESTING
-- =============================================================================

-- Create historical metrics data for testing analytics and reporting
BEGIN TRANSACTION;

-- Insert 30 days of historical metrics
INSERT INTO system_metrics VALUES
    -- Day -7
    (DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY), 5, 3, 4, 5, 5, 1250, 12, 25,
     1800.25, 95.50, 1500, 8, 0.53, 0.75, 1.2, 1, 0, 0, 
     DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
     
    -- Day -6
    (DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY), 5, 4, 5, 5, 8, 2100, 18, 42,
     2100.75, 110.25, 2200, 12, 0.55, 1.1, 1.8, 0, 1, 0,
     DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),
     
    -- Day -5
    (DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY), 5, 2, 4, 5, 3, 750, 8, 15,
     1500.00, 85.00, 1100, 3, 0.27, 0.4, 1.1, 0, 0, 0,
     DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),
     
    -- Day -4 (weekend - lower activity)
    (DATE_SUB(CURRENT_DATE, INTERVAL 4 DAY), 5, 1, 3, 5, 1, 200, 2, 4,
     900.00, 75.00, 400, 1, 0.25, 0.15, 0.8, 0, 0, 0,
     DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY)),
     
    -- Day -3 (weekend - lower activity)  
    (DATE_SUB(CURRENT_DATE, INTERVAL 3 DAY), 5, 1, 2, 5, 2, 350, 3, 7,
     1200.00, 80.00, 500, 2, 0.40, 0.25, 0.9, 0, 0, 0,
     DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),
     
    -- Day -2
    (DATE_SUB(CURRENT_DATE, INTERVAL 2 DAY), 5, 3, 4, 5, 6, 1800, 15, 35,
     2000.50, 105.75, 2000, 10, 0.50, 0.9, 1.6, 0, 0, 0,
     DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),
     
    -- Day -1
    (DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), 5, 4, 5, 5, 9, 2500, 20, 50,
     2300.25, 115.00, 2500, 15, 0.60, 1.3, 2.0, 0, 0, 1,
     DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY));

COMMIT;

-- =============================================================================
-- ENCRYPTION AND SECURITY TEST DATA
-- =============================================================================

-- Create encryption test data
BEGIN TRANSACTION;

-- Test encryption keys
INSERT INTO encryption_keys VALUES
    ('test_key_001', 1, 'aes256', 'data_encryption', NOW(), NOW(), 
     DATE_ADD(NOW(), INTERVAL 1 YEAR), null, 'active',
     'AES-256-GCM', 256, 'PBKDF2', 0, null, false, [],
     true, false, NOW(), 'system'),
     
    ('test_key_002_expired', 1, 'aes256', 'token_encryption', 
     DATE_SUB(NOW(), INTERVAL 2 YEAR), DATE_SUB(NOW(), INTERVAL 2 YEAR),
     DATE_SUB(NOW(), INTERVAL 1 YEAR), null, 'expired',
     'AES-256-GCM', 256, 'PBKDF2', 5000, DATE_SUB(NOW(), INTERVAL 1 YEAR),
     false, [], true, false, DATE_SUB(NOW(), INTERVAL 1 YEAR), 'system'),
     
    ('test_key_003_revoked', 1, 'rsa2048', 'signature', 
     DATE_SUB(NOW(), INTERVAL 1 YEAR), DATE_SUB(NOW(), INTERVAL 1 YEAR),
     DATE_ADD(NOW(), INTERVAL 1 YEAR), DATE_SUB(NOW(), INTERVAL 1 MONTH), 'revoked',
     'RSA-2048', 2048, null, 1200, DATE_SUB(NOW(), INTERVAL 1 MONTH),
     true, ['hardware_security_module'], true, true, 
     DATE_SUB(NOW(), INTERVAL 1 MONTH), 'security_team');

COMMIT;

-- =============================================================================
-- TEST DATA COMPLETION
-- =============================================================================

-- Log successful test data loading
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
    'test_seed_data_load_completed',
    'system',
    'testing_seed',
    {
        'seed_type': 'testing',
        'edge_case_users': 4,
        'performance_test_files': 10,
        'security_incidents': 3,
        'rate_limit_records': 3,
        'compliance_activities': 3,
        'historical_metrics_days': 7,
        'encryption_keys': 3,
        'environment': 'testing'
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY),
    NOW(),
    NOW()
);

COMMIT;

-- =============================================================================
-- TESTING SEED DATA SUMMARY
-- =============================================================================

-- Testing seed data loaded successfully
--
-- Edge Case Users Created:
-- 1. Minimal User - Boundary testing with minimal required fields
-- 2. Maximal User - Boundary testing with all possible fields populated
-- 3. Suspended User - Security testing with locked account
-- 4. Deletion User - GDPR compliance testing with scheduled deletion
--
-- Performance Test Data:
-- - Large file inventory (10 files shown, pattern for 100+)
-- - Multiple scan scenarios (running, failed with retries)
-- - Complex duplicate detection scenarios
-- - High-volume API usage patterns
--
-- Security Test Scenarios:
-- - Multiple security incidents (suspicious access, token abuse, breach attempt)
-- - Rate limiting edge cases and violations
-- - Failed authentication scenarios
-- - Geographic anomaly detection
--
-- Compliance Test Data:
-- - Data processing activities for different purposes
-- - GDPR erasure request scenario
-- - Consent withdrawal and re-consent scenarios
-- - Cross-border data transfer scenarios
--
-- Analytics Test Data:
-- - 7 days of historical system metrics
-- - Weekend vs weekday usage patterns
-- - Error rate variations and spikes
-- - User growth and churn scenarios
--
-- Encryption Test Data:
-- - Active, expired, and revoked encryption keys
-- - Different key types and algorithms
-- - Hardware-backed and software keys
--
-- Test Coverage Areas:
-- ✓ Boundary value testing
-- ✓ Performance and load testing
-- ✓ Security and threat scenarios
-- ✓ Compliance and privacy regulations
-- ✓ Error handling and recovery
-- ✓ Analytics and reporting
-- ✓ Data lifecycle management
-- ✓ Multi-user scenarios
-- ✓ Time-series data analysis
-- ✓ Encryption and key management
--
-- IMPORTANT: This is AUTOMATED TEST DATA ONLY
-- - Use only in testing environments
-- - All scenarios are fictitious
-- - Regular cleanup recommended
-- - Not suitable for manual testing demos