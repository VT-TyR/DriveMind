/**
 * PKCE (Proof Key for Code Exchange) Implementation
 * 
 * RFC 7636 compliant PKCE implementation for OAuth 2.0 security enhancement.
 * Generates cryptographically secure code challenge/verifier pairs.
 */

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface PKCEStorageData {
  codeVerifier: string;
  state: string;
  timestamp: number;
}

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values).map(v => charset[v % charset.length]).join('');
}

/**
 * Generate SHA256 hash and base64url encode
 */
async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to base64url encoding
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate PKCE code verifier (43-128 characters)
 */
export function generateCodeVerifier(): string {
  return generateRandomString(128);
}

/**
 * Generate PKCE code challenge from verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  return await sha256(verifier);
}

/**
 * Generate complete PKCE challenge pair
 */
export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * Generate cryptographically secure state parameter
 */
export function generateState(): string {
  return generateRandomString(32);
}

/**
 * Store PKCE data securely in sessionStorage
 */
export function storePKCEData(data: PKCEStorageData): void {
  try {
    const encryptedData = btoa(JSON.stringify(data));
    sessionStorage.setItem('drivemind_pkce', encryptedData);
  } catch (error) {
    console.error('Failed to store PKCE data:', error);
    throw new Error('Failed to store authentication state');
  }
}

/**
 * Retrieve and validate stored PKCE data
 */
export function retrievePKCEData(): PKCEStorageData | null {
  try {
    const encryptedData = sessionStorage.getItem('drivemind_pkce');
    if (!encryptedData) return null;
    
    const data = JSON.parse(atob(encryptedData)) as PKCEStorageData;
    
    // Validate data structure
    if (!data.codeVerifier || !data.state || !data.timestamp) {
      console.warn('Invalid PKCE data structure');
      clearPKCEData();
      return null;
    }
    
    // Check if data is expired (5 minutes)
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - data.timestamp > maxAge) {
      console.warn('PKCE data expired');
      clearPKCEData();
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to retrieve PKCE data:', error);
    clearPKCEData();
    return null;
  }
}

/**
 * Clear stored PKCE data
 */
export function clearPKCEData(): void {
  try {
    sessionStorage.removeItem('drivemind_pkce');
  } catch (error) {
    console.error('Failed to clear PKCE data:', error);
  }
}

/**
 * Validate state parameter against stored value
 */
export function validateState(receivedState: string): boolean {
  const storedData = retrievePKCEData();
  if (!storedData) {
    console.error('No stored PKCE data for state validation');
    return false;
  }
  
  const isValid = storedData.state === receivedState;
  if (!isValid) {
    console.error('State parameter mismatch - possible CSRF attack');
  }
  
  return isValid;
}

/**
 * Complete PKCE flow validation
 */
export function completePKCEFlow(receivedState: string): string | null {
  if (!validateState(receivedState)) {
    return null;
  }
  
  const storedData = retrievePKCEData();
  if (!storedData) {
    return null;
  }
  
  const codeVerifier = storedData.codeVerifier;
  
  // Clear stored data after successful validation
  clearPKCEData();
  
  return codeVerifier;
}

/**
 * Generate OAuth URL with PKCE parameters
 */
export interface OAuthUrlParams {
  clientId: string;
  redirectUri: string;
  scope: string[];
  userId?: string;
}

export async function generatePKCEOAuthUrl(params: OAuthUrlParams): Promise<string> {
  const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
  const state = generateState();
  
  // Store PKCE data
  storePKCEData({
    codeVerifier,
    state,
    timestamp: Date.now()
  });
  
  const urlParams = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: params.scope.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: params.userId ? `${state}:${params.userId}` : state
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${urlParams.toString()}`;
}

/**
 * Parse state parameter to extract user ID
 */
export function parseStateParameter(state: string): { state: string; userId?: string } {
  const parts = state.split(':');
  return {
    state: parts[0],
    userId: parts[1]
  };
}

/**
 * Security validation for OAuth callback
 */
export interface OAuthCallbackValidation {
  isValid: boolean;
  codeVerifier?: string;
  userId?: string;
  errors: string[];
}

export function validateOAuthCallback(
  code: string,
  state: string,
  error?: string
): OAuthCallbackValidation {
  const errors: string[] = [];
  
  // Check for OAuth errors
  if (error) {
    errors.push(`OAuth error: ${error}`);
    return { isValid: false, errors };
  }
  
  // Check for authorization code
  if (!code) {
    errors.push('Missing authorization code');
    return { isValid: false, errors };
  }
  
  // Check for state parameter
  if (!state) {
    errors.push('Missing state parameter');
    return { isValid: false, errors };
  }
  
  // Parse and validate state
  const { state: parsedState, userId } = parseStateParameter(state);
  if (!validateState(parsedState)) {
    errors.push('Invalid state parameter');
    return { isValid: false, errors };
  }
  
  // Get code verifier
  const codeVerifier = completePKCEFlow(parsedState);
  if (!codeVerifier) {
    errors.push('Failed to retrieve code verifier');
    return { isValid: false, errors };
  }
  
  return {
    isValid: true,
    codeVerifier,
    userId,
    errors: []
  };
}