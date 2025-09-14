#!/usr/bin/env node

/**
 * Gemini AI Mock Server
 * Simulates Google Gemini API for local testing
 * 
 * Usage: node webhook_mocks/gemini-mock-server.js
 * Default port: 8091
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.GEMINI_PORT || 8091;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body size:', JSON.stringify(req.body).length, 'bytes');
  }
  next();
});

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  const expectedKey = process.env.GEMINI_API_KEY || 'mock-gemini-api-key';
  
  if (!apiKey) {
    return res.status(401).json({
      error: {
        code: 401,
        message: 'API key not provided',
        status: 'UNAUTHENTICATED'
      }
    });
  }
  
  if (apiKey !== expectedKey) {
    return res.status(401).json({
      error: {
        code: 401,
        message: 'Invalid API key',
        status: 'UNAUTHENTICATED'
      }
    });
  }
  
  next();
};

// Rate limiting simulation
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

const rateLimitMiddleware = (req, res, next) => {
  const clientId = req.ip || 'unknown';
  const now = Date.now();
  
  if (!rateLimitMap.has(clientId)) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const rateData = rateLimitMap.get(clientId);
  
  if (now > rateData.resetTime) {
    rateData.count = 1;
    rateData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (rateData.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: {
        code: 429,
        message: 'Quota exceeded for quota metric "GenerateContent requests per minute"',
        status: 'RESOURCE_EXHAUSTED'
      }
    });
  }
  
  rateData.count++;
  res.header('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.header('X-RateLimit-Remaining', RATE_LIMIT_MAX - rateData.count);
  res.header('X-RateLimit-Reset', rateData.resetTime);
  
  next();
};

// Mock responses
const generateMockClassification = (prompt) => {
  const categories = [
    'Business Document',
    'Personal File',
    'Academic Paper',
    'Financial Record',
    'Legal Document',
    'Technical Specification',
    'Creative Work',
    'Archive/Backup'
  ];
  
  const tags = [
    'important',
    'draft',
    'final',
    'confidential',
    'shared',
    'outdated',
    'duplicate',
    'large-file'
  ];
  
  const confidence = 0.7 + Math.random() * 0.3;
  const category = categories[Math.floor(Math.random() * categories.length)];
  const selectedTags = tags.filter(() => Math.random() > 0.7);
  
  return {
    category,
    confidence: Math.round(confidence * 100) / 100,
    tags: selectedTags,
    reasoning: `Based on the file characteristics, this appears to be a ${category.toLowerCase()}. The classification was determined by analyzing file name patterns, content structure, and contextual indicators.`,
    suggestions: [
      `Consider organizing this file in a "${category}" folder`,
      selectedTags.includes('duplicate') ? 'Check for duplicate files' : 'File appears unique',
      confidence > 0.9 ? 'High confidence classification' : 'Review classification manually'
    ]
  };
};

const generateMockOrganizationRule = (description) => {
  const actions = ['move', 'rename', 'tag', 'organize'];
  const patterns = {
    'PDF': '*.pdf',
    'Images': '*.{jpg,jpeg,png,gif}',
    'Documents': '*.{doc,docx,txt,md}',
    'Spreadsheets': '*.{xls,xlsx,csv}',
    'Presentations': '*.{ppt,pptx}',
    'Archives': '*.{zip,rar,7z,tar,gz}'
  };
  
  const ruleType = Object.keys(patterns)[Math.floor(Math.random() * Object.keys(patterns).length)];
  const action = actions[Math.floor(Math.random() * actions.length)];
  
  return {
    id: `rule_${crypto.randomBytes(8).toString('hex')}`,
    name: `Auto-organize ${ruleType} files`,
    description: `Automatically ${action} files matching the pattern for ${ruleType}`,
    pattern: patterns[ruleType],
    action,
    target: `/organized/${ruleType.toLowerCase()}`,
    conditions: {
      fileTypes: [ruleType.toLowerCase()],
      sizeRange: { min: 0, max: 104857600 }, // 100MB
      namePattern: patterns[ruleType]
    },
    confidence: 0.8 + Math.random() * 0.2,
    isActive: true,
    priority: Math.floor(Math.random() * 10) + 1
  };
};

// Routes

// Generate Content API (main endpoint)
app.post('/v1beta/models/:model/generateContent', validateApiKey, rateLimitMiddleware, (req, res) => {
  const { model } = req.params;
  const { contents } = req.body;
  
  console.log(`Gemini API call for model: ${model}`);
  
  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({
      error: {
        code: 400,
        message: 'Invalid request: contents field is required and must be an array',
        status: 'INVALID_ARGUMENT'
      }
    });
  }
  
  // Simulate processing delay
  const processingDelay = Math.random() * 2000 + 500; // 500-2500ms
  
  setTimeout(() => {
    const userPrompt = contents[0]?.parts?.[0]?.text || '';
    
    // Determine response type based on prompt content
    let responseText = '';
    
    if (userPrompt.toLowerCase().includes('classify') || userPrompt.toLowerCase().includes('categorize')) {
      const classification = generateMockClassification(userPrompt);
      responseText = JSON.stringify(classification, null, 2);
    } else if (userPrompt.toLowerCase().includes('organize') || userPrompt.toLowerCase().includes('rule')) {
      const rule = generateMockOrganizationRule(userPrompt);
      responseText = JSON.stringify(rule, null, 2);
    } else if (userPrompt.toLowerCase().includes('duplicate')) {
      responseText = JSON.stringify({
        isDuplicate: Math.random() > 0.5,
        confidence: 0.7 + Math.random() * 0.3,
        similarFiles: [
          { id: 'file123', name: 'similar_file_1.pdf', similarity: 0.85 },
          { id: 'file456', name: 'similar_file_2.pdf', similarity: 0.92 }
        ],
        recommendation: Math.random() > 0.5 ? 'keep_newest' : 'manual_review'
      }, null, 2);
    } else {
      // Generic AI response
      responseText = `I understand you're asking about: "${userPrompt.substring(0, 100)}..."\n\nBased on my analysis, I recommend organizing your files by type and date. This will improve accessibility and reduce clutter. Would you like me to suggest specific organizational rules?`;
    }
    
    const response = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: responseText
              }
            ],
            role: 'model'
          },
          finishReason: 'STOP',
          index: 0,
          safetyRatings: [
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              probability: 'NEGLIGIBLE'
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              probability: 'NEGLIGIBLE'
            },
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              probability: 'NEGLIGIBLE'
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              probability: 'NEGLIGIBLE'
            }
          ]
        }
      ],
      promptFeedback: {
        safetyRatings: [
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            probability: 'NEGLIGIBLE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            probability: 'NEGLIGIBLE'
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            probability: 'NEGLIGIBLE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            probability: 'NEGLIGIBLE'
          }
        ]
      },
      usageMetadata: {
        promptTokenCount: Math.floor(userPrompt.length / 4),
        candidatesTokenCount: Math.floor(responseText.length / 4),
        totalTokenCount: Math.floor((userPrompt.length + responseText.length) / 4)
      }
    };
    
    res.json(response);
  }, processingDelay);
});

// List models
app.get('/v1beta/models', validateApiKey, (req, res) => {
  res.json({
    models: [
      {
        name: 'models/gemini-1.5-pro-002',
        displayName: 'Gemini 1.5 Pro',
        description: 'The best model for scaling across a wide range of reasoning tasks',
        version: '002',
        inputTokenLimit: 2097152,
        outputTokenLimit: 8192,
        supportedGenerationMethods: ['generateContent', 'countTokens']
      },
      {
        name: 'models/gemini-1.5-flash-002',
        displayName: 'Gemini 1.5 Flash',
        description: 'Fast and versatile multimodal model for scaling across diverse tasks',
        version: '002',
        inputTokenLimit: 1048576,
        outputTokenLimit: 8192,
        supportedGenerationMethods: ['generateContent', 'countTokens']
      }
    ]
  });
});

// Count tokens
app.post('/v1beta/models/:model/countTokens', validateApiKey, rateLimitMiddleware, (req, res) => {
  const { contents } = req.body;
  
  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({
      error: {
        code: 400,
        message: 'Invalid request: contents field is required',
        status: 'INVALID_ARGUMENT'
      }
    });
  }
  
  const text = contents.map(content => 
    content.parts?.map(part => part.text || '').join('') || ''
  ).join('');
  
  const tokenCount = Math.ceil(text.length / 4); // Rough approximation
  
  res.json({
    totalTokens: tokenCount
  });
});

// Error simulation endpoints
app.post('/simulate/quota-exceeded', validateApiKey, (req, res) => {
  res.status(429).json({
    error: {
      code: 429,
      message: 'Quota exceeded for quota metric "GenerateContent requests per minute per project per region"',
      status: 'RESOURCE_EXHAUSTED'
    }
  });
});

app.post('/simulate/content-filter', validateApiKey, (req, res) => {
  res.json({
    candidates: [
      {
        finishReason: 'SAFETY',
        index: 0,
        safetyRatings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            probability: 'HIGH'
          }
        ]
      }
    ],
    promptFeedback: {
      blockReason: 'SAFETY',
      safetyRatings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          probability: 'HIGH'
        }
      ]
    }
  });
});

app.post('/simulate/server-error', (req, res) => {
  res.status(500).json({
    error: {
      code: 500,
      message: 'An internal error has occurred.',
      status: 'INTERNAL'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'gemini-mock',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    endpoints: {
      generateContent: '/v1beta/models/:model/generateContent',
      listModels: '/v1beta/models',
      countTokens: '/v1beta/models/:model/countTokens',
      health: '/health'
    },
    rateLimit: {
      window: RATE_LIMIT_WINDOW,
      maxRequests: RATE_LIMIT_MAX
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🤖 Gemini Mock Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🧠 Generate content: POST http://localhost:${PORT}/v1beta/models/gemini-1.5-pro-002/generateContent`);
  console.log(`📋 List models: GET http://localhost:${PORT}/v1beta/models`);
  console.log(`🔢 Count tokens: POST http://localhost:${PORT}/v1beta/models/gemini-1.5-pro-002/countTokens`);
  console.log(`\n💡 Set GEMINI_API_KEY environment variable for auth testing`);
  console.log(`💡 Use /simulate/* endpoints to test error scenarios\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Gemini mock server...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});