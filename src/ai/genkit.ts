
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Allow build-time initialization without API key for deployment
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const isBuilding = process.env.NODE_ENV === 'development' || !apiKey;

console.log('Genkit initialization:', {
  hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
  hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
  apiKeyLength: apiKey?.length || 0,
  nodeEnv: process.env.NODE_ENV,
  isBuilding,
  timestamp: new Date().toISOString()
});

if (!apiKey && !isBuilding) {
  console.warn('WARNING: No Gemini API key found. AI features will use fallback responses.');
}

// Initialize Genkit with API key if available, otherwise with minimal config
export const ai = genkit({
  plugins: apiKey ? [googleAI({ apiKey })] : [],
  model: apiKey ? 'googleai/gemini-2.0-flash' : undefined,
});
