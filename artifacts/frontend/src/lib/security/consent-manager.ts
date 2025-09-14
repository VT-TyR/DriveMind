/**
 * GDPR-Compliant Consent Management System
 * 
 * Implements Article 7 (Consent) of GDPR for PII processing by AI services.
 * Provides granular consent management for different purposes and data types.
 */

export interface ConsentPurpose {
  id: string;
  name: string;
  description: string;
  dataTypes: string[];
  required: boolean;
  category: 'essential' | 'ai-processing' | 'analytics' | 'marketing';
}

export interface ConsentRecord {
  id: string;
  userId: string;
  purposes: Record<string, boolean>;
  dataTypes: Record<string, boolean>;
  grantedAt: Date;
  expiresAt?: Date;
  version: string;
  ipAddress?: string;
  userAgent?: string;
  method: 'explicit' | 'implicit' | 'opt-in' | 'opt-out';
}

export interface ConsentStatus {
  hasConsent: boolean;
  purposes: string[];
  dataTypes: string[];
  expiresAt?: Date;
  grantedAt?: Date;
  needsRenewal: boolean;
}

/**
 * Predefined consent purposes for DriveMind
 */
export const CONSENT_PURPOSES: Record<string, ConsentPurpose> = {
  file_classification: {
    id: 'file_classification',
    name: 'AI File Classification',
    description: 'Use AI to automatically categorize and classify your files based on content and metadata.',
    dataTypes: ['file_names', 'file_metadata', 'file_content_summary'],
    required: false,
    category: 'ai-processing'
  },
  duplicate_detection: {
    id: 'duplicate_detection',
    name: 'Duplicate Detection',
    description: 'Analyze file content and metadata to identify potential duplicates.',
    dataTypes: ['file_names', 'file_metadata', 'file_hashes'],
    required: false,
    category: 'ai-processing'
  },
  organization_suggestions: {
    id: 'organization_suggestions',
    name: 'Organization Suggestions',
    description: 'Generate AI-powered recommendations for organizing your files and folders.',
    dataTypes: ['file_names', 'file_metadata', 'folder_structure'],
    required: false,
    category: 'ai-processing'
  },
  content_analysis: {
    id: 'content_analysis',
    name: 'Content Analysis',
    description: 'Analyze file content to provide insights and smart organization rules.',
    dataTypes: ['file_content', 'file_text', 'file_images'],
    required: false,
    category: 'ai-processing'
  },
  essential_features: {
    id: 'essential_features',
    name: 'Essential Application Features',
    description: 'Core functionality required for the application to work properly.',
    dataTypes: ['user_id', 'session_data'],
    required: true,
    category: 'essential'
  }
};

/**
 * Data types that may contain PII
 */
export const PII_DATA_TYPES = {
  file_names: 'File names may contain personal information',
  file_metadata: 'File creation dates, authors, and properties',
  file_content: 'Full file content including text and embedded data',
  file_content_summary: 'AI-generated summaries of file content',
  file_text: 'Extracted text content from documents',
  file_images: 'Image content and metadata',
  file_hashes: 'Content hashes for duplicate detection',
  folder_structure: 'Folder organization and hierarchy',
  user_id: 'User identification for session management',
  session_data: 'Authentication and session information'
};

/**
 * Local storage key for consent data
 */
const CONSENT_STORAGE_KEY = 'drivemind_consent_v1';

/**
 * Current consent framework version
 */
const CONSENT_VERSION = '1.0.0';

/**
 * Store consent record locally
 */
function storeConsentRecord(record: ConsentRecord): void {
  try {
    const encryptedRecord = btoa(JSON.stringify({
      ...record,
      grantedAt: record.grantedAt.toISOString(),
      expiresAt: record.expiresAt?.toISOString()
    }));
    localStorage.setItem(CONSENT_STORAGE_KEY, encryptedRecord);
  } catch (error) {
    console.error('Failed to store consent record:', error);
  }
}

/**
 * Retrieve consent record from local storage
 */
function getStoredConsentRecord(): ConsentRecord | null {
  try {
    const encryptedRecord = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!encryptedRecord) return null;
    
    const data = JSON.parse(atob(encryptedRecord));
    return {
      ...data,
      grantedAt: new Date(data.grantedAt),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
    };
  } catch (error) {
    console.error('Failed to retrieve consent record:', error);
    return null;
  }
}

/**
 * Clear stored consent record
 */
function clearStoredConsentRecord(): void {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear consent record:', error);
  }
}

/**
 * Check if consent is expired
 */
function isConsentExpired(record: ConsentRecord): boolean {
  if (!record.expiresAt) return false;
  return new Date() > record.expiresAt;
}

/**
 * Check if consent needs renewal (expires within 7 days)
 */
function needsConsentRenewal(record: ConsentRecord): boolean {
  if (!record.expiresAt) return false;
  const renewalThreshold = new Date();
  renewalThreshold.setDate(renewalThreshold.getDate() + 7);
  return record.expiresAt < renewalThreshold;
}

/**
 * Grant consent for specified purposes and data types
 */
export async function grantConsent(
  userId: string,
  purposes: string[],
  dataTypes: string[],
  expirationMonths: number = 12
): Promise<ConsentRecord> {
  const now = new Date();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expirationMonths);
  
  const purposeMap: Record<string, boolean> = {};
  purposes.forEach(purpose => {
    purposeMap[purpose] = true;
  });
  
  const dataTypeMap: Record<string, boolean> = {};
  dataTypes.forEach(dataType => {
    dataTypeMap[dataType] = true;
  });
  
  const consentRecord: ConsentRecord = {
    id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    purposes: purposeMap,
    dataTypes: dataTypeMap,
    grantedAt: now,
    expiresAt,
    version: CONSENT_VERSION,
    method: 'explicit'
  };
  
  // Store locally
  storeConsentRecord(consentRecord);
  
  // Send to backend API
  try {
    const response = await fetch('/api/auth/drive/consent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        granted: true,
        purposes,
        dataTypes,
        expiresAt: expiresAt.toISOString()
      })
    });
    
    if (!response.ok) {
      console.warn('Failed to sync consent to backend:', await response.text());
    }
  } catch (error) {
    console.warn('Failed to sync consent to backend:', error);
  }
  
  return consentRecord;
}

/**
 * Revoke consent
 */
export async function revokeConsent(userId: string): Promise<void> {
  // Clear local storage
  clearStoredConsentRecord();
  
  // Revoke on backend
  try {
    const response = await fetch('/api/auth/drive/consent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        granted: false,
        purposes: [],
        dataTypes: []
      })
    });
    
    if (!response.ok) {
      console.warn('Failed to revoke consent on backend:', await response.text());
    }
  } catch (error) {
    console.warn('Failed to revoke consent on backend:', error);
  }
}

/**
 * Check current consent status
 */
export async function checkConsentStatus(userId: string): Promise<ConsentStatus> {
  // Check local storage first
  const localRecord = getStoredConsentRecord();
  
  if (localRecord && !isConsentExpired(localRecord)) {
    return {
      hasConsent: true,
      purposes: Object.keys(localRecord.purposes).filter(p => localRecord.purposes[p]),
      dataTypes: Object.keys(localRecord.dataTypes).filter(dt => localRecord.dataTypes[dt]),
      expiresAt: localRecord.expiresAt,
      grantedAt: localRecord.grantedAt,
      needsRenewal: needsConsentRenewal(localRecord)
    };
  }
  
  // Check backend if local record is missing or expired
  try {
    const response = await fetch(`/api/auth/drive/consent?userId=${encodeURIComponent(userId)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.hasConsent) {
        // Update local storage with backend data
        const backendRecord: ConsentRecord = {
          id: `backend_${Date.now()}`,
          userId,
          purposes: data.purposes.reduce((acc: Record<string, boolean>, p: string) => {
            acc[p] = true;
            return acc;
          }, {}),
          dataTypes: data.dataTypes.reduce((acc: Record<string, boolean>, dt: string) => {
            acc[dt] = true;
            return acc;
          }, {}),
          grantedAt: new Date(data.grantedAt),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
          version: CONSENT_VERSION,
          method: 'explicit'
        };
        
        if (!isConsentExpired(backendRecord)) {
          storeConsentRecord(backendRecord);
          return {
            hasConsent: true,
            purposes: data.purposes,
            dataTypes: data.dataTypes,
            expiresAt: backendRecord.expiresAt,
            grantedAt: backendRecord.grantedAt,
            needsRenewal: needsConsentRenewal(backendRecord)
          };
        }
      }
    }
  } catch (error) {
    console.warn('Failed to check consent status on backend:', error);
  }
  
  return {
    hasConsent: false,
    purposes: [],
    dataTypes: [],
    needsRenewal: false
  };
}

/**
 * Check if specific purpose is consented
 */
export async function hasConsentForPurpose(userId: string, purpose: string): Promise<boolean> {
  const status = await checkConsentStatus(userId);
  return status.hasConsent && status.purposes.includes(purpose);
}

/**
 * Check if specific data type is consented
 */
export async function hasConsentForDataType(userId: string, dataType: string): Promise<boolean> {
  const status = await checkConsentStatus(userId);
  return status.hasConsent && status.dataTypes.includes(dataType);
}

/**
 * Get required consent for AI processing
 */
export function getRequiredAIConsent(): { purposes: string[]; dataTypes: string[] } {
  const purposes = [
    'file_classification',
    'duplicate_detection',
    'organization_suggestions'
  ];
  
  const dataTypes = [
    'file_names',
    'file_metadata',
    'file_content_summary'
  ];
  
  return { purposes, dataTypes };
}

/**
 * Get consent summary for UI display
 */
export function getConsentSummary(record: ConsentRecord | null): {
  granted: number;
  total: number;
  essential: number;
  optional: number;
  categories: Record<string, number>;
} {
  const totalPurposes = Object.keys(CONSENT_PURPOSES).length;
  let grantedCount = 0;
  let essentialCount = 0;
  let optionalCount = 0;
  const categories: Record<string, number> = {};
  
  Object.values(CONSENT_PURPOSES).forEach(purpose => {
    const isGranted = record?.purposes[purpose.id] || false;
    if (isGranted) grantedCount++;
    
    if (purpose.required) {
      essentialCount++;
    } else {
      optionalCount++;
    }
    
    if (!categories[purpose.category]) {
      categories[purpose.category] = 0;
    }
    if (isGranted) {
      categories[purpose.category]++;
    }
  });
  
  return {
    granted: grantedCount,
    total: totalPurposes,
    essential: essentialCount,
    optional: optionalCount,
    categories
  };
}

/**
 * Export consent data for GDPR compliance (Right to Data Portability)
 */
export async function exportConsentData(userId: string): Promise<any> {
  const status = await checkConsentStatus(userId);
  const localRecord = getStoredConsentRecord();
  
  return {
    userId,
    framework_version: CONSENT_VERSION,
    export_date: new Date().toISOString(),
    current_status: status,
    local_record: localRecord,
    purposes_definitions: CONSENT_PURPOSES,
    data_types_definitions: PII_DATA_TYPES
  };
}