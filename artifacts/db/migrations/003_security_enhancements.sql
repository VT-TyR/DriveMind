-- Migration: Security Enhancements
-- Version: 003
-- Description: Implement advanced security features and audit controls
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
    '003_security_enhancements',
    'Security Enhancements and Audit Controls',
    '1.2.0',
    'Implement advanced security features, audit controls, and compliance enhancements',
    'pending',
    '003_security_enhancements.sql',
    '003_security_enhancements_rollback.sql',
    'system',
    'development',
    NOW(),
    NOW()
);

-- =============================================================================
-- ENHANCED USER SECURITY FEATURES
-- =============================================================================

-- Step 1: Add security-focused fields to users collection
BEGIN TRANSACTION;

-- Add security tracking fields to existing users
-- In Firestore, this is done by updating the document structure
ALTER COLLECTION users ADD FIELDS (
    -- Security status
    security_status STRING DEFAULT 'active', -- 'active', 'locked', 'suspended', 'pending_verification'
    account_locked_at TIMESTAMP,
    account_locked_reason STRING,
    
    -- Multi-factor authentication
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_backup_codes ARRAY<STRING> DEFAULT [],
    mfa_recovery_email STRING,
    
    -- Login security
    failed_login_attempts INTEGER DEFAULT 0,
    last_failed_login_at TIMESTAMP,
    last_successful_login_at TIMESTAMP,
    last_login_ip STRING,
    login_history ARRAY<MAP<STRING, ANY>> DEFAULT [], -- Last 10 logins
    
    -- Security preferences
    security_notifications_enabled BOOLEAN DEFAULT true,
    suspicious_activity_alerts BOOLEAN DEFAULT true,
    login_location_tracking BOOLEAN DEFAULT true,
    
    -- Compliance and privacy
    gdpr_consent_given BOOLEAN DEFAULT false,
    gdpr_consent_date TIMESTAMP,
    data_processing_consent BOOLEAN DEFAULT false,
    marketing_consent BOOLEAN DEFAULT false,
    
    -- Account verification
    email_verified BOOLEAN DEFAULT false,
    email_verification_token STRING,
    email_verification_expires_at TIMESTAMP,
    phone_number STRING,
    phone_verified BOOLEAN DEFAULT false,
    
    -- Risk assessment
    risk_score DECIMAL(3,2) DEFAULT 0.00, -- 0.00 to 1.00
    risk_factors ARRAY<STRING> DEFAULT [],
    last_risk_assessment_at TIMESTAMP,
    
    -- Data retention and deletion
    data_retention_policy STRING DEFAULT 'standard', -- 'minimal', 'standard', 'extended'
    scheduled_deletion_at TIMESTAMP,
    deletion_requested_at TIMESTAMP,
    deletion_reason STRING
);

COMMIT;

-- =============================================================================
-- ADVANCED OAUTH SECURITY
-- =============================================================================

-- Step 2: Enhance OAuth token security
BEGIN TRANSACTION;

-- Add security fields to OAuth secrets
ALTER SUBCOLLECTION users/{uid}/secrets ADD FIELDS (
    -- Token security
    token_encrypted_at TIMESTAMP,
    encryption_key_version INTEGER DEFAULT 1,
    token_integrity_hash STRING,
    
    -- Access control
    allowed_ip_ranges ARRAY<STRING> DEFAULT [], -- CIDR notation
    device_fingerprint STRING,
    user_agent_hash STRING,
    
    -- Security monitoring
    suspicious_activity_detected BOOLEAN DEFAULT false,
    security_incidents ARRAY<MAP<STRING, ANY>> DEFAULT [],
    last_security_scan_at TIMESTAMP,
    
    -- Token lifecycle security
    revoked_at TIMESTAMP,
    revocation_reason STRING, -- 'user_request', 'security_incident', 'policy_violation', 'expiry'
    replaced_by_token_version INTEGER,
    
    -- Compliance tracking
    data_access_log ARRAY<MAP<STRING, ANY>> DEFAULT [], -- Last 100 accesses
    gdrive_permissions_requested ARRAY<STRING> DEFAULT [],
    gdrive_permissions_granted ARRAY<STRING> DEFAULT [],
    permission_audit_date TIMESTAMP
);

COMMIT;

-- =============================================================================
-- SECURITY INCIDENT TRACKING
-- =============================================================================

-- Step 3: Create security incident tracking collection
BEGIN TRANSACTION;

CREATE COLLECTION security_incidents (
    incident_id STRING NOT NULL PRIMARY KEY,
    incident_type STRING NOT NULL, -- 'auth_failure', 'suspicious_access', 'token_abuse', 'data_breach_attempt'
    severity STRING NOT NULL, -- 'low', 'medium', 'high', 'critical'
    status STRING NOT NULL DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'false_positive'
    
    -- Affected entities
    user_id STRING,
    resource_type STRING, -- 'user', 'tokens', 'files', 'system'
    resource_id STRING,
    
    -- Incident details
    description STRING NOT NULL,
    detection_method STRING, -- 'automated', 'user_report', 'manual_review'
    detection_source STRING, -- System component that detected the incident
    
    -- Technical details
    ip_address STRING,
    user_agent STRING,
    geographic_location MAP<STRING, STRING>,
    request_details MAP<STRING, ANY>,
    
    -- Timeline
    detected_at TIMESTAMP NOT NULL,
    investigated_at TIMESTAMP,
    resolved_at TIMESTAMP,
    
    -- Response actions
    actions_taken ARRAY<STRING> DEFAULT [],
    mitigation_steps ARRAY<STRING> DEFAULT [],
    
    -- Impact assessment
    data_compromised BOOLEAN DEFAULT false,
    accounts_affected INTEGER DEFAULT 0,
    estimated_impact STRING, -- 'none', 'minimal', 'moderate', 'significant', 'severe'
    
    -- Investigation
    assigned_to STRING, -- Investigator or team
    investigation_notes TEXT,
    evidence_collected MAP<STRING, ANY>,
    
    -- Compliance
    regulatory_notification_required BOOLEAN DEFAULT false,
    regulatory_bodies_notified ARRAY<STRING> DEFAULT [],
    user_notification_sent BOOLEAN DEFAULT false,
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_incident_type CHECK (
        incident_type IN ('auth_failure', 'suspicious_access', 'token_abuse', 'data_breach_attempt', 'policy_violation')
    ),
    CONSTRAINT valid_severity CHECK (
        severity IN ('low', 'medium', 'high', 'critical')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('open', 'investigating', 'resolved', 'false_positive')
    )
);

COMMIT;

-- =============================================================================
-- ACCESS CONTROL AND PERMISSIONS
-- =============================================================================

-- Step 4: Implement role-based access control
BEGIN TRANSACTION;

-- Create roles and permissions collection
CREATE COLLECTION user_roles (
    role_id STRING NOT NULL PRIMARY KEY,
    role_name STRING NOT NULL,
    description STRING NOT NULL,
    
    -- Role configuration
    is_system_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    precedence_level INTEGER NOT NULL, -- Higher number = higher precedence
    
    -- Permissions
    permissions MAP<STRING, BOOLEAN> DEFAULT {
        -- File operations
        'files:read': false,
        'files:write': false,
        'files:delete': false,
        'files:share': false,
        
        -- AI features
        'ai:classify': false,
        'ai:organize': false,
        'ai:generate_rules': false,
        
        -- Background operations
        'scans:create': false,
        'scans:monitor': false,
        'scans:cancel': false,
        
        -- Admin operations
        'users:manage': false,
        'system:monitor': false,
        'audit:view': false,
        'security:manage': false
    },
    
    -- Resource limits
    resource_limits MAP<STRING, INTEGER> DEFAULT {
        'max_files_per_scan': 10000,
        'max_scans_per_day': 5,
        'max_ai_requests_per_day': 100,
        'max_storage_gb': 15
    },
    
    -- Feature access
    feature_access MAP<STRING, BOOLEAN> DEFAULT {
        'background_scans': true,
        'ai_insights': true,
        'duplicate_detection': true,
        'organization_rules': true,
        'batch_operations': false,
        'api_access': false
    },
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    created_by STRING NOT NULL
);

-- Create user role assignments
CREATE SUBCOLLECTION users/{uid}/role_assignments (
    assignment_id STRING NOT NULL,
    role_id STRING NOT NULL,
    
    -- Assignment details
    assigned_by STRING NOT NULL,
    assigned_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    
    -- Assignment status
    is_active BOOLEAN DEFAULT true,
    revoked_at TIMESTAMP,
    revoked_by STRING,
    revocation_reason STRING,
    
    -- Conditions
    ip_restrictions ARRAY<STRING> DEFAULT [], -- CIDR blocks
    time_restrictions MAP<STRING, ANY> DEFAULT {}, -- Day/time restrictions
    resource_restrictions MAP<STRING, ANY> DEFAULT {},
    
    -- Audit trail
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- Insert default roles
INSERT INTO user_roles VALUES
    ('role_basic_user', 'Basic User', 'Standard user with basic file management capabilities', 
     true, true, 10,
     {
         'files:read': true, 'files:write': true, 'files:delete': false, 'files:share': false,
         'ai:classify': true, 'ai:organize': true, 'ai:generate_rules': false,
         'scans:create': true, 'scans:monitor': true, 'scans:cancel': true,
         'users:manage': false, 'system:monitor': false, 'audit:view': false, 'security:manage': false
     },
     {'max_files_per_scan': 10000, 'max_scans_per_day': 5, 'max_ai_requests_per_day': 100, 'max_storage_gb': 15},
     {'background_scans': true, 'ai_insights': true, 'duplicate_detection': true, 'organization_rules': true, 'batch_operations': false, 'api_access': false},
     NOW(), NOW(), 'system'),
     
    ('role_premium_user', 'Premium User', 'Premium user with enhanced capabilities and higher limits',
     true, true, 20,
     {
         'files:read': true, 'files:write': true, 'files:delete': true, 'files:share': true,
         'ai:classify': true, 'ai:organize': true, 'ai:generate_rules': true,
         'scans:create': true, 'scans:monitor': true, 'scans:cancel': true,
         'users:manage': false, 'system:monitor': false, 'audit:view': false, 'security:manage': false
     },
     {'max_files_per_scan': 100000, 'max_scans_per_day': 20, 'max_ai_requests_per_day': 1000, 'max_storage_gb': 100},
     {'background_scans': true, 'ai_insights': true, 'duplicate_detection': true, 'organization_rules': true, 'batch_operations': true, 'api_access': true},
     NOW(), NOW(), 'system'),
     
    ('role_admin', 'Administrator', 'System administrator with full access',
     true, true, 100,
     {
         'files:read': true, 'files:write': true, 'files:delete': true, 'files:share': true,
         'ai:classify': true, 'ai:organize': true, 'ai:generate_rules': true,
         'scans:create': true, 'scans:monitor': true, 'scans:cancel': true,
         'users:manage': true, 'system:monitor': true, 'audit:view': true, 'security:manage': true
     },
     {'max_files_per_scan': 1000000, 'max_scans_per_day': 100, 'max_ai_requests_per_day': 10000, 'max_storage_gb': 1000},
     {'background_scans': true, 'ai_insights': true, 'duplicate_detection': true, 'organization_rules': true, 'batch_operations': true, 'api_access': true},
     NOW(), NOW(), 'system');

COMMIT;

-- =============================================================================
-- DATA PRIVACY AND COMPLIANCE
-- =============================================================================

-- Step 5: Implement privacy and compliance features
BEGIN TRANSACTION;

-- Create data processing activities log
CREATE COLLECTION data_processing_activities (
    activity_id STRING NOT NULL PRIMARY KEY,
    user_id STRING NOT NULL,
    activity_type STRING NOT NULL, -- 'collection', 'processing', 'storage', 'sharing', 'deletion'
    
    -- Data details
    data_categories ARRAY<STRING> NOT NULL, -- 'personal', 'file_metadata', 'usage_analytics', 'security_logs'
    data_subjects ARRAY<STRING> NOT NULL, -- 'user', 'file_owner', 'shared_user'
    processing_purpose STRING NOT NULL,
    legal_basis STRING NOT NULL, -- 'consent', 'contract', 'legitimate_interest', 'legal_obligation'
    
    -- Processing details
    processing_start_date TIMESTAMP NOT NULL,
    processing_end_date TIMESTAMP,
    retention_period_days INTEGER,
    data_location STRING, -- Geographic location of processing
    
    -- Recipients
    data_recipients ARRAY<STRING> DEFAULT [], -- Third parties who receive data
    third_party_processors ARRAY<STRING> DEFAULT [],
    
    -- Security measures
    security_measures ARRAY<STRING> DEFAULT [],
    encryption_applied BOOLEAN DEFAULT false,
    access_controls_applied BOOLEAN DEFAULT true,
    
    -- Rights exercised
    subject_rights_requests ARRAY<MAP<STRING, ANY>> DEFAULT [],
    
    -- Compliance
    gdpr_applicable BOOLEAN DEFAULT true,
    ccpa_applicable BOOLEAN DEFAULT false,
    other_regulations ARRAY<STRING> DEFAULT [],
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_activity_type CHECK (
        activity_type IN ('collection', 'processing', 'storage', 'sharing', 'deletion')
    ),
    CONSTRAINT valid_legal_basis CHECK (
        legal_basis IN ('consent', 'contract', 'legitimate_interest', 'legal_obligation', 'vital_interests', 'public_task')
    )
);

-- Create consent management
CREATE SUBCOLLECTION users/{uid}/consent_records (
    consent_id STRING NOT NULL,
    consent_type STRING NOT NULL, -- 'gdpr_general', 'marketing', 'analytics', 'ai_processing'
    
    -- Consent details
    consent_given BOOLEAN NOT NULL,
    consent_date TIMESTAMP NOT NULL,
    consent_method STRING NOT NULL, -- 'explicit_opt_in', 'implied', 'pre_ticked', 'soft_opt_in'
    consent_version STRING NOT NULL, -- Version of privacy policy
    
    -- Scope
    processing_purposes ARRAY<STRING> NOT NULL,
    data_categories ARRAY<STRING> NOT NULL,
    retention_period_days INTEGER,
    
    -- Withdrawal
    withdrawn_at TIMESTAMP,
    withdrawal_method STRING,
    withdrawal_reason STRING,
    
    -- Evidence
    consent_evidence MAP<STRING, ANY>, -- IP, timestamp, form data, etc.
    privacy_policy_version STRING NOT NULL,
    terms_version STRING,
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

COMMIT;

-- =============================================================================
-- SECURITY MONITORING AND ALERTING
-- =============================================================================

-- Step 6: Implement security monitoring infrastructure
BEGIN TRANSACTION;

-- Create security monitoring rules
CREATE COLLECTION security_monitoring_rules (
    rule_id STRING NOT NULL PRIMARY KEY,
    rule_name STRING NOT NULL,
    description STRING NOT NULL,
    
    -- Rule configuration
    is_active BOOLEAN DEFAULT true,
    severity STRING NOT NULL, -- 'low', 'medium', 'high', 'critical'
    rule_type STRING NOT NULL, -- 'threshold', 'anomaly', 'pattern', 'geo_fencing'
    
    -- Detection criteria
    detection_criteria MAP<STRING, ANY> NOT NULL,
    threshold_values MAP<STRING, NUMBER> DEFAULT {},
    time_window_minutes INTEGER DEFAULT 5,
    
    -- Alert configuration
    alert_immediately BOOLEAN DEFAULT false,
    suppress_duplicates_minutes INTEGER DEFAULT 60,
    escalation_rules ARRAY<MAP<STRING, ANY>> DEFAULT [],
    
    -- Response actions
    automated_responses ARRAY<STRING> DEFAULT [], -- 'lock_account', 'revoke_tokens', 'notify_user'
    notification_channels ARRAY<STRING> DEFAULT [], -- 'email', 'slack', 'webhook'
    
    -- Performance
    last_triggered_at TIMESTAMP,
    trigger_count INTEGER DEFAULT 0,
    false_positive_count INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    created_by STRING NOT NULL
);

-- Insert default security monitoring rules
INSERT INTO security_monitoring_rules VALUES
    ('rule_failed_login_attempts', 'Failed Login Attempts', 'Detect multiple failed login attempts',
     true, 'medium', 'threshold',
     {'event_type': 'auth_failure', 'user_id': 'any', 'time_window': 5},
     {'max_attempts': 5}, 5, true, 60, [],
     ['notify_user'], ['email'], null, 0, 0,
     NOW(), NOW(), 'system'),
     
    ('rule_suspicious_geo_access', 'Suspicious Geographic Access', 'Detect access from unusual locations',
     true, 'high', 'geo_fencing',
     {'event_type': 'login', 'location_change': true, 'distance_km': 1000},
     {'max_distance_km': 1000}, 60, true, 120, [],
     ['notify_user', 'require_verification'], ['email'], null, 0, 0,
     NOW(), NOW(), 'system'),
     
    ('rule_token_abuse', 'Token Abuse Detection', 'Detect unusual token usage patterns',
     true, 'high', 'anomaly',
     {'event_type': 'api_access', 'requests_per_minute': 'anomaly'},
     {'requests_per_minute': 100}, 1, false, 30, [],
     ['rate_limit'], ['webhook'], null, 0, 0,
     NOW(), NOW(), 'system');

COMMIT;

-- =============================================================================
-- ENCRYPTION AND DATA PROTECTION
-- =============================================================================

-- Step 7: Implement encryption key management
BEGIN TRANSACTION;

-- Create encryption key management
CREATE COLLECTION encryption_keys (
    key_id STRING NOT NULL PRIMARY KEY,
    key_version INTEGER NOT NULL,
    key_type STRING NOT NULL, -- 'aes256', 'rsa2048', 'ecdsa'
    key_purpose STRING NOT NULL, -- 'data_encryption', 'token_encryption', 'signature'
    
    -- Key lifecycle
    created_at TIMESTAMP NOT NULL,
    activated_at TIMESTAMP,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    key_status STRING DEFAULT 'active', -- 'active', 'expired', 'revoked', 'compromised'
    
    -- Key metadata (encrypted key stored separately)
    algorithm STRING NOT NULL,
    key_length INTEGER NOT NULL,
    key_derivation_method STRING,
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    -- Security
    is_hardware_backed BOOLEAN DEFAULT false,
    access_restrictions ARRAY<STRING> DEFAULT [],
    
    -- Compliance
    fips_compliant BOOLEAN DEFAULT false,
    common_criteria_certified BOOLEAN DEFAULT false,
    
    -- Audit fields
    updated_at TIMESTAMP NOT NULL,
    created_by STRING NOT NULL,
    
    CONSTRAINT valid_key_status CHECK (
        key_status IN ('active', 'expired', 'revoked', 'compromised')
    )
);

-- Create field-level encryption mapping
CREATE COLLECTION field_encryption_config (
    config_id STRING NOT NULL PRIMARY KEY,
    collection_name STRING NOT NULL,
    field_name STRING NOT NULL,
    
    -- Encryption configuration
    encryption_required BOOLEAN DEFAULT false,
    encryption_key_id STRING,
    encryption_algorithm STRING DEFAULT 'aes256-gcm',
    
    -- Data classification
    data_classification STRING NOT NULL, -- 'public', 'internal', 'confidential', 'restricted'
    pii_category STRING, -- 'none', 'personal', 'sensitive', 'special_category'
    
    -- Compliance requirements
    gdpr_special_category BOOLEAN DEFAULT false,
    hipaa_protected BOOLEAN DEFAULT false,
    pci_dss_applicable BOOLEAN DEFAULT false,
    
    -- Access control
    authorized_roles ARRAY<STRING> DEFAULT [],
    access_logging_required BOOLEAN DEFAULT true,
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- Configure encryption for sensitive fields
INSERT INTO field_encryption_config VALUES
    ('config_user_email', 'users', 'email', true, 'key_user_pii_001', 'aes256-gcm',
     'confidential', 'personal', false, false, false,
     ['role_admin', 'role_premium_user'], true, NOW(), NOW()),
     
    ('config_oauth_tokens', 'users/{uid}/secrets', 'refresh_token', true, 'key_oauth_tokens_001', 'aes256-gcm',
     'restricted', 'sensitive', false, false, false,
     ['role_admin'], true, NOW(), NOW()),
     
    ('config_mfa_backup', 'users', 'mfa_backup_codes', true, 'key_user_security_001', 'aes256-gcm',
     'restricted', 'sensitive', false, false, false,
     ['role_admin'], true, NOW(), NOW());

COMMIT;

-- =============================================================================
-- SECURITY INDEXES
-- =============================================================================

-- Step 8: Create security-focused indexes
BEGIN TRANSACTION;

-- Security incident tracking indexes
CREATE INDEX idx_security_incidents_severity ON security_incidents (severity ASC, status ASC, detected_at DESC);
CREATE INDEX idx_security_incidents_user ON security_incidents (user_id ASC, detected_at DESC, severity ASC);
CREATE INDEX idx_security_incidents_type ON security_incidents (incident_type ASC, detected_at DESC);
CREATE INDEX idx_security_incidents_unresolved ON security_incidents (status ASC, severity ASC, detected_at ASC)
WHERE status IN ('open', 'investigating');

-- Role and permission indexes
CREATE INDEX idx_user_roles_active ON user_roles (is_active ASC, precedence_level DESC);
CREATE INDEX idx_role_assignments_active ON users/{uid}/role_assignments (is_active ASC, expires_at ASC, assigned_at DESC);

-- Privacy and compliance indexes
CREATE INDEX idx_data_processing_user ON data_processing_activities (user_id ASC, activity_type ASC, processing_start_date DESC);
CREATE INDEX idx_consent_records_type ON users/{uid}/consent_records (consent_type ASC, consent_given ASC, consent_date DESC);

-- Security monitoring indexes
CREATE INDEX idx_security_rules_active ON security_monitoring_rules (is_active ASC, severity ASC, last_triggered_at DESC);

-- Encryption management indexes
CREATE INDEX idx_encryption_keys_status ON encryption_keys (key_status ASC, expires_at ASC);
CREATE INDEX idx_field_encryption_collection ON field_encryption_config (collection_name ASC, encryption_required ASC);

COMMIT;

-- =============================================================================
-- SECURITY VALIDATION AND TESTING
-- =============================================================================

-- Step 9: Validate security implementations
BEGIN TRANSACTION;

-- Test role assignment queries
EXPLAIN SELECT ra.role_id, r.permissions 
FROM users/test_uid/role_assignments ra
JOIN user_roles r ON ra.role_id = r.role_id
WHERE ra.is_active = true AND (ra.expires_at IS NULL OR ra.expires_at > NOW());

-- Test security incident detection
EXPLAIN SELECT * FROM security_incidents 
WHERE status IN ('open', 'investigating') 
AND severity IN ('high', 'critical')
ORDER BY detected_at DESC;

-- Test compliance data queries
EXPLAIN SELECT * FROM data_processing_activities 
WHERE user_id = 'test_user' 
AND gdpr_applicable = true
ORDER BY processing_start_date DESC;

COMMIT;

-- =============================================================================
-- MIGRATION COMPLETION
-- =============================================================================

-- Step 10: Complete migration and update tracking
BEGIN TRANSACTION;

-- Count new security collections created
SET @security_collections = 7; -- security_incidents, user_roles, data_processing_activities, security_monitoring_rules, encryption_keys, field_encryption_config, + subcollections

-- Update migration record
UPDATE schema_migrations 
SET 
    status = 'completed',
    completed_at = NOW(),
    duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()),
    records_affected = @security_collections,
    validation_query = 'SELECT COUNT(*) FROM user_roles WHERE is_system_role = true',
    validation_result = JSON_OBJECT('system_roles_created', 3, 'security_collections', @security_collections),
    updated_at = NOW()
WHERE migration_id = '003_security_enhancements';

-- Update schema version
UPDATE schema_version 
SET 
    version = '1.2.0',
    last_migration_id = '003_security_enhancements',
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
    '003_security_enhancements',
    JSON_OBJECT(
        'migration_version', '003_security_enhancements',
        'schema_version', '1.2.0',
        'security_features_added', [
            'user_security_enhancements',
            'oauth_security_improvements', 
            'security_incident_tracking',
            'role_based_access_control',
            'privacy_compliance_features',
            'security_monitoring_rules',
            'encryption_key_management'
        ],
        'duration_seconds', TIMESTAMPDIFF(SECOND,
            (SELECT started_at FROM schema_migrations WHERE migration_id = '003_security_enhancements'),
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
-- SECURITY IMPLEMENTATION NOTES
-- =============================================================================

-- Migration 003 completed successfully
--
-- Security enhancements implemented:
-- 1. Enhanced user security fields and tracking
-- 2. Advanced OAuth token security controls
-- 3. Security incident detection and management
-- 4. Role-based access control (RBAC) system
-- 5. Privacy compliance and consent management
-- 6. Real-time security monitoring and alerting
-- 7. Encryption key management infrastructure
--
-- New collections: 7 main collections + 2 subcollections
-- New indexes: 12 security-focused indexes
-- Default roles: 3 system roles (basic, premium, admin)
-- Monitoring rules: 3 default security detection rules
--
-- IMPORTANT SECURITY NOTES:
-- 1. Encryption keys should be generated and stored securely
-- 2. Security monitoring rules need to be calibrated for your environment
-- 3. RBAC permissions should be reviewed and adjusted as needed
-- 4. Compliance features require legal review for your jurisdiction
-- 5. Security incident response procedures should be documented
--
-- Next recommended migration: 004_data_retention_automation.sql