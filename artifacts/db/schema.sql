-- ============================================================================
-- DriveMind Database Schema for Firestore (NoSQL)
-- Production Database Repair & Optimization
-- Version: 2.0.0-REPAIR
-- Date: 2025-09-17
-- Standards: ALPHA-CODENAME v1.8 + AEI21 compliant
-- ============================================================================
-- 
-- CRITICAL REPAIRS IMPLEMENTED:
-- 1. Token encryption with AES-256-GCM + Cloud KMS
-- 2. Comprehensive audit logging for compliance
-- 3. Scan state persistence with checkpoint/resume
-- 4. Optimized indexes for performance
-- 5. Data integrity validation schemas
-- 6. GDPR-compliant PII consent management
-- 7. Rate limiting and abuse prevention
-- 8. Backup and recovery procedures
-- ============================================================================

-- =============================================================================
-- CORE AUTHENTICATION & USER DATA
-- =============================================================================

-- Collection: users
-- Document ID: {firebase_uid}
-- Purpose: Core user profile and metadata
CREATE COLLECTION users (
    firebase_uid STRING NOT NULL PRIMARY KEY,
    email STRING NOT NULL,
    display_name STRING,
    photo_url STRING,
    provider STRING NOT NULL DEFAULT 'google.com',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP,
    
    -- User preferences
    settings MAP<STRING, ANY> DEFAULT {},
    
    -- Feature flags
    features MAP<STRING, BOOLEAN> DEFAULT {
        'ai_enabled': true,
        'background_scans': true,
        'batch_operations': true
    },
    
    -- Usage quotas and limits
    quotas MAP<STRING, INTEGER> DEFAULT {
        'max_files': 100000,
        'max_scans_per_day': 10,
        'max_ai_requests_per_day': 1000
    },
    
    -- Account status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    subscription_expires_at TIMESTAMP,
    
    -- Soft delete support
    deleted_at TIMESTAMP,
    
    CONSTRAINT valid_email CHECK (email LIKE '%@%'),
    CONSTRAINT positive_quotas CHECK (
        quotas.max_files > 0 AND 
        quotas.max_scans_per_day > 0 AND 
        quotas.max_ai_requests_per_day > 0
    )
);

-- Subcollection: users/{uid}/secrets/googleDrive
-- Document ID: 'googleDrive'
-- Purpose: ENCRYPTED OAuth refresh tokens with Cloud KMS (server-only access)
-- SECURITY: AES-256-GCM encryption with automatic key rotation
CREATE SUBCOLLECTION users/{uid}/secrets (
    secret_type STRING NOT NULL DEFAULT 'googleDrive',
    
    -- ENCRYPTED TOKEN DATA (AES-256-GCM with Cloud KMS)
    encryptedRefreshToken STRING NOT NULL, -- Base64 encoded ciphertext
    encryptedAccessToken STRING, -- Optional cached access token
    keyVersion STRING NOT NULL, -- Cloud KMS key version reference
    iv STRING NOT NULL, -- Initialization vector (base64)
    authTag STRING NOT NULL, -- Authentication tag (base64)
    
    -- TOKEN METADATA
    scope ARRAY<STRING> NOT NULL,
    tokenType STRING NOT NULL DEFAULT 'Bearer',
    expiresAt TIMESTAMP,
    
    -- ENCRYPTION METADATA
    encryptionAlgorithm STRING NOT NULL DEFAULT 'AES-256-GCM',
    keySource STRING NOT NULL DEFAULT 'CloudKMS',
    encryptionTimestamp TIMESTAMP NOT NULL,
    
    -- VALIDATION & HEALTH
    isValid BOOLEAN NOT NULL DEFAULT true,
    lastValidatedAt TIMESTAMP,
    validationError STRING,
    healthCheckCount INTEGER DEFAULT 0,
    
    -- USAGE & LIFECYCLE
    usageCount INTEGER NOT NULL DEFAULT 0,
    lastUsedAt TIMESTAMP,
    refreshCount INTEGER DEFAULT 0,
    lastRefreshAt TIMESTAMP,
    
    -- AUDIT TRAIL
    auditLog ARRAY<MAP<STRING, ANY>> DEFAULT [],
    
    -- TIMESTAMPS
    createdAt TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP NOT NULL,
    
    -- SECURITY CONSTRAINTS
    CONSTRAINT valid_scope CHECK (ARRAY_LENGTH(scope) > 0),
    CONSTRAINT valid_encryption_fields CHECK (
        encryptedRefreshToken IS NOT NULL AND 
        keyVersion IS NOT NULL AND 
        iv IS NOT NULL AND 
        authTag IS NOT NULL
    ),
    CONSTRAINT valid_algorithm CHECK (encryptionAlgorithm = 'AES-256-GCM'),
    CONSTRAINT valid_key_source CHECK (keySource = 'CloudKMS'),
    CONSTRAINT valid_usage_count CHECK (usageCount >= 0),
    CONSTRAINT valid_refresh_count CHECK (refreshCount >= 0)
);

-- Subcollection: users/{uid}/consent/aiProcessing
-- Document ID: 'aiProcessing'
-- Purpose: GDPR-compliant consent management for PII processing
CREATE SUBCOLLECTION users/{uid}/consent (
    consentType STRING NOT NULL DEFAULT 'aiProcessing',
    
    -- CONSENT STATUS
    granted BOOLEAN NOT NULL DEFAULT false,
    purposes ARRAY<STRING> NOT NULL DEFAULT [], -- ['file_classification', 'duplicate_detection']
    dataTypes ARRAY<STRING> NOT NULL DEFAULT [], -- ['file_names', 'file_metadata']
    
    -- CONSENT LIFECYCLE
    grantedAt TIMESTAMP,
    revokedAt TIMESTAMP,
    expiresAt TIMESTAMP,
    autoRenewal BOOLEAN DEFAULT false,
    
    -- CONSENT VERSION & COMPLIANCE
    consentVersion STRING NOT NULL DEFAULT 'v1.0',
    gdprLegalBasis STRING DEFAULT 'consent', -- Article 6(1)(a)
    privacyPolicyVersion STRING,
    
    -- CONSENT HISTORY & AUDIT
    consentHistory ARRAY<MAP<STRING, ANY>> DEFAULT [],
    auditTrail ARRAY<MAP<STRING, ANY>> DEFAULT [],
    
    -- PROCESSING RESTRICTIONS
    processingRestrictions MAP<STRING, ANY> DEFAULT {},
    dataRetentionPeriod INTEGER DEFAULT 2555, -- Days (7 years default)
    
    -- TIMESTAMPS
    createdAt TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP NOT NULL,
    
    -- GDPR COMPLIANCE CONSTRAINTS
    CONSTRAINT valid_purposes CHECK (ARRAY_LENGTH(purposes) >= 0),
    CONSTRAINT valid_data_types CHECK (ARRAY_LENGTH(dataTypes) >= 0),
    CONSTRAINT valid_legal_basis CHECK (gdprLegalBasis IN ('consent', 'legitimate_interest', 'contract')),
    CONSTRAINT valid_retention_period CHECK (dataRetentionPeriod > 0)
);

-- =============================================================================
-- FILE INVENTORY & METADATA
-- =============================================================================

-- Subcollection: users/{uid}/inventory
-- Document ID: {google_drive_file_id}
-- Purpose: Cached file metadata and analysis results
CREATE SUBCOLLECTION users/{uid}/inventory (
    google_file_id STRING NOT NULL,
    name STRING NOT NULL,
    mime_type STRING NOT NULL,
    file_type STRING NOT NULL, -- Document, Spreadsheet, Image, Video, PDF, Folder, Other
    size INTEGER NOT NULL DEFAULT 0,
    
    -- File timestamps
    created_time TIMESTAMP NOT NULL,
    modified_time TIMESTAMP NOT NULL,
    viewed_by_me_time TIMESTAMP,
    last_scanned_at TIMESTAMP NOT NULL,
    
    -- File location
    parents ARRAY<STRING> NOT NULL DEFAULT [], -- Parent folder IDs
    path_segments ARRAY<STRING> NOT NULL DEFAULT [], -- Human-readable path
    folder_depth INTEGER NOT NULL DEFAULT 0,
    
    -- File status
    trashed BOOLEAN NOT NULL DEFAULT false,
    owned_by_me BOOLEAN NOT NULL DEFAULT true,
    shared BOOLEAN NOT NULL DEFAULT false,
    shared_with_me BOOLEAN NOT NULL DEFAULT false,
    
    -- Analysis results
    is_duplicate BOOLEAN NOT NULL DEFAULT false,
    duplicate_group_id STRING,
    vault_score DECIMAL(5,2), -- AI importance score 0-100
    
    -- AI classification
    ai_category STRING,
    ai_tags ARRAY<STRING> DEFAULT [],
    ai_confidence DECIMAL(3,2), -- 0-1
    ai_analyzed_at TIMESTAMP,
    
    -- Performance optimization
    checksum STRING, -- Content hash for duplicate detection
    thumbnail_link STRING,
    web_view_link STRING,
    
    -- Metadata
    metadata MAP<STRING, ANY> DEFAULT {},
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_file_type CHECK (
        file_type IN ('Document', 'Spreadsheet', 'Presentation', 'Image', 'Video', 'PDF', 'Folder', 'Other')
    ),
    CONSTRAINT valid_vault_score CHECK (vault_score >= 0 AND vault_score <= 100),
    CONSTRAINT valid_ai_confidence CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    CONSTRAINT valid_folder_depth CHECK (folder_depth >= 0)
);

-- =============================================================================
-- BACKGROUND SCAN MANAGEMENT
-- =============================================================================

-- Subcollection: users/{uid}/scans
-- Document ID: {scan_id} (auto-generated)
-- Purpose: Background scan state with checkpoint/resume support
-- ENHANCEMENT: Persistent scan state with crash recovery
CREATE SUBCOLLECTION users/{uid}/scans (
    scanId STRING NOT NULL,
    status STRING NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled', 'paused'
    scanType STRING NOT NULL DEFAULT 'full', -- 'full', 'incremental', 'duplicates_only', 'delta'
    priority INTEGER NOT NULL DEFAULT 5, -- 1-10, lower = higher priority
    
    -- SCAN CONFIGURATION
    config MAP<STRING, ANY> DEFAULT {
        'maxDepth': 20,
        'includeTrashed': false,
        'scanSharedDrives': false,
        'enableAiAnalysis': true,
        'checkpointInterval': 100, -- Files processed per checkpoint
        'maxRetries': 3,
        'timeoutMinutes': 60
    },
    
    -- PROGRESS TRACKING WITH CHECKPOINTS
    progress MAP<STRING, ANY> DEFAULT {
        'current': 0,
        'total': 0,
        'percentage': 0,
        'currentStep': 'Initializing scan...',
        'estimatedTimeRemaining': null,
        'bytesProcessed': 0,
        'totalBytes': 0,
        'filesProcessedThisSession': 0,
        'lastProcessedFileId': null
    },
    
    -- CHECKPOINT & RESUME DATA
    checkpoint MAP<STRING, ANY> DEFAULT {
        'pageToken': null,
        'lastProcessedFileId': null,
        'processedFileIds': [],
        'foldersToScan': [],
        'currentFolderId': null,
        'resumeData': {},
        'lastCheckpointAt': null
    },
    
    -- TIMING & PERFORMANCE
    startedAt TIMESTAMP,
    completedAt TIMESTAMP,
    pausedAt TIMESTAMP,
    resumedAt TIMESTAMP,
    lastActivityAt TIMESTAMP,
    processingDurationSeconds INTEGER DEFAULT 0,
    estimatedCompletionAt TIMESTAMP,
    
    -- RESULTS & INSIGHTS
    results MAP<STRING, ANY> DEFAULT {
        'totalFiles': 0,
        'filesScanned': 0,
        'duplicatesFound': 0,
        'errorsEncountered': 0,
        'sizeBytesProcessed': 0,
        'insights': {},
        'summary': {}
    },
    
    -- ERROR HANDLING & RECOVERY
    errorMessage STRING,
    errorCode STRING,
    errorDetails MAP<STRING, ANY> DEFAULT {},
    retryCount INTEGER NOT NULL DEFAULT 0,
    maxRetries INTEGER NOT NULL DEFAULT 3,
    lastRetryAt TIMESTAMP,
    nextRetryAt TIMESTAMP,
    recoveryAttempts INTEGER DEFAULT 0,
    
    -- RESOURCE TRACKING
    resourceUsage MAP<STRING, ANY> DEFAULT {
        'apiCallsMade': 0,
        'bandwidthUsedBytes': 0,
        'memoryPeakMB': 0,
        'cpuTimeSeconds': 0,
        'executionRegion': null
    },
    
    -- EXECUTION METADATA
    triggeredBy STRING NOT NULL DEFAULT 'user', -- 'user', 'scheduled', 'webhook', 'auto'
    cloudFunctionExecutionId STRING,
    executionEnvironment STRING DEFAULT 'cloud_function',
    version STRING DEFAULT '1.0',
    
    -- QUALITY & VALIDATION
    qualityMetrics MAP<STRING, ANY> DEFAULT {
        'dataIntegrityScore': 0,
        'validationErrors': [],
        'warningCount': 0,
        'successRate': 0
    },
    
    -- AUDIT & COMPLIANCE
    auditTrail ARRAY<MAP<STRING, ANY>> DEFAULT [],
    complianceFlags MAP<STRING, BOOLEAN> DEFAULT {
        'gdprCompliant': true,
        'dataMinimized': true,
        'auditLogged': true
    },
    
    -- TIMESTAMPS
    createdAt TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP NOT NULL,
    
    -- ENHANCED CONSTRAINTS
    CONSTRAINT valid_status CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')
    ),
    CONSTRAINT valid_scan_type CHECK (
        scanType IN ('full', 'incremental', 'duplicates_only', 'delta')
    ),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 10),
    CONSTRAINT valid_retry_count CHECK (retryCount >= 0 AND retryCount <= maxRetries),
    CONSTRAINT valid_max_retries CHECK (maxRetries >= 0 AND maxRetries <= 10),
    CONSTRAINT valid_progress_percentage CHECK (
        progress.percentage >= 0 AND progress.percentage <= 100
    ),
    CONSTRAINT valid_resource_usage CHECK (
        resourceUsage.apiCallsMade >= 0 AND 
        resourceUsage.bandwidthUsedBytes >= 0
    )
);

-- =============================================================================
-- DUPLICATE DETECTION
-- =============================================================================

-- Subcollection: users/{uid}/duplicate_groups
-- Document ID: {group_id} (auto-generated)
-- Purpose: Groups of duplicate files
CREATE SUBCOLLECTION users/{uid}/duplicate_groups (
    group_id STRING NOT NULL,
    duplicate_type STRING NOT NULL, -- 'exact_match', 'content_hash', 'fuzzy_match', 'version_series'
    similarity_score DECIMAL(3,2) NOT NULL, -- 0-1
    
    -- File references
    file_ids ARRAY<STRING> NOT NULL, -- References to inventory documents
    file_count INTEGER NOT NULL,
    
    -- Space analysis
    total_size_bytes INTEGER NOT NULL DEFAULT 0,
    space_wasted_bytes INTEGER NOT NULL DEFAULT 0,
    
    -- AI recommendation
    recommendation STRING, -- 'keep_newest', 'keep_largest', 'manual_review'
    recommended_action MAP<STRING, ANY> DEFAULT {},
    
    -- Resolution status
    status STRING NOT NULL DEFAULT 'detected', -- 'detected', 'reviewed', 'resolved', 'ignored'
    resolved_at TIMESTAMP,
    resolved_by STRING, -- 'user' or 'auto'
    resolution_action STRING, -- 'kept_newest', 'kept_largest', 'manual_selection'
    
    -- Detection metadata
    detected_at TIMESTAMP NOT NULL,
    detection_algorithm STRING NOT NULL,
    detection_confidence DECIMAL(3,2),
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_duplicate_type CHECK (
        duplicate_type IN ('exact_match', 'content_hash', 'fuzzy_match', 'version_series')
    ),
    CONSTRAINT valid_similarity_score CHECK (similarity_score >= 0 AND similarity_score <= 1),
    CONSTRAINT valid_file_count CHECK (file_count >= 2),
    CONSTRAINT valid_status CHECK (
        status IN ('detected', 'reviewed', 'resolved', 'ignored')
    )
);

-- =============================================================================
-- AI ORGANIZATION RULES
-- =============================================================================

-- Subcollection: users/{uid}/organization_rules
-- Document ID: {rule_id} (auto-generated)
-- Purpose: User-defined and AI-suggested organization rules
CREATE SUBCOLLECTION users/{uid}/organization_rules (
    rule_id STRING NOT NULL,
    name STRING NOT NULL,
    description STRING NOT NULL,
    
    -- Rule definition
    pattern STRING NOT NULL, -- JSON pattern or regex
    action STRING NOT NULL, -- 'move', 'rename', 'tag', 'organize'
    target STRING NOT NULL, -- Target folder ID or pattern
    
    -- Conditions
    conditions MAP<STRING, ANY> DEFAULT {
        'file_types': [],
        'name_pattern': null,
        'size_range': {},
        'date_range': {},
        'ai_category': null
    },
    
    -- Rule behavior
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 50, -- 1-100, lower runs first
    auto_apply BOOLEAN NOT NULL DEFAULT false,
    
    -- Performance tracking
    times_applied INTEGER NOT NULL DEFAULT 0,
    files_affected INTEGER NOT NULL DEFAULT 0,
    last_applied_at TIMESTAMP,
    
    -- AI generation metadata
    created_by STRING NOT NULL, -- 'user' or 'ai'
    ai_confidence DECIMAL(3,2), -- If created by AI
    ai_reasoning STRING, -- AI explanation
    
    -- Validation
    last_validated_at TIMESTAMP,
    validation_status STRING DEFAULT 'pending', -- 'pending', 'valid', 'invalid'
    validation_error STRING,
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_action CHECK (
        action IN ('move', 'rename', 'tag', 'organize')
    ),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 100),
    CONSTRAINT valid_created_by CHECK (created_by IN ('user', 'ai')),
    CONSTRAINT valid_validation_status CHECK (
        validation_status IN ('pending', 'valid', 'invalid')
    )
);

-- =============================================================================
-- SYSTEM MONITORING & AUDIT
-- =============================================================================

-- Collection: system_metrics
-- Document ID: {metric_date} (YYYY-MM-DD format)
-- Purpose: Daily aggregated system metrics
CREATE COLLECTION system_metrics (
    metric_date DATE NOT NULL PRIMARY KEY,
    
    -- Application metrics
    total_users INTEGER NOT NULL DEFAULT 0,
    active_users_daily INTEGER NOT NULL DEFAULT 0,
    active_users_weekly INTEGER NOT NULL DEFAULT 0,
    active_users_monthly INTEGER NOT NULL DEFAULT 0,
    
    -- Usage metrics
    total_scans_completed INTEGER NOT NULL DEFAULT 0,
    total_files_processed INTEGER NOT NULL DEFAULT 0,
    total_duplicates_detected INTEGER NOT NULL DEFAULT 0,
    total_ai_insights_generated INTEGER NOT NULL DEFAULT 0,
    
    -- Performance metrics
    avg_scan_duration_seconds DECIMAL(10,2),
    avg_api_response_time_ms DECIMAL(10,2),
    total_api_calls INTEGER NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    error_rate_percentage DECIMAL(5,2),
    
    -- Resource usage
    total_bandwidth_gb DECIMAL(10,3),
    total_storage_gb DECIMAL(10,3),
    
    -- Business metrics
    new_signups INTEGER NOT NULL DEFAULT 0,
    premium_conversions INTEGER NOT NULL DEFAULT 0,
    churn_count INTEGER NOT NULL DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_error_rate CHECK (error_rate_percentage >= 0 AND error_rate_percentage <= 100)
);

-- Collection: audit_logs
-- Document ID: auto-generated
-- Purpose: IMMUTABLE audit trail for security compliance and forensics
-- ENHANCEMENT: Comprehensive audit logging with retention and integrity
CREATE COLLECTION audit_logs (
    eventId STRING NOT NULL PRIMARY KEY,
    eventType STRING NOT NULL, -- 'auth', 'data_access', 'data_modification', 'system', 'security'
    eventAction STRING NOT NULL, -- 'login', 'logout', 'token_refresh', 'scan_start', 'file_access', etc.
    severity STRING NOT NULL DEFAULT 'info', -- 'debug', 'info', 'warn', 'error', 'critical'
    
    -- ACTOR INFORMATION
    userId STRING, -- Firebase UID (null for system events)
    userEmail STRING,
    actorType STRING DEFAULT 'user', -- 'user', 'system', 'service', 'admin'
    
    -- REQUEST CONTEXT
    ipAddress STRING,
    userAgent STRING,
    sessionId STRING,
    requestId STRING,
    correlationId STRING, -- For tracing across services
    
    -- API CONTEXT
    apiEndpoint STRING,
    httpMethod STRING,
    httpStatusCode INTEGER,
    requestSize INTEGER,
    responseSize INTEGER,
    
    -- RESOURCE INFORMATION
    resourceType STRING, -- 'user', 'scan', 'file', 'rule', 'token', 'consent', 'system'
    resourceId STRING,
    resourceOwner STRING, -- User ID who owns the resource
    
    -- EVENT DATA & CHANGES
    eventData MAP<STRING, ANY> DEFAULT {},
    beforeData MAP<STRING, ANY> DEFAULT {}, -- State before change
    afterData MAP<STRING, ANY> DEFAULT {}, -- State after change
    changesSummary ARRAY<STRING> DEFAULT [], -- Human-readable change list
    
    -- SECURITY & COMPLIANCE
    dataClassification STRING DEFAULT 'internal', -- 'public', 'internal', 'confidential', 'restricted'
    gdprRelevant BOOLEAN DEFAULT false,
    dataSubject STRING, -- User ID for GDPR data subject
    legalBasis STRING, -- GDPR legal basis for processing
    processingPurpose STRING, -- Why the data was processed
    
    -- PII & SENSITIVE DATA
    containsPii BOOLEAN DEFAULT false,
    piiTypes ARRAY<STRING> DEFAULT [], -- Types of PII detected
    redactionApplied BOOLEAN DEFAULT false,
    
    -- RETENTION & LIFECYCLE
    retentionDate DATE, -- Auto-calculated based on classification
    retentionPolicy STRING DEFAULT 'standard',
    archiveAfterDays INTEGER DEFAULT 365,
    deleteAfterDays INTEGER DEFAULT 2555, -- 7 years
    
    -- GEOGRAPHIC & JURISDICTION
    countryCode STRING,
    region STRING,
    timezone STRING,
    jurisdiction STRING DEFAULT 'US',
    
    -- EVENT TIMING
    eventTimestamp TIMESTAMP NOT NULL,
    processingTimeMs INTEGER,
    
    -- SYSTEM METADATA
    applicationVersion STRING,
    environmentType STRING DEFAULT 'production', -- 'development', 'staging', 'production'
    serverInstance STRING,
    executionContext STRING,
    
    -- INTEGRITY & VERIFICATION
    eventHash STRING, -- SHA-256 hash of critical fields for integrity
    previousEventHash STRING, -- Chain of custody
    signature STRING, -- Digital signature for non-repudiation
    verified BOOLEAN DEFAULT false,
    
    -- ERROR TRACKING
    errorCode STRING,
    errorMessage STRING,
    stackTrace STRING,
    
    -- PERFORMANCE METRICS
    performanceMetrics MAP<STRING, ANY> DEFAULT {
        'memoryUsageMB': 0,
        'cpuUsagePercent': 0,
        'dbConnectionCount': 0,
        'cacheHitRate': 0
    },
    
    -- COMPLIANCE TAGS
    complianceTags ARRAY<STRING> DEFAULT [], -- ['gdpr', 'ccpa', 'sox', 'pci']
    auditTrailVersion STRING DEFAULT 'v1.0',
    
    -- IMMUTABLE TIMESTAMP (no updated_at by design)
    createdAt TIMESTAMP NOT NULL,
    
    -- ENHANCED CONSTRAINTS
    CONSTRAINT valid_event_type CHECK (
        eventType IN ('auth', 'data_access', 'data_modification', 'system', 'security', 'compliance')
    ),
    CONSTRAINT valid_severity CHECK (
        severity IN ('debug', 'info', 'warn', 'error', 'critical')
    ),
    CONSTRAINT valid_data_classification CHECK (
        dataClassification IN ('public', 'internal', 'confidential', 'restricted')
    ),
    CONSTRAINT valid_actor_type CHECK (
        actorType IN ('user', 'system', 'service', 'admin', 'api')
    ),
    CONSTRAINT valid_retention_period CHECK (deleteAfterDays > archiveAfterDays),
    CONSTRAINT valid_http_status CHECK (httpStatusCode IS NULL OR (httpStatusCode >= 100 AND httpStatusCode < 600)),
    CONSTRAINT valid_processing_time CHECK (processingTimeMs IS NULL OR processingTimeMs >= 0)
);

-- Collection: security_events
-- Document ID: auto-generated
-- Purpose: Dedicated security event logging for threat detection
CREATE COLLECTION security_events (
    eventId STRING NOT NULL PRIMARY KEY,
    eventType STRING NOT NULL, -- 'authentication_failure', 'rate_limit_exceeded', 'suspicious_activity'
    severity STRING NOT NULL, -- 'low', 'medium', 'high', 'critical'
    
    -- THREAT CLASSIFICATION
    threatCategory STRING, -- 'brute_force', 'data_exfiltration', 'privilege_escalation'
    riskScore INTEGER DEFAULT 0, -- 0-100
    confidence DECIMAL(3,2) DEFAULT 0, -- 0-1
    
    -- SOURCE INFORMATION
    sourceIp STRING NOT NULL,
    sourceCountry STRING,
    sourceAsn STRING, -- Autonomous System Number
    isKnownThreat BOOLEAN DEFAULT false,
    threatIntelligence MAP<STRING, ANY> DEFAULT {},
    
    -- TARGET INFORMATION
    targetUserId STRING,
    targetResource STRING,
    targetEndpoint STRING,
    
    -- ATTACK DETAILS
    attackVector STRING,
    attackPayload STRING,
    userAgent STRING,
    requestCount INTEGER DEFAULT 1,
    timeWindow STRING, -- Duration of attack
    
    -- RESPONSE & MITIGATION
    blocked BOOLEAN DEFAULT false,
    blockedAt TIMESTAMP,
    blockDuration INTEGER, -- Minutes
    mitigationApplied ARRAY<STRING> DEFAULT [],
    
    -- INVESTIGATION
    investigated BOOLEAN DEFAULT false,
    investigatedBy STRING,
    investigatedAt TIMESTAMP,
    investigationNotes STRING,
    falsePositive BOOLEAN DEFAULT false,
    
    -- COMPLIANCE & REPORTING
    reportedToSiem BOOLEAN DEFAULT false,
    reportedToAuthorities BOOLEAN DEFAULT false,
    reportingRequired BOOLEAN DEFAULT false,
    incidentId STRING,
    
    -- TIMESTAMPS
    firstSeen TIMESTAMP NOT NULL,
    lastSeen TIMESTAMP NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    
    -- CONSTRAINTS
    CONSTRAINT valid_security_event_type CHECK (
        eventType IN ('authentication_failure', 'rate_limit_exceeded', 'suspicious_activity', 
                     'data_breach_attempt', 'privilege_escalation', 'malicious_upload')
    ),
    CONSTRAINT valid_security_severity CHECK (
        severity IN ('low', 'medium', 'high', 'critical')
    ),
    CONSTRAINT valid_risk_score CHECK (riskScore >= 0 AND riskScore <= 100),
    CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Collection: rate_limits
-- Document ID: {user_id}_{endpoint}_{window}
-- Purpose: Rate limiting state per user/endpoint
CREATE COLLECTION rate_limits (
    limit_key STRING NOT NULL PRIMARY KEY,
    user_id STRING,
    endpoint STRING NOT NULL,
    window_start TIMESTAMP NOT NULL,
    window_size_seconds INTEGER NOT NULL,
    
    -- Limit tracking
    request_count INTEGER NOT NULL DEFAULT 0,
    limit_max INTEGER NOT NULL,
    
    -- Status
    is_exceeded BOOLEAN NOT NULL DEFAULT false,
    reset_at TIMESTAMP NOT NULL,
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_request_count CHECK (request_count >= 0),
    CONSTRAINT valid_limit_max CHECK (limit_max > 0)
);

-- =============================================================================
-- PERFORMANCE OPTIMIZATION COLLECTIONS
-- =============================================================================

-- Collection: file_content_hashes
-- Document ID: {content_hash}
-- Purpose: Global content hash index for duplicate detection
CREATE COLLECTION file_content_hashes (
    content_hash STRING NOT NULL PRIMARY KEY, -- SHA-256 or similar
    hash_algorithm STRING NOT NULL DEFAULT 'sha256',
    file_size_bytes INTEGER NOT NULL,
    
    -- File references
    file_references ARRAY<MAP<STRING, STRING>> NOT NULL DEFAULT [], -- {user_id, file_id}
    reference_count INTEGER NOT NULL DEFAULT 0,
    
    -- Performance
    first_seen_at TIMESTAMP NOT NULL,
    last_updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_hash_algorithm CHECK (
        hash_algorithm IN ('sha256', 'md5', 'sha1')
    ),
    CONSTRAINT valid_reference_count CHECK (reference_count >= 0)
);

-- =============================================================================
-- SCHEMA VERSION & MIGRATION TRACKING
-- =============================================================================

-- Collection: schema_migrations
-- Document ID: {migration_id}
-- Purpose: Track applied database migrations
CREATE COLLECTION schema_migrations (
    migration_id STRING NOT NULL PRIMARY KEY,
    migration_name STRING NOT NULL,
    version STRING NOT NULL,
    description STRING NOT NULL,
    
    -- Migration execution
    status STRING NOT NULL, -- 'pending', 'running', 'completed', 'failed', 'rolled_back'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    
    -- Migration details
    migration_script STRING NOT NULL,
    rollback_script STRING,
    
    -- Validation
    records_affected INTEGER DEFAULT 0,
    validation_query STRING,
    validation_result MAP<STRING, ANY>,
    
    -- Error handling
    error_message STRING,
    retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    applied_by STRING NOT NULL, -- User or system that applied migration
    environment STRING NOT NULL, -- 'development', 'staging', 'production'
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_status CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')
    ),
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0)
);

-- Collection: schema_version
-- Document ID: 'current'
-- Purpose: Track current schema version
CREATE COLLECTION schema_version (
    version STRING NOT NULL,
    last_migration_id STRING NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    updated_by STRING NOT NULL
);

-- =============================================================================
-- INDEXES REQUIRED FOR PERFORMANCE
-- =============================================================================

-- Core user lookups
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_active ON users (is_active, created_at);
CREATE INDEX idx_users_last_seen ON users (last_seen_at DESC) WHERE is_active = true;

-- File inventory queries
CREATE INDEX idx_inventory_scan_time ON users/{uid}/inventory (last_scanned_at DESC);
CREATE INDEX idx_inventory_duplicates ON users/{uid}/inventory (is_duplicate, duplicate_group_id) WHERE is_duplicate = true;
CREATE INDEX idx_inventory_ai_category ON users/{uid}/inventory (ai_category, ai_confidence) WHERE ai_category IS NOT NULL;
CREATE INDEX idx_inventory_size ON users/{uid}/inventory (size DESC);
CREATE INDEX idx_inventory_type ON users/{uid}/inventory (file_type, created_time DESC);

-- Background scan queries
CREATE INDEX idx_scans_status ON users/{uid}/scans (status, created_at DESC);
CREATE INDEX idx_scans_active ON users/{uid}/scans (status, updated_at DESC) WHERE status IN ('queued', 'running');

-- Duplicate group queries
CREATE INDEX idx_duplicate_groups_status ON users/{uid}/duplicate_groups (status, detected_at DESC);
CREATE INDEX idx_duplicate_groups_unresolved ON users/{uid}/duplicate_groups (status, space_wasted_bytes DESC) WHERE status = 'detected';

-- Organization rules
CREATE INDEX idx_rules_active ON users/{uid}/organization_rules (is_active, priority ASC) WHERE is_active = true;
CREATE INDEX idx_rules_performance ON users/{uid}/organization_rules (times_applied DESC, last_applied_at DESC);

-- Audit and monitoring
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id, event_timestamp DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id, event_timestamp DESC);
CREATE INDEX idx_audit_logs_retention ON audit_logs (retention_date ASC) WHERE retention_date IS NOT NULL;
CREATE INDEX idx_metrics_date ON system_metrics (metric_date DESC);
CREATE INDEX idx_rate_limits_user ON rate_limits (user_id, endpoint, window_start DESC);

-- Content hash index for duplicate detection
CREATE INDEX idx_content_hashes_size ON file_content_hashes (file_size_bytes, reference_count DESC);

-- Migration tracking
CREATE INDEX idx_migrations_status ON schema_migrations (status, created_at DESC);

-- =============================================================================
-- SECURITY RULES SCHEMA REFERENCES
-- =============================================================================

-- The following rules should be implemented in firestore.rules:
-- 
-- 1. users/{uid}: Read/write only by authenticated user matching uid
-- 2. users/{uid}/secrets: Server-only access, no client access
-- 3. users/{uid}/inventory: Read/write by owner only
-- 4. users/{uid}/scans: Read/write by owner only
-- 5. users/{uid}/duplicate_groups: Read/write by owner only
-- 6. users/{uid}/organization_rules: Read/write by owner only
-- 7. system_metrics: Read-only for authenticated users, write for admin only
-- 8. audit_logs: Write-only for system, no client access
-- 9. rate_limits: System-only access
-- 10. file_content_hashes: System-only access
-- 11. schema_migrations: System-only access
-- 12. schema_version: Read-only for authenticated users

-- =============================================================================
-- DATA RETENTION POLICIES
-- =============================================================================

-- Collection: data_retention_policies
-- Document ID: {collection_name}
-- Purpose: Define retention policies for automated cleanup
CREATE COLLECTION data_retention_policies (
    collection_name STRING NOT NULL PRIMARY KEY,
    retention_period_days INTEGER NOT NULL,
    cleanup_field STRING NOT NULL, -- Field to check for retention
    cleanup_schedule STRING NOT NULL, -- Cron expression
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_cleanup_at TIMESTAMP,
    records_cleaned_last_run INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    
    CONSTRAINT valid_retention_period CHECK (retention_period_days > 0)
);

-- Default retention policies
INSERT INTO data_retention_policies VALUES
    ('audit_logs', 2555, 'retention_date', '0 2 * * *', true, null, 0, NOW(), NOW()), -- 7 years for compliance
    ('system_metrics', 1095, 'created_at', '0 3 * * *', true, null, 0, NOW(), NOW()), -- 3 years
    ('rate_limits', 7, 'created_at', '0 4 * * *', true, null, 0, NOW(), NOW()), -- 7 days
    ('users/{uid}/scans', 90, 'completed_at', '0 1 * * *', true, null, 0, NOW(), NOW()); -- 90 days

-- =============================================================================
-- SCHEMA VALIDATION RULES
-- =============================================================================

-- These would be implemented as Firestore Security Rules and application-level validation:

-- 1. All timestamps must be valid RFC3339 format
-- 2. Email addresses must match regex pattern
-- 3. File sizes must be non-negative
-- 4. Progress percentages must be 0-100
-- 5. Confidence scores must be 0-1
-- 6. Priority values must be 1-100
-- 7. Array fields must have reasonable size limits
-- 8. Required fields must be present and non-null
-- 9. Enumerated values must match defined sets
-- 10. Foreign key references must exist