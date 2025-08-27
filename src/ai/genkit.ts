
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

console.log('Genkit initialization:', {
  hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
  hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
  apiKeyLength: apiKey?.length || 0,
  nodeEnv: process.env.NODE_ENV,
  timestamp: new Date().toISOString()
});

if (!apiKey) {
  console.error('ERROR: Missing Gemini API key. Please set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.');
  throw new Error('Missing Gemini API key configuration');
}

export const ai = genkit({
  plugins: [googleAI({
    apiKey: apiKey
  })],
  model: 'googleai/gemini-2.0-flash',
});
