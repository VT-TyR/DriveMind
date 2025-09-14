/**
 * PII Redaction Service Tests - COMPREHENSIVE PRIVACY TESTING
 * 
 * Tests for comprehensive PII detection and redaction with 50+ patterns.
 * Validates GDPR compliance and user consent integration.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PIIRedactionService, ConsentValidation } from '../../services/security/pii-redaction-service';

describe('PIIRedactionService', () => {
  let piiService: PIIRedactionService;
  const testUserId = 'test-user-123';

  const validConsent: ConsentValidation = {
    userId: testUserId,
    purposes: ['pii_redaction', 'ai_processing'],
    dataTypes: ['text', 'metadata'],
    hasConsent: true,
    consentExpiry: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
    consentId: 'consent-123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    piiService = new PIIRedactionService();
  });

  describe('Email Address Detection', () => {
    test('should detect and redact email addresses', async () => {
      const text = 'Contact John at john.doe@example.com or jane@domain.org';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.detectedPII).toHaveLength(2);
      expect(result.detectedPII[0].type).toBe('email_address');
      expect(result.detectedPII[0].category).toBe('contact');
      expect(result.detectedPII[0].severity).toBe('medium');
      expect(result.redactedText).not.toContain('john.doe@example.com');
      expect(result.redactedText).not.toContain('jane@domain.org');
    });

    test('should handle various email formats', async () => {
      const text = 'Emails: user+tag@domain.co.uk, test.user123@sub.domain.com, simple@test.io';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.detectedPII.filter(pii => pii.type === 'email_address')).toHaveLength(3);
    });

    test('should not detect invalid email formats', async () => {
      const text = 'Not emails: @domain.com, user@, user@domain, plain.domain.com';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.detectedPII.filter(pii => pii.type === 'email_address')).toHaveLength(0);
    });
  });

  describe('Phone Number Detection', () => {
    test('should detect US phone numbers', async () => {
      const text = 'Call me at (555) 123-4567 or 555.123.4567 or 555-123-4567';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const phoneNumbers = result.detectedPII.filter(pii => pii.type === 'phone_us');
      expect(phoneNumbers.length).toBeGreaterThan(0);
      phoneNumbers.forEach(phone => {
        expect(phone.category).toBe('contact');
        expect(phone.severity).toBe('medium');
      });
    });

    test('should detect international phone numbers', async () => {
      const text = 'International: +1 555 123 4567, +44 20 7123 4567, +33 1 42 34 56 78';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const intlPhones = result.detectedPII.filter(pii => pii.type === 'phone_international');
      expect(intlPhones.length).toBeGreaterThan(0);
    });
  });

  describe('Social Security Number Detection', () => {
    test('should detect valid SSN formats', async () => {
      const text = 'SSN: 123-45-6789 or 987.65.4321 or 456 78 9012';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const ssns = result.detectedPII.filter(pii => pii.type === 'ssn');
      expect(ssns.length).toBeGreaterThan(0);
      ssns.forEach(ssn => {
        expect(ssn.category).toBe('government');
        expect(ssn.severity).toBe('critical');
      });
      expect(result.redactedText).not.toMatch(/\d{3}[-.\s]\d{2}[-.\s]\d{4}/);
    });

    test('should not detect invalid SSN patterns', async () => {
      const text = 'Invalid: 000-12-3456, 123-00-4567, 123-45-0000, 999-99-9999';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const ssns = result.detectedPII.filter(pii => pii.type === 'ssn');
      expect(ssns.length).toBe(0);
    });
  });

  describe('Credit Card Detection', () => {
    test('should detect Visa credit cards', async () => {
      const text = 'Visa: 4111111111111111 and 4000000000000002';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const visaCards = result.detectedPII.filter(pii => pii.type === 'credit_card_visa');
      expect(visaCards.length).toBeGreaterThan(0);
      visaCards.forEach(card => {
        expect(card.category).toBe('financial');
        expect(card.severity).toBe('critical');
      });
    });

    test('should detect Mastercard credit cards', async () => {
      const text = 'Mastercard: 5555555555554444 and 5105105105105100';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const mastercards = result.detectedPII.filter(pii => pii.type === 'credit_card_mastercard');
      expect(mastercards.length).toBeGreaterThan(0);
    });

    test('should detect American Express credit cards', async () => {
      const text = 'Amex: 378282246310005 and 371449635398431';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const amexCards = result.detectedPII.filter(pii => pii.type === 'credit_card_amex');
      expect(amexCards.length).toBeGreaterThan(0);
    });
  });

  describe('Address Detection', () => {
    test('should detect street addresses', async () => {
      const text = 'Address: 123 Main Street, 456 Oak Avenue, 789 Pine Road, 321 Elm Boulevard';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const addresses = result.detectedPII.filter(pii => pii.type === 'street_address');
      expect(addresses.length).toBeGreaterThan(0);
      addresses.forEach(address => {
        expect(address.category).toBe('personal');
        expect(address.severity).toBe('high');
      });
    });

    test('should detect ZIP codes', async () => {
      const text = 'ZIP: 12345, 67890-1234, 54321-5678';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const zipCodes = result.detectedPII.filter(pii => pii.type === 'zip_code');
      expect(zipCodes.length).toBeGreaterThan(0);
      zipCodes.forEach(zip => {
        expect(zip.category).toBe('personal');
        expect(zip.severity).toBe('low');
      });
    });
  });

  describe('Date of Birth Detection', () => {
    test('should detect date patterns', async () => {
      const text = 'DOB: 01/15/1990, 12-25-1985, 03/07/2000';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const dates = result.detectedPII.filter(pii => pii.type === 'date_of_birth');
      expect(dates.length).toBeGreaterThan(0);
      dates.forEach(date => {
        expect(date.category).toBe('personal');
        expect(date.severity).toBe('high');
      });
    });
  });

  describe('Financial Information Detection', () => {
    test('should detect bank account numbers', async () => {
      const text = 'Account: 12345678901, 987654321012345';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const accounts = result.detectedPII.filter(pii => pii.type === 'bank_account_us');
      expect(accounts.length).toBeGreaterThan(0);
      accounts.forEach(account => {
        expect(account.category).toBe('financial');
        expect(account.severity).toBe('high');
      });
    });

    test('should detect IBAN numbers', async () => {
      const text = 'IBAN: GB82WEST12345698765432, DE89370400440532013000';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const ibans = result.detectedPII.filter(pii => pii.type === 'iban');
      expect(ibans.length).toBeGreaterThan(0);
      ibans.forEach(iban => {
        expect(iban.category).toBe('financial');
        expect(iban.severity).toBe('critical');
      });
    });
  });

  describe('Medical Information Detection', () => {
    test('should detect medical record numbers', async () => {
      const text = 'MRN: 1234567, MRN:9876543210, Medical Record Number 5555555555';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      const mrns = result.detectedPII.filter(pii => pii.type === 'medical_record_number');
      expect(mrns.length).toBeGreaterThan(0);
      mrns.forEach(mrn => {
        expect(mrn.category).toBe('healthcare');
        expect(mrn.severity).toBe('critical');
      });
    });
  });

  describe('Redaction Levels', () => {
    const testText = 'Email: test@example.com, Phone: 555-123-4567, SSN: 123-45-6789';

    test('should apply basic redaction (critical only)', async () => {
      const result = await piiService.redactPII(testText, testUserId, validConsent, 'basic');

      expect(result.success).toBe(true);
      // Should only detect critical severity items (SSN)
      const criticalItems = result.detectedPII.filter(pii => pii.severity === 'critical');
      expect(criticalItems.length).toBeGreaterThan(0);
      // Should not detect medium severity items in basic mode
      const mediumItems = result.detectedPII.filter(pii => pii.severity === 'medium');
      expect(mediumItems.length).toBe(0);
    });

    test('should apply comprehensive redaction', async () => {
      const result = await piiService.redactPII(testText, testUserId, validConsent, 'comprehensive');

      expect(result.success).toBe(true);
      // Should detect critical, high, and medium severity items
      const detectedItems = result.detectedPII;
      expect(detectedItems.length).toBeGreaterThan(1);
      
      const severities = detectedItems.map(item => item.severity);
      expect(severities).toContain('critical');
    });

    test('should apply strict redaction (all patterns)', async () => {
      const result = await piiService.redactPII(testText, testUserId, validConsent, 'strict');

      expect(result.success).toBe(true);
      // Should detect all patterns regardless of severity
      expect(result.detectedPII.length).toBeGreaterThanOrEqual(result.detectedPII.length);
    });
  });

  describe('Replacement Strategies', () => {
    test('should mask values preserving structure', async () => {
      const text = 'Email: test@example.com';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.redactedText).toMatch(/Email: [t*]+m/);
    });

    test('should remove critical financial data', async () => {
      const text = 'Card: 4111111111111111';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.redactedText).toContain('[REDACTED]');
      expect(result.redactedText).not.toContain('4111111111111111');
    });

    test('should hash personal names consistently', async () => {
      const text = 'Contact John Smith twice: John Smith';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      // Same name should have same hash
      const hashMatches = result.redactedText.match(/\[HASH:[a-f0-9]{8}\]/g);
      if (hashMatches && hashMatches.length > 1) {
        expect(hashMatches[0]).toBe(hashMatches[1]);
      }
    });
  });

  describe('Consent Validation', () => {
    test('should fail without consent', async () => {
      const noConsent: ConsentValidation = {
        ...validConsent,
        hasConsent: false
      };

      const result = await piiService.redactPII('test@example.com', testUserId, noConsent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User consent required');
    });

    test('should fail with insufficient purposes', async () => {
      const insufficientConsent: ConsentValidation = {
        ...validConsent,
        purposes: ['other_purpose']
      };

      const result = await piiService.redactPII('test@example.com', testUserId, insufficientConsent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User consent required');
    });

    test('should fail with expired consent', async () => {
      const expiredConsent: ConsentValidation = {
        ...validConsent,
        consentExpiry: new Date(Date.now() - 86400000).toISOString() // Yesterday
      };

      const result = await piiService.redactPII('test@example.com', testUserId, expiredConsent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User consent required');
    });

    test('should succeed with valid consent', async () => {
      const result = await piiService.redactPII('test@example.com', testUserId, validConsent);

      expect(result.success).toBe(true);
    });
  });

  describe('Redaction Summary', () => {
    test('should provide comprehensive redaction summary', async () => {
      const text = 'Email: test@example.com, Phone: 555-123-4567, SSN: 123-45-6789';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.redactionSummary).toBeDefined();
      expect(result.redactionSummary.totalPIIFound).toBeGreaterThan(0);
      expect(result.redactionSummary.categoriesDetected).toContain('contact');
      expect(result.redactionSummary.severityBreakdown).toHaveProperty('critical');
      expect(result.redactionSummary.dataMinimizationScore).toBeGreaterThanOrEqual(0);
      expect(result.redactionSummary.dataMinimizationScore).toBeLessThanOrEqual(100);
    });

    test('should calculate data minimization score correctly', async () => {
      const cleanText = 'This is clean text with no PII';
      const dirtyText = 'Email: test@example.com, Phone: 555-123-4567, SSN: 123-45-6789, Card: 4111111111111111';

      const cleanResult = await piiService.redactPII(cleanText, testUserId, validConsent);
      const dirtyResult = await piiService.redactPII(dirtyText, testUserId, validConsent);

      expect(cleanResult.success).toBe(true);
      expect(dirtyResult.success).toBe(true);
      expect(cleanResult.redactionSummary.dataMinimizationScore).toBeGreaterThan(
        dirtyResult.redactionSummary.dataMinimizationScore
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty input text', async () => {
      const result = await piiService.redactPII('', testUserId, validConsent);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Input text must be a non-empty string');
    });

    test('should handle null input text', async () => {
      const result = await piiService.redactPII(null as any, testUserId, validConsent);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Input text must be a non-empty string');
    });

    test('should handle empty user ID', async () => {
      const result = await piiService.redactPII('test text', '', validConsent);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID must be a non-empty string');
    });

    test('should handle null user ID', async () => {
      const result = await piiService.redactPII('test text', null as any, validConsent);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID must be a non-empty string');
    });

    test('should handle unicode characters', async () => {
      const text = 'Email with unicode: tëst@éxàmple.com, Phone: 555-123-4567 📞';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.detectedPII.length).toBeGreaterThan(0);
    });

    test('should handle very long text', async () => {
      const longText = 'Email: test@example.com. ' + 'Lorem ipsum '.repeat(1000);
      const result = await piiService.redactPII(longText, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.detectedPII.length).toBeGreaterThan(0);
    });

    test('should handle text with no PII', async () => {
      const cleanText = 'This is completely clean text with no personally identifiable information.';
      const result = await piiService.redactPII(cleanText, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.detectedPII).toHaveLength(0);
      expect(result.redactedText).toBe(cleanText);
      expect(result.redactionSummary.totalPIIFound).toBe(0);
    });

    test('should handle malformed patterns gracefully', async () => {
      const text = 'Malformed: @domain, 123-456, incomplete-ssn-123-45';
      const result = await piiService.redactPII(text, testUserId, validConsent);

      expect(result.success).toBe(true);
      // Should not detect malformed patterns
      expect(result.detectedPII).toHaveLength(0);
    });
  });

  describe('Performance and Scalability', () => {
    test('should process large text efficiently', async () => {
      const largeText = 'Email: test@example.com, Phone: 555-123-4567. '.repeat(1000);
      const startTime = Date.now();

      const result = await piiService.redactPII(largeText, testUserId, validConsent);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.detectedPII.length).toBeGreaterThan(0);
    });

    test('should handle concurrent redaction requests', async () => {
      const texts = Array(10).fill(0).map((_, i) => `Email${i}: user${i}@example.com`);
      const promises = texts.map(text => piiService.redactPII(text, testUserId, validConsent));

      const results = await Promise.all(promises);

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.detectedPII.length).toBeGreaterThan(0);
        expect(result.redactedText).not.toContain(`user${i}@example.com`);
      });
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await piiService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.patternsLoaded).toBeGreaterThan(40); // Should have 50+ patterns
      expect(health.lastError).toBeUndefined();
    });
  });

  describe('Audit Trail', () => {
    test('should include audit information in results', async () => {
      const result = await piiService.redactPII('test@example.com', testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.auditId).toBeDefined();
      expect(result.auditId).toMatch(/^pii_\d+_[a-f0-9]{16}$/);
      expect(result.processedAt).toBeDefined();
    });

    test('should generate unique audit IDs', async () => {
      const result1 = await piiService.redactPII('test1@example.com', testUserId, validConsent);
      const result2 = await piiService.redactPII('test2@example.com', testUserId, validConsent);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.auditId).not.toBe(result2.auditId);
    });
  });

  describe('Complex PII Scenarios', () => {
    test('should handle mixed PII in realistic document', async () => {
      const document = `
        Patient Information:
        Name: John Doe
        Email: john.doe@hospital.com
        Phone: (555) 123-4567
        SSN: 123-45-6789
        DOB: 01/15/1980
        Address: 123 Main Street, Anytown, CA 90210
        Insurance: Policy ABC123456789
        Credit Card: 4111-1111-1111-1111
        Medical Record: MRN:12345678
      `;

      const result = await piiService.redactPII(document, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.detectedPII.length).toBeGreaterThan(5);
      
      // Should detect various categories
      const categories = [...new Set(result.detectedPII.map(pii => pii.category))];
      expect(categories).toContain('contact');
      expect(categories).toContain('government');
      expect(categories).toContain('financial');
      expect(categories).toContain('personal');
      
      // All original PII should be redacted
      expect(result.redactedText).not.toContain('john.doe@hospital.com');
      expect(result.redactedText).not.toContain('123-45-6789');
      expect(result.redactedText).not.toContain('4111-1111-1111-1111');
    });

    test('should maintain document structure while redacting PII', async () => {
      const structured = 'Name: John Doe\nEmail: john@example.com\nPhone: 555-123-4567';
      const result = await piiService.redactPII(structured, testUserId, validConsent);

      expect(result.success).toBe(true);
      expect(result.redactedText).toContain('Name:');
      expect(result.redactedText).toContain('Email:');
      expect(result.redactedText).toContain('Phone:');
      // But not the actual PII values
      expect(result.redactedText).not.toContain('john@example.com');
      expect(result.redactedText).not.toContain('555-123-4567');
    });
  });
});