/**
 * XSS Protection Tests
 * 
 * Comprehensive test suite for XSS protection utilities covering
 * input sanitization, output encoding, and security validations.
 */

import { describe, it, expect, beforeEach } from '@jest/test';
import {
  sanitizeHtml,
  encodeHtmlEntities,
  sanitizeFileName,
  sanitizeFolderPath,
  sanitizeJsonForDisplay,
  sanitizeUrl,
  validateInlineStyle,
  sanitizeCssClassName,
  sanitizeFilePreview,
  sanitizeSearchQuery,
  validateAndSanitizeInput,
  createTrustedHTML,
  safeJsonParse
} from '../../src/lib/security/xss-protection';

// Mock DOMPurify
jest.mock('isomorphic-dompurify', () => ({
  sanitize: jest.fn((dirty: string, config: any) => {
    // Simple mock that removes script tags and dangerous attributes
    return dirty
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');
  })
}));

describe('XSS Protection Utilities', () => {
  describe('HTML Sanitization', () => {
    it('should sanitize malicious script tags', () => {
      const maliciousHtml = '<p>Hello</p><script>alert("XSS")</script>';
      const sanitized = sanitizeHtml(maliciousHtml);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert("XSS")');
      expect(sanitized).toContain('<p>Hello</p>');
    });

    it('should remove dangerous event handlers', () => {
      const maliciousHtml = '<div onclick="alert(\'XSS\')">Click me</div>';
      const sanitized = sanitizeHtml(maliciousHtml);
      
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).toContain('<div>Click me</div>');
    });

    it('should remove javascript: URLs', () => {
      const maliciousHtml = '<a href="javascript:alert(\'XSS\')">Link</a>';
      const sanitized = sanitizeHtml(maliciousHtml);
      
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('<a href="">Link</a>');
    });

    it('should preserve safe HTML content', () => {
      const safeHtml = '<p><strong>Bold text</strong> and <em>italic text</em></p>';
      const sanitized = sanitizeHtml(safeHtml);
      
      expect(sanitized).toBe(safeHtml);
    });

    it('should handle empty or null input', () => {
      expect(sanitizeHtml('')).toBe('');
      expect(sanitizeHtml(null as any)).toBe('');
      expect(sanitizeHtml(undefined as any)).toBe('');
    });

    it('should apply stricter sanitization for file content', () => {
      const fileContent = '<div>File content <script>evil()</script></div>';
      const sanitized = sanitizeHtml(fileContent, true);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('evil()');
    });
  });

  describe('HTML Entity Encoding', () => {
    it('should encode dangerous HTML entities', () => {
      const dangerous = '<script>alert("XSS")</script>';
      const encoded = encodeHtmlEntities(dangerous);
      
      expect(encoded).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should encode all special characters', () => {
      const input = '&<>"\'`=/';
      const encoded = encodeHtmlEntities(input);
      
      expect(encoded).toBe('&amp;&lt;&gt;&quot;&#39;&#x60;&#x3D;&#x2F;');
    });

    it('should handle normal text safely', () => {
      const normalText = 'Hello World 123';
      const encoded = encodeHtmlEntities(normalText);
      
      expect(encoded).toBe(normalText);
    });

    it('should handle empty input', () => {
      expect(encodeHtmlEntities('')).toBe('');
      expect(encodeHtmlEntities(null as any)).toBe('');
    });
  });

  describe('File Name Sanitization', () => {
    it('should remove path traversal patterns', () => {
      const maliciousName = '../../../etc/passwd';
      const sanitized = sanitizeFileName(maliciousName);
      
      expect(sanitized).not.toContain('..');
      expect(sanitized).toBe('etc/passwd');
    });

    it('should remove dangerous HTML characters', () => {
      const dangerousName = 'file<script>.txt';
      const sanitized = sanitizeFileName(dangerousName);
      
      expect(sanitized).toBe('filescript.txt');
    });

    it('should handle long file names', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const sanitized = sanitizeFileName(longName);
      
      expect(sanitized.length).toBeLessThanOrEqual(255);
      expect(sanitized).toEndWith('.txt');
    });

    it('should provide default for invalid names', () => {
      expect(sanitizeFileName('')).toBe('untitled');
      expect(sanitizeFileName('.')).toBe('untitled');
      expect(sanitizeFileName('..')).toBe('untitled');
      expect(sanitizeFileName(null as any)).toBe('untitled');
    });

    it('should preserve valid file names', () => {
      const validName = 'document_2024.pdf';
      const sanitized = sanitizeFileName(validName);
      
      expect(sanitized).toBe(validName);
    });
  });

  describe('Folder Path Sanitization', () => {
    it('should sanitize folder path segments', () => {
      const maliciousPath = '/folder1/../../../etc/folder2';
      const sanitized = sanitizeFolderPath(maliciousPath);
      
      expect(sanitized).not.toContain('..');
      expect(sanitized).toBe('/folder1/etc/folder2');
    });

    it('should remove dangerous characters from paths', () => {
      const dangerousPath = '/folder<script>/subfolder';
      const sanitized = sanitizeFolderPath(dangerousPath);
      
      expect(sanitized).toBe('/folderscript/subfolder');
    });

    it('should provide default for invalid paths', () => {
      expect(sanitizeFolderPath('')).toBe('/');
      expect(sanitizeFolderPath(null as any)).toBe('/');
    });

    it('should preserve valid paths', () => {
      const validPath = '/Documents/Projects/2024';
      const sanitized = sanitizeFolderPath(validPath);
      
      expect(sanitized).toBe(validPath);
    });
  });

  describe('JSON Sanitization', () => {
    it('should sanitize string values in JSON', () => {
      const dangerousJson = {
        name: '<script>alert("XSS")</script>',
        description: 'Safe content'
      };
      
      const sanitized = sanitizeJsonForDisplay(dangerousJson);
      
      expect(sanitized.name).not.toContain('<script>');
      expect(sanitized.description).toBe('Safe content');
    });

    it('should handle nested objects', () => {
      const nestedJson = {
        user: {
          name: '<img onerror="alert(1)">',
          profile: {
            bio: 'Safe bio'
          }
        }
      };
      
      const sanitized = sanitizeJsonForDisplay(nestedJson);
      
      expect(sanitized.user.name).not.toContain('onerror');
      expect(sanitized.user.profile.bio).toBe('Safe bio');
    });

    it('should handle arrays', () => {
      const arrayJson = {
        tags: ['<script>evil</script>', 'safe-tag', '<img src=x onerror=alert(1)>']
      };
      
      const sanitized = sanitizeJsonForDisplay(arrayJson);
      
      expect(sanitized.tags[0]).not.toContain('<script>');
      expect(sanitized.tags[1]).toBe('safe-tag');
      expect(sanitized.tags[2]).not.toContain('onerror');
    });

    it('should preserve non-string values', () => {
      const mixedJson = {
        count: 42,
        active: true,
        value: null,
        items: [1, 2, 3]
      };
      
      const sanitized = sanitizeJsonForDisplay(mixedJson);
      
      expect(sanitized.count).toBe(42);
      expect(sanitized.active).toBe(true);
      expect(sanitized.value).toBeNull();
      expect(sanitized.items).toEqual([1, 2, 3]);
    });
  });

  describe('URL Sanitization', () => {
    it('should allow safe HTTP/HTTPS URLs', () => {
      const safeUrl = 'https://example.com/path';
      const sanitized = sanitizeUrl(safeUrl);
      
      expect(sanitized).toBe(safeUrl);
    });

    it('should allow mailto and tel URLs', () => {
      const mailtoUrl = 'mailto:user@example.com';
      const telUrl = 'tel:+1234567890';
      
      expect(sanitizeUrl(mailtoUrl)).toBe(mailtoUrl);
      expect(sanitizeUrl(telUrl)).toBe(telUrl);
    });

    it('should reject dangerous protocols', () => {
      const dangerousUrls = [
        'javascript:alert("XSS")',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox("XSS")',
        'file:///etc/passwd'
      ];
      
      dangerousUrls.forEach(url => {
        expect(sanitizeUrl(url)).toBe('');
      });
    });

    it('should handle invalid URLs', () => {
      expect(sanitizeUrl('not-a-url')).toBe('');
      expect(sanitizeUrl('')).toBe('');
      expect(sanitizeUrl(null as any)).toBe('');
    });
  });

  describe('CSS Security', () => {
    it('should validate safe inline styles', () => {
      const safeStyles = [
        'color: red;',
        'font-size: 14px;',
        'margin: 10px;'
      ];
      
      safeStyles.forEach(style => {
        expect(validateInlineStyle(style)).toBe(true);
      });
    });

    it('should reject dangerous inline styles', () => {
      const dangerousStyles = [
        'background: url(javascript:alert(1));',
        'color: expression(alert("XSS"));',
        '@import url("malicious.css");',
        'behavior: url(malicious.htc);'
      ];
      
      dangerousStyles.forEach(style => {
        expect(validateInlineStyle(style)).toBe(false);
      });
    });

    it('should sanitize CSS class names', () => {
      const dangerousClass = 'class-name"><script>alert(1)</script>';
      const sanitized = sanitizeCssClassName(dangerousClass);
      
      expect(sanitized).toBe('class-name');
    });

    it('should allow valid CSS class names', () => {
      const validClasses = [
        'btn btn-primary',
        'nav-item_active',
        'section-header-2'
      ];
      
      validClasses.forEach(className => {
        expect(sanitizeCssClassName(className)).toBe(className);
      });
    });
  });

  describe('File Content Preview', () => {
    it('should sanitize text file content', () => {
      const textContent = 'Normal text with <script>alert("XSS")</script>';
      const sanitized = sanitizeFilePreview(textContent, 'txt');
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Normal text with');
    });

    it('should sanitize HTML file content', () => {
      const htmlContent = '<p>Paragraph</p><script>alert("XSS")</script>';
      const sanitized = sanitizeFilePreview(htmlContent, 'html');
      
      expect(sanitized).toContain('<p>Paragraph</p>');
      expect(sanitized).not.toContain('<script>');
    });

    it('should sanitize JSON file content', () => {
      const jsonContent = '{"name": "<script>evil</script>", "value": 123}';
      const sanitized = sanitizeFilePreview(jsonContent, 'json');
      
      const parsed = JSON.parse(sanitized);
      expect(parsed.name).not.toContain('<script>');
      expect(parsed.value).toBe(123);
    });

    it('should limit content length', () => {
      const longContent = 'a'.repeat(10000);
      const sanitized = sanitizeFilePreview(longContent, 'txt');
      
      expect(sanitized.length).toBeLessThanOrEqual(5003); // 5000 + "..."
    });

    it('should handle CSV content', () => {
      const csvContent = 'name,value\n"<script>evil</script>",123\n"safe",456';
      const sanitized = sanitizeFilePreview(csvContent, 'csv');
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('safe,456');
    });
  });

  describe('Search Query Sanitization', () => {
    it('should remove dangerous characters from search', () => {
      const dangerousQuery = '<script>alert("XSS")</script> search term';
      const sanitized = sanitizeSearchQuery(dangerousQuery);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toBe('scriptalert XSS script search term');
    });

    it('should limit query length', () => {
      const longQuery = 'search '.repeat(50);
      const sanitized = sanitizeSearchQuery(longQuery);
      
      expect(sanitized.length).toBeLessThanOrEqual(200);
    });

    it('should normalize whitespace', () => {
      const messyQuery = '  search    term   with   spaces  ';
      const sanitized = sanitizeSearchQuery(messyQuery);
      
      expect(sanitized).toBe('search term with spaces');
    });

    it('should preserve valid search terms', () => {
      const validQuery = 'document 2024 finance report';
      const sanitized = sanitizeSearchQuery(validQuery);
      
      expect(sanitized).toBe(validQuery);
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should validate required fields', () => {
      const result = validateAndSanitizeInput('', { required: true });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('This field is required');
    });

    it('should validate minimum length', () => {
      const result = validateAndSanitizeInput('abc', { minLength: 5 });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Minimum length is 5 characters');
    });

    it('should validate maximum length', () => {
      const longInput = 'a'.repeat(100);
      const result = validateAndSanitizeInput(longInput, { maxLength: 50 });
      
      expect(result.isValid).toBe(false);
      expect(result.sanitizedValue.length).toBe(50);
    });

    it('should validate pattern matching', () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const result = validateAndSanitizeInput('invalid-email', { 
        pattern: emailPattern 
      });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid format');
    });

    it('should sanitize input when requested', () => {
      const dangerousInput = '<script>alert("XSS")</script>';
      const result = validateAndSanitizeInput(dangerousInput, { 
        sanitize: true 
      });
      
      expect(result.sanitizedValue).not.toContain('<script>');
      expect(result.sanitizedValue).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should pass valid input', () => {
      const validInput = 'Hello World';
      const result = validateAndSanitizeInput(validInput, {
        required: true,
        minLength: 5,
        maxLength: 20
      });
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(validInput);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Trusted HTML Creation', () => {
    it('should create trusted HTML object', () => {
      const html = '<p>Safe content</p>';
      const trusted = createTrustedHTML(html);
      
      expect(trusted).toHaveProperty('__html');
      expect(typeof trusted.__html).toBe('string');
    });

    it('should sanitize HTML in trusted object', () => {
      const dangerousHtml = '<p>Content</p><script>alert("XSS")</script>';
      const trusted = createTrustedHTML(dangerousHtml);
      
      expect(trusted.__html).not.toContain('<script>');
    });
  });

  describe('Safe JSON Parsing', () => {
    it('should parse valid JSON safely', () => {
      const validJson = '{"name": "test", "value": 123}';
      const parsed = safeJsonParse(validJson, {});
      
      expect(parsed.name).toBe('test');
      expect(parsed.value).toBe(123);
    });

    it('should return fallback for invalid JSON', () => {
      const invalidJson = '{"invalid": json}';
      const fallback = { error: true };
      const parsed = safeJsonParse(invalidJson, fallback);
      
      expect(parsed).toBe(fallback);
    });

    it('should sanitize parsed JSON', () => {
      const dangerousJson = '{"name": "<script>alert(\\"XSS\\")</script>"}';
      const parsed = safeJsonParse(dangerousJson, {});
      
      expect(parsed.name).not.toContain('<script>');
    });

    it('should handle nested objects in JSON', () => {
      const nestedJson = '{"user": {"name": "<img onerror=\\"alert(1)\\">", "id": 123}}';
      const parsed = safeJsonParse(nestedJson, {});
      
      expect(parsed.user.name).not.toContain('onerror');
      expect(parsed.user.id).toBe(123);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle circular references in JSON sanitization', () => {
      const obj: any = { name: 'test' };
      obj.circular = obj;
      
      // Should not throw, may return sanitized partial object
      expect(() => sanitizeJsonForDisplay(obj)).not.toThrow();
    });

    it('should handle extremely large inputs', () => {
      const hugeString = 'a'.repeat(1000000);
      
      // Should not crash or hang
      expect(() => sanitizeSearchQuery(hugeString)).not.toThrow();
      expect(() => sanitizeFileName(hugeString)).not.toThrow();
    });

    it('should handle unicode and special characters', () => {
      const unicode = '测试 🚀 ñoño café';
      
      expect(sanitizeSearchQuery(unicode)).toBe(unicode);
      expect(encodeHtmlEntities(unicode)).toBe(unicode);
    });

    it('should handle malformed URLs gracefully', () => {
      const malformedUrls = [
        'ht tp://broken-url',
        'https://',
        'https://[invalid-ipv6]',
        'https://user:pass@host:999999/path'
      ];
      
      malformedUrls.forEach(url => {
        expect(() => sanitizeUrl(url)).not.toThrow();
        expect(sanitizeUrl(url)).toBe('');
      });
    });
  });
});