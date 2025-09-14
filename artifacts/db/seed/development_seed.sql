-- DriveMind Development Seed Data
-- Version: 1.0.0
-- Last Updated: 2025-09-12
-- Purpose: Safe development and testing data for DriveMind
-- Standards: ALPHA-CODENAME v1.4 compliant
--
-- This seed data creates realistic but safe test data for development
-- and testing environments. All data is clearly marked as test data
-- and should never be used in production.

-- =============================================================================
-- SEED DATA SAFETY CHECKS
-- =============================================================================

-- Verify this is not a production environment
-- This should be enforced at the application level
-- DO NOT LOAD SEED DATA IN PRODUCTION

-- Log seed data loading
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
    'seed_data_load_initiated',
    'system',
    'development_seed',
    {
        'seed_type': 'development',
        'environment': 'development',
        'warning': 'test_data_only'
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 90 DAY), -- Short retention for seed logs
    NOW(),
    NOW()
);

-- =============================================================================
-- TEST USER ACCOUNTS
-- =============================================================================

-- Create realistic test user accounts for development
BEGIN TRANSACTION;

-- Test User 1: Basic user with typical usage patterns
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
    
    -- Security fields
    security_status,
    mfa_enabled,
    failed_login_attempts,
    last_successful_login_at,
    last_login_ip,
    email_verified,
    gdpr_consent_given,
    gdpr_consent_date,
    data_processing_consent,
    risk_score,
    data_retention_policy
) VALUES (
    'test_user_001_dev',
    'testuser1@drivemind-dev.local',
    'Alice Developer',
    'https://via.placeholder.com/150/4CAF50/FFFFFF?text=AD',
    'google.com',
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    NOW(),
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    {
        'theme': 'light',
        'language': 'en',
        'timezone': 'America/New_York',
        'notifications_enabled': true,
        'dashboard_layout': 'default'
    },
    {
        'ai_enabled': true,
        'background_scans': true,
        'batch_operations': false
    },
    {
        'max_files': 50000,
        'max_scans_per_day': 5,
        'max_ai_requests_per_day': 100
    },
    true,
    false,
    
    'active',
    false,
    0,
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    '192.168.1.100',
    true,
    true,
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    true,
    0.15,
    'standard'
);

-- Test User 2: Premium user with advanced features
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
    is_premium,
    subscription_expires_at,
    security_status,
    mfa_enabled,
    email_verified,
    gdpr_consent_given,
    gdpr_consent_date,
    data_processing_consent,
    marketing_consent,
    risk_score,
    data_retention_policy
) VALUES (
    'test_user_002_premium',
    'premium.user@drivemind-dev.local',
    'Bob Premium',
    'google.com',
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    NOW(),
    DATE_SUB(NOW(), INTERVAL 30 MINUTE),
    {
        'theme': 'dark',
        'language': 'en',
        'timezone': 'Europe/London',
        'notifications_enabled': true,
        'dashboard_layout': 'advanced',
        'ai_suggestions_enabled': true
    },
    {
        'ai_enabled': true,
        'background_scans': true,
        'batch_operations': true
    },
    {
        'max_files': 100000,
        'max_scans_per_day': 20,
        'max_ai_requests_per_day': 1000
    },
    true,
    true,
    DATE_ADD(NOW(), INTERVAL 11 MONTH),
    'active',
    true,
    true,
    true,
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    true,
    true,
    0.08,
    'extended'
);

-- Test User 3: Test admin user
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
    'test_admin_001',
    'admin@drivemind-dev.local',
    'System Admin',
    'google.com',
    DATE_SUB(NOW(), INTERVAL 180 DAY),
    NOW(),
    DATE_SUB(NOW(), INTERVAL 5 MINUTE),
    true,
    true,
    'active',
    true,
    true,
    DATE_SUB(NOW(), INTERVAL 180 DAY),
    true,
    0.02,
    'extended'
);

COMMIT;

-- =============================================================================
-- TEST OAUTH TOKENS (ENCRYPTED PLACEHOLDERS)
-- =============================================================================

-- Create OAuth token records for testing
-- Note: These are placeholder tokens for testing - not real credentials
BEGIN TRANSACTION;

INSERT INTO users/test_user_001_dev/secrets (
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
    
    -- Security fields
    token_encrypted_at,
    encryption_key_version,
    device_fingerprint,
    user_agent_hash,
    gdrive_permissions_granted,
    permission_audit_date
) VALUES (
    'googleDrive',
    'ENCRYPTED_TEST_REFRESH_TOKEN_001',
    DATE_ADD(NOW(), INTERVAL 1 HOUR),
    ['https://www.googleapis.com/auth/drive'],
    1,
    true,
    45,
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    NOW(),
    
    NOW(),
    1,
    'test_device_fingerprint_001',
    'sha256_user_agent_hash_001',
    ['https://www.googleapis.com/auth/drive'],
    NOW()
);

INSERT INTO users/test_user_002_premium/secrets (
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
    user_agent_hash,
    gdrive_permissions_granted,
    permission_audit_date
) VALUES (
    'googleDrive',
    'ENCRYPTED_TEST_REFRESH_TOKEN_002',
    DATE_ADD(NOW(), INTERVAL 1 HOUR),
    ['https://www.googleapis.com/auth/drive'],
    1,
    true,
    128,
    DATE_SUB(NOW(), INTERVAL 30 MINUTE),
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    NOW(),
    NOW(),
    1,
    'test_device_fingerprint_002',
    'sha256_user_agent_hash_002',
    ['https://www.googleapis.com/auth/drive'],
    NOW()
);

COMMIT;

-- =============================================================================
-- TEST ROLE ASSIGNMENTS
-- =============================================================================

-- Assign roles to test users
BEGIN TRANSACTION;

INSERT INTO users/test_user_001_dev/role_assignments (
    assignment_id,
    role_id,
    assigned_by,
    assigned_at,
    is_active,
    created_at,
    updated_at
) VALUES (
    'assignment_001_basic',
    'role_basic_user',
    'system',
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    true,
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    NOW()
);

INSERT INTO users/test_user_002_premium/role_assignments (
    assignment_id,
    role_id,
    assigned_by,
    assigned_at,
    is_active,
    created_at,
    updated_at
) VALUES (
    'assignment_002_premium',
    'role_premium_user',
    'system',
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    true,
    DATE_SUB(NOW(), INTERVAL 90 DAY),
    NOW()
);

INSERT INTO users/test_admin_001/role_assignments (
    assignment_id,
    role_id,
    assigned_by,
    assigned_at,
    is_active,
    created_at,
    updated_at
) VALUES (
    'assignment_003_admin',
    'role_admin',
    'system',
    DATE_SUB(NOW(), INTERVAL 180 DAY),
    true,
    DATE_SUB(NOW(), INTERVAL 180 DAY),
    NOW()
);

COMMIT;

-- =============================================================================
-- TEST FILE INVENTORY DATA
-- =============================================================================

-- Create realistic file inventory for testing
BEGIN TRANSACTION;

-- User 1 file inventory (typical small business user)
INSERT INTO users/test_user_001_dev/inventory VALUES
    ('test_file_001_doc', 'Project Proposal Draft', 'application/vnd.google-apps.document', 'Document', 2048,
     DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['root_folder_001'], ['Documents', 'Projects'], 2, false, true, false, false, null, 85.5,
     'business_document', ['proposal', 'draft', 'important'], 0.92, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_doc_001', 'thumb_001', 'view_001', {}, NOW(), NOW()),
     
    ('test_file_002_sheet', 'Budget Tracker 2024', 'application/vnd.google-apps.spreadsheet', 'Spreadsheet', 4096,
     DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['root_folder_002'], ['Documents', 'Finance'], 2, false, true, false, false, null, 95.0,
     'financial_data', ['budget', 'tracking', 'finance'], 0.98, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_sheet_001', 'thumb_002', 'view_002', {}, NOW(), NOW()),
     
    ('test_file_003_img', 'Team Photo.jpg', 'image/jpeg', 'Image', 1048576,
     DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['root_folder_003'], ['Photos', 'Work'], 2, false, true, false, false, null, 25.0,
     'personal_photo', ['team', 'work', 'photo'], 0.65, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_img_001', 'thumb_003', 'view_003', {'width': 1920, 'height': 1080}, NOW(), NOW()),
     
    ('test_file_004_pdf', 'Invoice_Template.pdf', 'application/pdf', 'PDF', 512000,
     DATE_SUB(NOW(), INTERVAL 60 DAY), DATE_SUB(NOW(), INTERVAL 60 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['root_folder_002'], ['Documents', 'Templates'], 2, false, true, false, true, 'duplicate_group_001', 60.0,
     'template', ['invoice', 'template', 'business'], 0.88, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_pdf_duplicate', 'thumb_004', 'view_004', {}, NOW(), NOW()),
     
    ('test_file_005_pdf_dup', 'Invoice Template (Copy).pdf', 'application/pdf', 'PDF', 512000,
     DATE_SUB(NOW(), INTERVAL 59 DAY), DATE_SUB(NOW(), INTERVAL 59 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['root_folder_002'], ['Documents', 'Templates'], 2, false, true, false, true, 'duplicate_group_001', 60.0,
     'template', ['invoice', 'template', 'business'], 0.88, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_pdf_duplicate', 'thumb_005', 'view_005', {}, NOW(), NOW());

-- User 2 file inventory (premium user with more complex data)
INSERT INTO users/test_user_002_premium/inventory VALUES
    ('premium_file_001', 'Annual Report 2024', 'application/vnd.google-apps.presentation', 'Presentation', 8192000,
     DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['premium_folder_001'], ['Presentations', 'Reports'], 2, false, true, true, false, null, 98.0,
     'business_report', ['annual', 'report', 'presentation'], 0.99, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_pres_001', 'thumb_prem_001', 'view_prem_001', {}, NOW(), NOW()),
     
    ('premium_file_002', 'Client Database.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Spreadsheet', 2048000,
     DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['premium_folder_002'], ['Data', 'Clients'], 2, false, true, false, false, null, 99.0,
     'customer_data', ['clients', 'database', 'sensitive'], 0.97, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_data_001', 'thumb_prem_002', 'view_prem_002', {}, NOW(), NOW()),
     
    ('premium_file_003', 'Marketing Video.mp4', 'video/mp4', 'Video', 104857600,
     DATE_SUB(NOW(), INTERVAL 21 DAY), DATE_SUB(NOW(), INTERVAL 21 DAY), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
     ['premium_folder_003'], ['Media', 'Marketing'], 2, false, true, false, false, null, 75.0,
     'marketing_content', ['video', 'marketing', 'media'], 0.85, DATE_SUB(NOW(), INTERVAL 1 DAY),
     'sha256_video_001', 'thumb_prem_003', 'view_prem_003', {'duration': 180}, NOW(), NOW());

COMMIT;

-- =============================================================================
-- TEST SCAN DATA
-- =============================================================================

-- Create test scan records
BEGIN TRANSACTION;

-- Completed scan for user 1
INSERT INTO users/test_user_001_dev/scans (
    scan_id,
    status,
    scan_type,
    config,
    progress_percentage,
    files_processed,
    total_files_estimated,
    started_at,
    completed_at,
    processing_duration_seconds,
    results,
    triggered_by,
    api_calls_made,
    bandwidth_used_bytes,
    created_at,
    updated_at
) VALUES (
    'scan_001_completed',
    'completed',
    'full',
    {
        'max_depth': 20,
        'include_trashed': false,
        'scan_shared_drives': false,
        'enable_ai_analysis': true
    },
    100.00,
    5,
    5,
    DATE_SUB(NOW(), INTERVAL 25 HOUR),
    DATE_SUB(NOW(), INTERVAL 24 HOUR),
    3600,
    {
        'total_files': 5,
        'duplicates_found': 2,
        'ai_classifications': 5,
        'large_files': 1,
        'storage_used_gb': 0.12
    },
    'user',
    150,
    1048576,
    DATE_SUB(NOW(), INTERVAL 25 HOUR),
    DATE_SUB(NOW(), INTERVAL 24 HOUR)
);

-- Running scan for user 2
INSERT INTO users/test_user_002_premium/scans (
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
    created_at,
    updated_at
) VALUES (
    'scan_002_running',
    'running',
    'full',
    {
        'max_depth': 50,
        'include_trashed': true,
        'scan_shared_drives': true,
        'enable_ai_analysis': true
    },
    65.00,
    650,
    1000,
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    'user',
    2500,
    52428800,
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    DATE_SUB(NOW(), INTERVAL 5 MINUTE)
);

COMMIT;

-- =============================================================================
-- TEST DUPLICATE GROUPS
-- =============================================================================

-- Create test duplicate group
BEGIN TRANSACTION;

INSERT INTO users/test_user_001_dev/duplicate_groups (
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
    'duplicate_group_001',
    'exact_match',
    1.00,
    ['test_file_004_pdf', 'test_file_005_pdf_dup'],
    2,
    1024000,
    512000,
    'keep_newest',
    'detected',
    DATE_SUB(NOW(), INTERVAL 24 HOUR),
    'content_hash',
    1.00,
    DATE_SUB(NOW(), INTERVAL 24 HOUR),
    DATE_SUB(NOW(), INTERVAL 24 HOUR)
);

COMMIT;

-- =============================================================================
-- TEST ORGANIZATION RULES
-- =============================================================================

-- Create test organization rules
BEGIN TRANSACTION;

INSERT INTO users/test_user_001_dev/organization_rules (
    rule_id,
    name,
    description,
    pattern,
    action,
    target,
    conditions,
    is_active,
    priority,
    auto_apply,
    created_by,
    ai_confidence,
    ai_reasoning,
    validation_status,
    created_at,
    updated_at
) VALUES (
    'rule_001_invoices',
    'Auto-organize Invoices',
    'Automatically move invoice files to the Finance folder',
    'invoice.*\\.(pdf|doc|docx)',
    'move',
    '/Documents/Finance/Invoices',
    {
        'file_types': ['PDF', 'Document'],
        'name_pattern': 'invoice.*',
        'size_range': {'min': 1000},
        'ai_category': 'financial_data'
    },
    true,
    10,
    true,
    'ai',
    0.95,
    'High confidence pattern match for invoice files based on naming convention and content analysis',
    'valid',
    DATE_SUB(NOW(), INTERVAL 20 DAY),
    NOW()
);

INSERT INTO users/test_user_002_premium/organization_rules (
    rule_id,
    name,
    description,
    pattern,
    action,
    target,
    conditions,
    is_active,
    priority,
    auto_apply,
    times_applied,
    files_affected,
    last_applied_at,
    created_by,
    ai_confidence,
    validation_status,
    created_at,
    updated_at
) VALUES (
    'rule_002_media',
    'Media File Organization',
    'Organize media files by type and date',
    '\\.(jpg|jpeg|png|mp4|mov|avi)$',
    'organize',
    '/Media/{year}/{month}',
    {
        'file_types': ['Image', 'Video'],
        'size_range': {'min': 100000}
    },
    true,
    20,
    false,
    8,
    45,
    DATE_SUB(NOW(), INTERVAL 3 DAY),
    'user',
    null,
    'valid',
    DATE_SUB(NOW(), INTERVAL 60 DAY),
    NOW()
);

COMMIT;

-- =============================================================================
-- TEST SYSTEM METRICS
-- =============================================================================

-- Create historical system metrics for testing
BEGIN TRANSACTION;

-- Current day metrics
INSERT INTO system_metrics (
    metric_date,
    total_users,
    active_users_daily,
    active_users_weekly,
    active_users_monthly,
    total_scans_completed,
    total_files_processed,
    total_duplicates_detected,
    total_ai_insights_generated,
    avg_scan_duration_seconds,
    avg_api_response_time_ms,
    total_api_calls,
    total_errors,
    error_rate_percentage,
    total_bandwidth_gb,
    total_storage_gb,
    new_signups,
    premium_conversions,
    churn_count,
    created_at,
    updated_at
) VALUES (
    CURRENT_DATE,
    3, 2, 3, 3,
    2, 655, 2, 8,
    2400.50, 125.75, 2750, 5, 0.18,
    0.15, 0.25,
    0, 0, 0,
    NOW(), NOW()
);

-- Previous day metrics
INSERT INTO system_metrics (
    metric_date,
    total_users, active_users_daily, active_users_weekly, active_users_monthly,
    total_scans_completed, total_files_processed, total_duplicates_detected, total_ai_insights_generated,
    avg_scan_duration_seconds, avg_api_response_time_ms, total_api_calls, total_errors, error_rate_percentage,
    total_bandwidth_gb, total_storage_gb, new_signups, premium_conversions, churn_count,
    created_at, updated_at
) VALUES (
    DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY),
    3, 1, 2, 3,
    1, 5, 1, 5,
    3600.00, 135.25, 150, 2, 1.33,
    0.05, 0.12,
    1, 0, 0,
    DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)
);

COMMIT;

-- =============================================================================
-- TEST AUDIT LOGS
-- =============================================================================

-- Create test audit log entries
BEGIN TRANSACTION;

INSERT INTO audit_logs VALUES
    (UUID(), 'auth', 'login_success', 'test_user_001_dev', 'testuser1@drivemind-dev.local',
     {'login_method': 'oauth', 'device_type': 'desktop'}, 'req_001', 'sess_001', '/api/auth/drive/callback', 'POST',
     'internal', DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY), '192.168.1.100',
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'US', 'NY',
     DATE_SUB(NOW(), INTERVAL 2 HOUR), 150, NOW()),
     
    (UUID(), 'data_access', 'file_scan_initiated', 'test_user_001_dev', 'scan_001_completed',
     {'scan_type': 'full', 'files_estimated': 5}, 'req_002', 'sess_001', '/api/workflows/scan', 'POST',
     'internal', DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY), '192.168.1.100',
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'US', 'NY',
     DATE_SUB(NOW(), INTERVAL 25 HOUR), 2500, DATE_SUB(NOW(), INTERVAL 25 HOUR)),
     
    (UUID(), 'data_modification', 'duplicate_resolved', 'test_user_001_dev', 'duplicate_group_001',
     {'resolution_action': 'keep_newest', 'space_saved_bytes': 512000}, 'req_003', 'sess_002', '/api/workflows/duplicates', 'POST',
     'internal', DATE_ADD(CURRENT_DATE, INTERVAL 2555 DAY), '192.168.1.100',
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'US', 'NY',
     DATE_SUB(NOW(), INTERVAL 1 HOUR), 300, DATE_SUB(NOW(), INTERVAL 1 HOUR));

COMMIT;

-- =============================================================================
-- TEST SECURITY DATA
-- =============================================================================

-- Create test security incident (resolved)
BEGIN TRANSACTION;

INSERT INTO security_incidents (
    incident_id,
    incident_type,
    severity,
    status,
    user_id,
    resource_type,
    description,
    detection_method,
    detection_source,
    ip_address,
    user_agent,
    geographic_location,
    detected_at,
    investigated_at,
    resolved_at,
    actions_taken,
    estimated_impact,
    assigned_to,
    investigation_notes,
    user_notification_sent,
    created_at,
    updated_at
) VALUES (
    'incident_001_resolved',
    'auth_failure',
    'low',
    'resolved',
    'test_user_001_dev',
    'user',
    'Multiple failed login attempts detected from new location',
    'automated',
    'auth_monitor',
    '203.0.113.1',
    'Mozilla/5.0 (Unknown)',
    {'country': 'US', 'region': 'CA', 'city': 'Los Angeles'},
    DATE_SUB(NOW(), INTERVAL 48 HOUR),
    DATE_SUB(NOW(), INTERVAL 47 HOUR),
    DATE_SUB(NOW(), INTERVAL 46 HOUR),
    ['user_notified', 'password_reset_suggested'],
    'minimal',
    'security_team',
    'User confirmed legitimate login attempts from new device. False positive.',
    true,
    DATE_SUB(NOW(), INTERVAL 48 HOUR),
    DATE_SUB(NOW(), INTERVAL 46 HOUR)
);

COMMIT;

-- =============================================================================
-- TEST CONSENT RECORDS
-- =============================================================================

-- Create test consent records
BEGIN TRANSACTION;

INSERT INTO users/test_user_001_dev/consent_records (
    consent_id,
    consent_type,
    consent_given,
    consent_date,
    consent_method,
    consent_version,
    processing_purposes,
    data_categories,
    retention_period_days,
    consent_evidence,
    privacy_policy_version,
    created_at,
    updated_at
) VALUES (
    'consent_001_gdpr',
    'gdpr_general',
    true,
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    'explicit_opt_in',
    '1.0.0',
    ['file_management', 'ai_analysis', 'duplicate_detection'],
    ['file_metadata', 'usage_analytics'],
    1095, -- 3 years
    {
        'ip_address': '192.168.1.100',
        'timestamp': DATE_SUB(NOW(), INTERVAL 30 DAY),
        'form_id': 'registration_form_v1',
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    },
    'privacy_policy_v1.0.0',
    DATE_SUB(NOW(), INTERVAL 30 DAY),
    DATE_SUB(NOW(), INTERVAL 30 DAY)
);

INSERT INTO users/test_user_002_premium/consent_records VALUES
    ('consent_002_marketing', 'marketing', true, DATE_SUB(NOW(), INTERVAL 90 DAY), 'explicit_opt_in', '1.0.0',
     ['marketing_communications', 'product_updates'], ['email', 'usage_patterns'], 1095,
     {'ip_address': '10.0.0.1', 'timestamp': DATE_SUB(NOW(), INTERVAL 90 DAY)},
     'privacy_policy_v1.0.0', DATE_SUB(NOW(), INTERVAL 90 DAY), DATE_SUB(NOW(), INTERVAL 90 DAY)),
     
    ('consent_003_ai', 'ai_processing', true, DATE_SUB(NOW(), INTERVAL 90 DAY), 'explicit_opt_in', '1.0.0',
     ['file_classification', 'organization_suggestions'], ['file_metadata', 'content_analysis'], 1095,
     {'ip_address': '10.0.0.1', 'timestamp': DATE_SUB(NOW(), INTERVAL 90 DAY)},
     'privacy_policy_v1.0.0', DATE_SUB(NOW(), INTERVAL 90 DAY), DATE_SUB(NOW(), INTERVAL 90 DAY));

COMMIT;

-- =============================================================================
-- SEED DATA COMPLETION
-- =============================================================================

-- Log successful seed data loading
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
    'seed_data_load_completed',
    'system',
    'development_seed',
    {
        'seed_type': 'development',
        'users_created': 3,
        'files_created': 8,
        'scans_created': 2,
        'rules_created': 2,
        'incidents_created': 1,
        'consent_records': 3,
        'environment': 'development'
    },
    'internal',
    DATE_ADD(CURRENT_DATE, INTERVAL 90 DAY),
    NOW(),
    NOW()
);

COMMIT;

-- =============================================================================
-- SEED DATA SUMMARY
-- =============================================================================

-- Development seed data loaded successfully
--
-- Test Users Created:
-- 1. Alice Developer (test_user_001_dev) - Basic user with 5 files
-- 2. Bob Premium (test_user_002_premium) - Premium user with 3 files  
-- 3. System Admin (test_admin_001) - Admin user
--
-- Test Data Created:
-- - 3 users with realistic profiles and settings
-- - 2 OAuth token records (placeholder/encrypted)
-- - 3 role assignments (basic, premium, admin)
-- - 8 file inventory records with AI classifications
-- - 2 background scan records (1 completed, 1 running)
-- - 1 duplicate group with 2 duplicate files
-- - 2 organization rules (1 AI-generated, 1 user-created)
-- - 2 days of system metrics
-- - 3 audit log entries
-- - 1 resolved security incident
-- - 3 consent records for privacy compliance
--
-- This seed data provides:
-- - Realistic test scenarios for all major features
-- - Different user types and usage patterns
-- - Historical data for testing analytics and reporting
-- - Security and compliance test cases
-- - Performance testing with various file types and sizes
--
-- IMPORTANT: This is TEST DATA ONLY
-- - Never use in production
-- - All credentials are placeholders
-- - All personal data is fictitious
-- - Clean up regularly in development environments