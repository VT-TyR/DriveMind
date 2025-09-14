/**
 * Client-Side Token Encryption Utilities
 * 
 * Provides secure token handling and encryption for sensitive data
 * on the client side. Works with backend AES-256-GCM encryption.
 */

/**
 * Generate a secure encryption key from a password
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-GCM
 */
export async function encryptData(data: string, password: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const key = await deriveKey(password, salt);
    const encodedData = encoder.encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );
    
    // Combine salt, iv, and encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    // Return base64 encoded result
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-GCM
 */
export async function decryptData(encryptedData: string, password: string): Promise<string> {
  try {
    const combined = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    );
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);
    
    const key = await deriveKey(password, salt);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Generate a secure session key
 */
export function generateSessionKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Token storage with encryption
 */
export class SecureTokenStorage {
  private static readonly STORAGE_PREFIX = 'drivemind_secure_';
  private sessionKey: string;
  
  constructor() {
    this.sessionKey = this.getOrCreateSessionKey();
  }
  
  private getOrCreateSessionKey(): string {
    const stored = sessionStorage.getItem(`${SecureTokenStorage.STORAGE_PREFIX}session_key`);
    if (stored) {
      return stored;
    }
    
    const newKey = generateSessionKey();
    sessionStorage.setItem(`${SecureTokenStorage.STORAGE_PREFIX}session_key`, newKey);
    return newKey;
  }
  
  /**
   * Store encrypted token
   */
  async storeToken(key: string, token: string): Promise<void> {
    try {
      const encrypted = await encryptData(token, this.sessionKey);
      sessionStorage.setItem(`${SecureTokenStorage.STORAGE_PREFIX}${key}`, encrypted);
    } catch (error) {
      console.error('Failed to store token securely:', error);
      throw error;
    }
  }
  
  /**
   * Retrieve and decrypt token
   */
  async getToken(key: string): Promise<string | null> {
    try {
      const encrypted = sessionStorage.getItem(`${SecureTokenStorage.STORAGE_PREFIX}${key}`);
      if (!encrypted) return null;
      
      return await decryptData(encrypted, this.sessionKey);
    } catch (error) {
      console.error('Failed to retrieve token securely:', error);
      return null;
    }
  }
  
  /**
   * Remove token
   */
  removeToken(key: string): void {
    sessionStorage.removeItem(`${SecureTokenStorage.STORAGE_PREFIX}${key}`);
  }
  
  /**
   * Clear all tokens
   */
  clearAllTokens(): void {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(SecureTokenStorage.STORAGE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  }
  
  /**
   * Check if token exists
   */
  hasToken(key: string): boolean {
    return sessionStorage.getItem(`${SecureTokenStorage.STORAGE_PREFIX}${key}`) !== null;
  }
}

/**
 * OAuth token manager with secure storage
 */
export class OAuthTokenManager {
  private storage: SecureTokenStorage;
  
  constructor() {
    this.storage = new SecureTokenStorage();
  }
  
  /**
   * Store OAuth tokens securely
   */
  async storeTokens(accessToken: string, refreshToken?: string): Promise<void> {
    await this.storage.storeToken('access_token', accessToken);
    if (refreshToken) {
      await this.storage.storeToken('refresh_token', refreshToken);
    }
    
    // Store timestamp for expiration checking
    await this.storage.storeToken('token_timestamp', Date.now().toString());
  }
  
  /**
   * Get access token
   */
  async getAccessToken(): Promise<string | null> {
    return this.storage.getToken('access_token');
  }
  
  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    return this.storage.getToken('refresh_token');
  }
  
  /**
   * Check if tokens are expired (assuming 1 hour expiration)
   */
  async isTokenExpired(): Promise<boolean> {
    const timestampStr = await this.storage.getToken('token_timestamp');
    if (!timestampStr) return true;
    
    const timestamp = parseInt(timestampStr, 10);
    const oneHour = 60 * 60 * 1000;
    return Date.now() - timestamp > oneHour;
  }
  
  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<boolean> {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) return false;
      
      const response = await fetch('/api/auth/drive/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      if (!response.ok) return false;
      
      const data = await response.json();
      if (data.access_token) {
        await this.storeTokens(data.access_token, data.refresh_token);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }
  
  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(): Promise<string | null> {
    const isExpired = await this.isTokenExpired();
    
    if (isExpired) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) return null;
    }
    
    return this.getAccessToken();
  }
  
  /**
   * Clear all OAuth tokens
   */
  clearTokens(): void {
    this.storage.removeToken('access_token');
    this.storage.removeToken('refresh_token');
    this.storage.removeToken('token_timestamp');
  }
  
  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    return accessToken !== null;
  }
}

/**
 * Secure form data encryption
 */
export class SecureFormData {
  private storage: SecureTokenStorage;
  
  constructor() {
    this.storage = new SecureTokenStorage();
  }
  
  /**
   * Encrypt and store form data temporarily
   */
  async storeFormData(formId: string, data: Record<string, any>): Promise<void> {
    const jsonData = JSON.stringify(data);
    await this.storage.storeToken(`form_${formId}`, jsonData);
  }
  
  /**
   * Retrieve and decrypt form data
   */
  async getFormData(formId: string): Promise<Record<string, any> | null> {
    const jsonData = await this.storage.getToken(`form_${formId}`);
    if (!jsonData) return null;
    
    try {
      return JSON.parse(jsonData);
    } catch {
      return null;
    }
  }
  
  /**
   * Clear form data
   */
  clearFormData(formId: string): void {
    this.storage.removeToken(`form_${formId}`);
  }
}

/**
 * Hash data for integrity checking
 */
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Verify data integrity
 */
export async function verifyDataIntegrity(data: string, expectedHash: string): Promise<boolean> {
  const actualHash = await hashData(data);
  return actualHash === expectedHash;
}

/**
 * Generate secure random ID
 */
export function generateSecureId(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a signature for API requests
 */
export async function signRequest(method: string, url: string, body: string, secret: string): Promise<string> {
  const message = `${method.toUpperCase()}:${url}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Global secure storage instance
 */
export const secureStorage = new SecureTokenStorage();
export const oauthManager = new OAuthTokenManager();
export const secureFormStorage = new SecureFormData();