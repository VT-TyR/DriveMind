/**
 * Consent Management Tests
 * 
 * Comprehensive test suite for GDPR-compliant consent management
 * covering user consent lifecycle, data portability, and compliance.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/test';
import {
  grantConsent,
  revokeConsent,
  checkConsentStatus,
  hasConsentForPurpose,
  hasConsentForDataType,
  getRequiredAIConsent,
  getConsentSummary,
  exportConsentData,
  CONSENT_PURPOSES,
  PII_DATA_TYPES
} from '../../src/lib/security/consent-manager';

// Mock localStorage
const mockLocalStorage = {
  store: new Map<string, string>(),
  getItem: jest.fn((key: string) => mockLocalStorage.store.get(key) || null),
  setItem: jest.fn((key: string, value: string) => mockLocalStorage.store.set(key, value)),
  removeItem: jest.fn((key: string) => mockLocalStorage.store.delete(key)),
  clear: jest.fn(() => mockLocalStorage.store.clear())
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock fetch for API calls
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('GDPR Consent Management', () => {
  const testUserId = 'test-user-123';
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    
    // Default successful API response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    } as Response);
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  describe('Consent Granting', () => {
    it('should grant consent for specified purposes and data types', async () => {
      const purposes = ['file_classification', 'duplicate_detection'];
      const dataTypes = ['file_names', 'file_metadata'];
      
      const record = await grantConsent(testUserId, purposes, dataTypes);
      
      expect(record).toBeDefined();
      expect(record.userId).toBe(testUserId);
      expect(record.purposes['file_classification']).toBe(true);
      expect(record.purposes['duplicate_detection']).toBe(true);
      expect(record.dataTypes['file_names']).toBe(true);
      expect(record.dataTypes['file_metadata']).toBe(true);
      expect(record.grantedAt).toBeInstanceOf(Date);
      expect(record.expiresAt).toBeInstanceOf(Date);
    });

    it('should store consent record locally', async () => {
      const purposes = ['file_classification'];
      const dataTypes = ['file_names'];
      
      await grantConsent(testUserId, purposes, dataTypes);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      expect(mockLocalStorage.store.size).toBeGreaterThan(0);
    });

    it('should send consent to backend API', async () => {
      const purposes = ['file_classification'];
      const dataTypes = ['file_names'];
      
      await grantConsent(testUserId, purposes, dataTypes);
      
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/drive/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining(testUserId)
      });
    });

    it('should handle custom expiration period', async () => {
      const purposes = ['file_classification'];
      const dataTypes = ['file_names'];
      const expirationMonths = 6;
      
      const record = await grantConsent(testUserId, purposes, dataTypes, expirationMonths);
      
      const expectedExpiry = new Date();
      expectedExpiry.setMonth(expectedExpiry.getMonth() + expirationMonths);
      
      expect(record.expiresAt!.getMonth()).toBe(expectedExpiry.getMonth());
    });

    it('should handle backend API failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const purposes = ['file_classification'];
      const dataTypes = ['file_names'];
      
      const record = await grantConsent(testUserId, purposes, dataTypes);
      
      // Should still return record even if backend fails
      expect(record).toBeDefined();
      expect(record.userId).toBe(testUserId);
    });

    it('should generate unique consent IDs', async () => {
      const purposes = ['file_classification'];
      const dataTypes = ['file_names'];
      
      const record1 = await grantConsent('user1', purposes, dataTypes);
      const record2 = await grantConsent('user2', purposes, dataTypes);
      
      expect(record1.id).not.toBe(record2.id);
      expect(record1.id).toMatch(/^consent_\d+_[a-z0-9]+$/);
    });
  });

  describe('Consent Revocation', () => {
    it('should revoke all consent', async () => {
      // First grant consent
      const purposes = ['file_classification'];
      const dataTypes = ['file_names'];
      await grantConsent(testUserId, purposes, dataTypes);
      
      // Then revoke
      await revokeConsent(testUserId);
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/drive/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"granted":false')
      });
    });

    it('should clear local storage on revocation', async () => {
      // Grant consent first
      await grantConsent(testUserId, ['file_classification'], ['file_names']);
      expect(mockLocalStorage.store.size).toBeGreaterThan(0);
      
      // Revoke consent
      await revokeConsent(testUserId);
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });

    it('should handle revocation API failures', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      // Should not throw
      await expect(revokeConsent(testUserId)).resolves.not.toThrow();
    });
  });

  describe('Consent Status Checking', () => {
    it('should return consent status from local storage', async () => {
      const purposes = ['file_classification', 'duplicate_detection'];
      const dataTypes = ['file_names', 'file_metadata'];
      
      await grantConsent(testUserId, purposes, dataTypes);
      const status = await checkConsentStatus(testUserId);
      
      expect(status.hasConsent).toBe(true);
      expect(status.purposes).toEqual(expect.arrayContaining(purposes));
      expect(status.dataTypes).toEqual(expect.arrayContaining(dataTypes));
      expect(status.grantedAt).toBeInstanceOf(Date);
    });

    it('should return no consent for new user', async () => {
      const status = await checkConsentStatus('new-user');
      
      expect(status.hasConsent).toBe(false);
      expect(status.purposes).toEqual([]);
      expect(status.dataTypes).toEqual([]);
    });

    it('should check backend if local record is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          hasConsent: true,
          purposes: ['file_classification'],
          dataTypes: ['file_names'],
          grantedAt: new Date().toISOString()
        })
      } as Response);
      
      const status = await checkConsentStatus(testUserId);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/auth/drive/consent?userId=${encodeURIComponent(testUserId)}`)
      );
      expect(status.hasConsent).toBe(true);
    });

    it('should handle expired consent', async () => {
      // Create expired consent record
      const expiredRecord = {
        id: 'test-consent',
        userId: testUserId,
        purposes: { file_classification: true },
        dataTypes: { file_names: true },
        grantedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
        version: '1.0.0',
        method: 'explicit' as const
      };
      
      const encryptedRecord = btoa(JSON.stringify({
        ...expiredRecord,
        grantedAt: expiredRecord.grantedAt.toISOString(),
        expiresAt: expiredRecord.expiresAt.toISOString()
      }));
      
      mockLocalStorage.setItem('drivemind_consent_v1', encryptedRecord);
      
      const status = await checkConsentStatus(testUserId);
      
      expect(status.hasConsent).toBe(false);
    });

    it('should detect consent renewal needs', async () => {
      // Create consent expiring soon
      const soonToExpire = new Date();
      soonToExpire.setDate(soonToExpire.getDate() + 3); // Expires in 3 days
      
      await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      // Manually update expiry date
      const storedData = mockLocalStorage.store.get('drivemind_consent_v1');
      if (storedData) {
        const record = JSON.parse(atob(storedData));
        record.expiresAt = soonToExpire.toISOString();
        mockLocalStorage.setItem('drivemind_consent_v1', btoa(JSON.stringify(record)));
      }
      
      const status = await checkConsentStatus(testUserId);
      
      expect(status.needsRenewal).toBe(true);
    });
  });

  describe('Purpose and Data Type Consent', () => {
    it('should check consent for specific purpose', async () => {
      await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      const hasConsent = await hasConsentForPurpose(testUserId, 'file_classification');
      const noConsent = await hasConsentForPurpose(testUserId, 'content_analysis');
      
      expect(hasConsent).toBe(true);
      expect(noConsent).toBe(false);
    });

    it('should check consent for specific data type', async () => {
      await grantConsent(testUserId, ['file_classification'], ['file_names', 'file_metadata']);
      
      const hasFileNames = await hasConsentForDataType(testUserId, 'file_names');
      const hasFileContent = await hasConsentForDataType(testUserId, 'file_content');
      
      expect(hasFileNames).toBe(true);
      expect(hasFileContent).toBe(false);
    });

    it('should handle consent check errors gracefully', async () => {
      // Corrupt local storage
      mockLocalStorage.setItem('drivemind_consent_v1', 'invalid-data');
      
      const hasConsent = await hasConsentForPurpose(testUserId, 'file_classification');
      
      expect(hasConsent).toBe(false);
    });
  });

  describe('AI Consent Requirements', () => {
    it('should return required AI consent purposes and data types', () => {
      const requirements = getRequiredAIConsent();
      
      expect(requirements.purposes).toContain('file_classification');
      expect(requirements.purposes).toContain('duplicate_detection');
      expect(requirements.purposes).toContain('organization_suggestions');
      
      expect(requirements.dataTypes).toContain('file_names');
      expect(requirements.dataTypes).toContain('file_metadata');
      expect(requirements.dataTypes).toContain('file_content_summary');
    });
  });

  describe('Consent Summary', () => {
    it('should generate consent summary for granted consent', async () => {
      const purposes = ['file_classification', 'duplicate_detection'];
      const dataTypes = ['file_names', 'file_metadata'];
      const record = await grantConsent(testUserId, purposes, dataTypes);
      
      const summary = getConsentSummary(record);
      
      expect(summary.granted).toBe(2);
      expect(summary.total).toBe(Object.keys(CONSENT_PURPOSES).length);
      expect(summary.categories['ai-processing']).toBeGreaterThan(0);
    });

    it('should handle null consent record', () => {
      const summary = getConsentSummary(null);
      
      expect(summary.granted).toBe(0);
      expect(summary.total).toBeGreaterThan(0);
    });

    it('should categorize consent purposes correctly', async () => {
      // Grant consent for essential and AI purposes
      const purposes = ['essential_features', 'file_classification'];
      const dataTypes = ['user_id', 'file_names'];
      const record = await grantConsent(testUserId, purposes, dataTypes);
      
      const summary = getConsentSummary(record);
      
      expect(summary.categories.essential).toBe(1);
      expect(summary.categories['ai-processing']).toBe(1);
    });
  });

  describe('Data Export (GDPR Compliance)', () => {
    it('should export complete consent data', async () => {
      await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      const exportData = await exportConsentData(testUserId);
      
      expect(exportData.userId).toBe(testUserId);
      expect(exportData.framework_version).toBeDefined();
      expect(exportData.export_date).toBeDefined();
      expect(exportData.current_status).toBeDefined();
      expect(exportData.purposes_definitions).toBe(CONSENT_PURPOSES);
      expect(exportData.data_types_definitions).toBe(PII_DATA_TYPES);
    });

    it('should include local and current status in export', async () => {
      await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      const exportData = await exportConsentData(testUserId);
      
      expect(exportData.current_status.hasConsent).toBe(true);
      expect(exportData.local_record).toBeDefined();
      expect(exportData.local_record.userId).toBe(testUserId);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted local storage', async () => {
      mockLocalStorage.setItem('drivemind_consent_v1', 'corrupted-data');
      
      const status = await checkConsentStatus(testUserId);
      
      expect(status.hasConsent).toBe(false);
    });

    it('should handle malformed JSON in storage', async () => {
      mockLocalStorage.setItem('drivemind_consent_v1', btoa('{"malformed": json}'));
      
      const status = await checkConsentStatus(testUserId);
      
      expect(status.hasConsent).toBe(false);
    });

    it('should handle network failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      // Should not throw
      await expect(checkConsentStatus(testUserId)).resolves.not.toThrow();
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      } as Response);
      
      const status = await checkConsentStatus(testUserId);
      
      expect(status.hasConsent).toBe(false);
    });

    it('should validate consent purposes', async () => {
      const invalidPurposes = ['invalid_purpose'];
      const validDataTypes = ['file_names'];
      
      // Should still create record but may filter invalid purposes
      const record = await grantConsent(testUserId, invalidPurposes, validDataTypes);
      
      expect(record).toBeDefined();
    });

    it('should handle storage quota exceeded', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      
      // Should not throw
      await expect(
        grantConsent(testUserId, ['file_classification'], ['file_names'])
      ).resolves.not.toThrow();
    });
  });

  describe('Consent Versioning', () => {
    it('should use correct consent framework version', async () => {
      const record = await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      expect(record.version).toBe('1.0.0');
    });

    it('should handle version migration (future-proofing)', async () => {
      // Create old version consent
      const oldRecord = {
        id: 'old-consent',
        userId: testUserId,
        purposes: { file_classification: true },
        dataTypes: { file_names: true },
        grantedAt: new Date(),
        version: '0.9.0', // Old version
        method: 'explicit'
      };
      
      mockLocalStorage.setItem('drivemind_consent_v1', btoa(JSON.stringify({
        ...oldRecord,
        grantedAt: oldRecord.grantedAt.toISOString()
      })));
      
      const status = await checkConsentStatus(testUserId);
      
      // Should handle gracefully (implementation dependent)
      expect(status).toBeDefined();
    });
  });

  describe('GDPR Compliance Features', () => {
    it('should support granular purpose consent', async () => {
      // Grant consent for only some purposes
      const selectedPurposes = ['file_classification'];
      const allPurposes = Object.keys(CONSENT_PURPOSES);
      const record = await grantConsent(testUserId, selectedPurposes, ['file_names']);
      
      expect(Object.keys(record.purposes).filter(p => record.purposes[p])).toEqual(selectedPurposes);
      expect(Object.keys(record.purposes)).toEqual(selectedPurposes);
    });

    it('should track consent method', async () => {
      const record = await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      expect(record.method).toBe('explicit');
    });

    it('should support consent expiration', async () => {
      const record = await grantConsent(testUserId, ['file_classification'], ['file_names'], 6);
      
      expect(record.expiresAt).toBeDefined();
      expect(record.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should generate audit trail identifiers', async () => {
      const record = await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      expect(record.id).toBeDefined();
      expect(record.id).toMatch(/^consent_\d+_[a-f0-9]+$/);
    });
  });

  describe('Performance and Caching', () => {
    it('should cache consent status locally', async () => {
      await grantConsent(testUserId, ['file_classification'], ['file_names']);
      
      // First call
      const status1 = await checkConsentStatus(testUserId);
      
      // Second call should use cache (no additional API call)
      const status2 = await checkConsentStatus(testUserId);
      
      expect(status1).toEqual(status2);
    });

    it('should handle concurrent consent operations', async () => {
      const promises = [
        grantConsent(testUserId, ['file_classification'], ['file_names']),
        checkConsentStatus(testUserId),
        hasConsentForPurpose(testUserId, 'file_classification')
      ];
      
      // Should not throw
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });
});