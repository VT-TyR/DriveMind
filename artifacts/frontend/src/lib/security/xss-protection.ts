/**
 * XSS Protection Utilities
 * 
 * Comprehensive XSS protection for user-generated content and file data.
 * Includes input sanitization, output encoding, and CSP compliance.
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * HTML sanitization configuration
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'u', 'br', 'p', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'code', 'pre'
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'class', 'id', 'data-*'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false,
  SANITIZE_DOM: true,
  WHOLE_DOCUMENT: false,
  USE_PROFILES: {
    html: true,
    svg: false,
    mathMl: false
  }
};

/**
 * File-specific sanitization for untrusted file content
 */
const FILE_SANITIZE_CONFIG = {
  ...SANITIZE_CONFIG,
  ALLOWED_TAGS: ['span', 'div', 'p', 'br'],
  ALLOWED_ATTR: ['class'],
  KEEP_CONTENT: true
};

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(dirty: string, isFileContent: boolean = false): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }
  
  const config = isFileContent ? FILE_SANITIZE_CONFIG : SANITIZE_CONFIG;
  return DOMPurify.sanitize(dirty, config);
}

/**
 * Encode HTML entities for safe output
 */
export function encodeHtmlEntities(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  
  return text.replace(/[&<>"'`=\/]/g, (char) => entityMap[char]);
}

/**
 * Sanitize file names to prevent path traversal and XSS
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return 'untitled';
  }
  
  // Remove path traversal patterns
  let sanitized = fileName.replace(/\.\./g, '');
  
  // Remove or encode dangerous characters
  sanitized = sanitized.replace(/[<>"'&]/g, '');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, 255 - ext.length);
    sanitized = name + ext;
  }
  
  // Ensure we have a valid filename
  sanitized = sanitized.trim();
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return 'untitled';
  }
  
  return sanitized;
}

/**
 * Sanitize folder paths
 */
export function sanitizeFolderPath(path: string): string {
  if (!path || typeof path !== 'string') {
    return '/';
  }
  
  // Split path into segments and sanitize each
  const segments = path.split('/').filter(segment => segment.length > 0);
  const sanitizedSegments = segments.map(segment => {
    // Remove dangerous patterns
    let sanitized = segment.replace(/\.\./g, '');
    sanitized = sanitized.replace(/[<>"'&]/g, '');
    sanitized = sanitized.trim();
    
    if (!sanitized || sanitized === '.' || sanitized === '..') {
      return 'folder';
    }
    
    return sanitized;
  });
  
  return '/' + sanitizedSegments.join('/');
}

/**
 * Sanitize JSON data before display
 */
export function sanitizeJsonForDisplay(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return encodeHtmlEntities(obj);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeJsonForDisplay(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    Object.keys(obj).forEach(key => {
      const sanitizedKey = encodeHtmlEntities(key);
      sanitized[sanitizedKey] = sanitizeJsonForDisplay(obj[key]);
    });
    return sanitized;
  }
  
  return obj;
}

/**
 * Validate and sanitize URL inputs
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  // Allow only safe protocols
  const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  
  try {
    const urlObj = new URL(url);
    if (!allowedProtocols.includes(urlObj.protocol)) {
      return '';
    }
    return urlObj.toString();
  } catch {
    // If URL is invalid, return empty string
    return '';
  }
}

/**
 * Content Security Policy helper for React components
 */
export function generateCSPNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Validate inline styles for CSP compliance
 */
export function validateInlineStyle(style: string): boolean {
  if (!style || typeof style !== 'string') {
    return false;
  }
  
  // Check for dangerous CSS properties
  const dangerousPatterns = [
    /javascript:/i,
    /expression\(/i,
    /url\(/i,
    /@import/i,
    /binding:/i
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(style));
}

/**
 * Sanitize CSS class names
 */
export function sanitizeCssClassName(className: string): string {
  if (!className || typeof className !== 'string') {
    return '';
  }
  
  // Allow only alphanumeric, hyphens, and underscores
  return className.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim();
}

/**
 * File content preview sanitization
 */
export function sanitizeFilePreview(content: string, fileType: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  // Limit content length for previews
  const maxLength = 5000;
  let truncated = content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  
  // Different sanitization based on file type
  switch (fileType.toLowerCase()) {
    case 'text':
    case 'txt':
    case 'log':
      return encodeHtmlEntities(truncated);
    
    case 'html':
    case 'htm':
      return sanitizeHtml(truncated, true);
    
    case 'json':
      try {
        const parsed = JSON.parse(truncated);
        return JSON.stringify(sanitizeJsonForDisplay(parsed), null, 2);
      } catch {
        return encodeHtmlEntities(truncated);
      }
    
    case 'csv':
      // Split into lines and sanitize each cell
      return truncated
        .split('\n')
        .map(line => line.split(',').map(cell => encodeHtmlEntities(cell.trim())).join(','))
        .join('\n');
    
    default:
      return encodeHtmlEntities(truncated);
  }
}

/**
 * Sanitize search queries to prevent injection attacks
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    return '';
  }
  
  // Remove potentially dangerous characters for search
  let sanitized = query.replace(/[<>"'&(){}[\]\\|`~!@#$%^*=+]/g, '');
  
  // Limit length
  sanitized = sanitized.substring(0, 200);
  
  // Remove multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized;
}

/**
 * Input validation for forms
 */
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  sanitize?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  sanitizedValue: string;
  errors: string[];
}

export function validateAndSanitizeInput(
  value: string,
  rules: ValidationRule
): ValidationResult {
  const errors: string[] = [];
  let sanitizedValue = value || '';
  
  // Sanitize if requested
  if (rules.sanitize) {
    sanitizedValue = encodeHtmlEntities(sanitizedValue);
  }
  
  // Required validation
  if (rules.required && !sanitizedValue.trim()) {
    errors.push('This field is required');
  }
  
  // Length validations
  if (rules.minLength && sanitizedValue.length < rules.minLength) {
    errors.push(`Minimum length is ${rules.minLength} characters`);
  }
  
  if (rules.maxLength && sanitizedValue.length > rules.maxLength) {
    errors.push(`Maximum length is ${rules.maxLength} characters`);
    sanitizedValue = sanitizedValue.substring(0, rules.maxLength);
  }
  
  // Pattern validation
  if (rules.pattern && !rules.pattern.test(sanitizedValue)) {
    errors.push('Invalid format');
  }
  
  return {
    isValid: errors.length === 0,
    sanitizedValue,
    errors
  };
}

/**
 * Trusted HTML types for React dangerouslySetInnerHTML
 */
export function createTrustedHTML(html: string): { __html: string } {
  return { __html: sanitizeHtml(html) };
}

/**
 * Safe JSON parsing with XSS protection
 */
export function safeJsonParse<T = any>(jsonString: string, fallback: T): T {
  try {
    const parsed = JSON.parse(jsonString);
    return sanitizeJsonForDisplay(parsed);
  } catch (error) {
    console.warn('Failed to parse JSON safely:', error);
    return fallback;
  }
}