
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Safe initialization function
function createGenkitInstance() {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    console.log('Genkit initialization:', {
      hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
      hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
      apiKeyLength: apiKey?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      deploymentNote: 'Environment variables may not be available due to deployment pipeline issue'
    });

    if (!apiKey) {
      console.warn('WARNING: No Gemini API key found. AI features will use fallback responses.');
      // Return a mock Genkit instance that will trigger fallbacks
      return {
        defineFlow: (config: any, fn: any) => fn,
        definePrompt: (config: any) => () => { throw new Error('No API key configured'); }
      };
    }

    // Initialize Genkit with API key
    return genkit({
      plugins: [googleAI({ apiKey })],
      model: 'googleai/gemini-2.0-flash',
    });
    
  } catch (error) {
    console.error('Failed to initialize Genkit:', error);
    // Return a mock instance that will trigger fallbacks
    return {
      defineFlow: (config: any, fn: any) => fn,
      definePrompt: (config: any) => () => { throw new Error('Genkit initialization failed'); }
    };
  }
}

// Export the AI instance
export const ai = createGenkitInstance();
