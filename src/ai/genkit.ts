
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Lazy initialization to prevent server-side rendering issues
let _ai: any = null;

function initializeGenkit() {
  if (_ai) return _ai;
  
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    console.log('Genkit initialization:', {
      hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
      hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
      apiKeyLength: apiKey?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    if (!apiKey) {
      console.warn('WARNING: No Gemini API key found. AI features will use fallback responses.');
      // Return a mock Genkit instance that will trigger fallbacks
      _ai = {
        defineFlow: () => () => { throw new Error('No API key configured'); },
        definePrompt: () => () => { throw new Error('No API key configured'); }
      };
      return _ai;
    }

    // Initialize Genkit with API key
    _ai = genkit({
      plugins: [googleAI({ apiKey })],
      model: 'googleai/gemini-2.0-flash',
    });
    
    return _ai;
  } catch (error) {
    console.error('Failed to initialize Genkit:', error);
    // Return a mock instance that will trigger fallbacks
    _ai = {
      defineFlow: () => () => { throw new Error('Genkit initialization failed'); },
      definePrompt: () => () => { throw new Error('Genkit initialization failed'); }
    };
    return _ai;
  }
}

// Export a proxy that initializes Genkit on first use
export const ai = new Proxy({}, {
  get(target, prop) {
    const genkitInstance = initializeGenkit();
    return genkitInstance[prop];
  }
});
