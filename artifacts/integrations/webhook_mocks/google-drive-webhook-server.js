#!/usr/bin/env node

/**
 * Google Drive Webhook Mock Server
 * Simulates Google Drive API webhooks for local testing
 * 
 * Usage: node webhook_mocks/google-drive-webhook-server.js
 * Default port: 8090
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.WEBHOOK_PORT || 8090;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Load mock data
const loadMockData = (filename) => {
  const filePath = path.join(__dirname, 'fixtures', filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to load mock data from ${filename}:`, error.message);
    return {};
  }
};

// Mock data
const mockData = {
  driveChanges: loadMockData('drive-changes.json'),
  fileUpdates: loadMockData('file-updates.json'),
  errors: loadMockData('webhook-errors.json')
};

// Webhook validation (simulates Google's X-Goog-Channel-Token)
const validateWebhook = (req, res, next) => {
  const channelToken = req.headers['x-goog-channel-token'];
  const expectedToken = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
  
  if (!channelToken) {
    console.warn('Missing X-Goog-Channel-Token header');
    return res.status(401).json({ error: 'Unauthorized: Missing channel token' });
  }
  
  if (channelToken !== expectedToken) {
    console.warn('Invalid channel token:', channelToken);
    return res.status(401).json({ error: 'Unauthorized: Invalid channel token' });
  }
  
  next();
};

// Deduplication tracking
const processedWebhooks = new Map();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const checkDuplicate = (req, res, next) => {
  const resourceId = req.headers['x-goog-resource-id'];
  const resourceState = req.headers['x-goog-resource-state'];
  const messageNumber = req.headers['x-goog-message-number'];
  
  const webhookId = `${resourceId}-${resourceState}-${messageNumber}`;
  const now = Date.now();
  
  // Check if this webhook was recently processed
  if (processedWebhooks.has(webhookId)) {
    const processedTime = processedWebhooks.get(webhookId);
    if (now - processedTime < DEDUP_WINDOW_MS) {
      console.log('Duplicate webhook detected, ignoring:', webhookId);
      return res.status(200).json({ status: 'duplicate', ignored: true });
    }
  }
  
  // Mark as processed
  processedWebhooks.set(webhookId, now);
  
  // Clean up old entries
  for (const [id, time] of processedWebhooks.entries()) {
    if (now - time > DEDUP_WINDOW_MS) {
      processedWebhooks.delete(id);
    }
  }
  
  next();
};

// Routes

// Google Drive push notification webhook
app.post('/webhooks/drive/notifications', validateWebhook, checkDuplicate, (req, res) => {
  const resourceId = req.headers['x-goog-resource-id'];
  const resourceState = req.headers['x-goog-resource-state'];
  const resourceUri = req.headers['x-goog-resource-uri'];
  const messageNumber = req.headers['x-goog-message-number'];
  
  console.log('Drive notification received:', {
    resourceId,
    resourceState,
    resourceUri,
    messageNumber,
    timestamp: new Date().toISOString()
  });
  
  // Simulate different types of drive changes
  const changeType = resourceState || 'sync';
  let mockResponse;
  
  switch (changeType) {
    case 'sync':
      mockResponse = mockData.driveChanges.sync;
      break;
    case 'update':
      mockResponse = mockData.fileUpdates.file_modified;
      break;
    case 'remove':
      mockResponse = mockData.fileUpdates.file_deleted;
      break;
    default:
      mockResponse = mockData.driveChanges.sync;
  }
  
  // Simulate webhook processing
  setTimeout(() => {
    console.log('Webhook processed successfully');
  }, 100);
  
  res.status(200).json({
    status: 'received',
    resourceId,
    resourceState,
    processedAt: new Date().toISOString(),
    mockData: mockResponse
  });
});

// OAuth callback mock (for testing OAuth flow)
app.get('/oauth/callback', (req, res) => {
  const { code, state, error } = req.query;
  
  console.log('OAuth callback received:', { 
    hasCode: !!code, 
    hasError: !!error, 
    state 
  });
  
  if (error) {
    return res.status(400).json({
      error: `oauth_${error}`,
      message: 'OAuth authorization failed',
      timestamp: new Date().toISOString()
    });
  }
  
  if (!code) {
    return res.status(400).json({
      error: 'no_auth_code',
      message: 'No authorization code received',
      timestamp: new Date().toISOString()
    });
  }
  
  // Simulate successful OAuth
  res.json({
    access_token: 'mock_access_token_' + crypto.randomBytes(16).toString('hex'),
    refresh_token: 'mock_refresh_token_' + crypto.randomBytes(16).toString('hex'),
    expires_in: 3600,
    scope: 'https://www.googleapis.com/auth/drive',
    token_type: 'Bearer',
    issued_at: Math.floor(Date.now() / 1000)
  });
});

// Gemini AI mock responses
app.post('/ai/classify', (req, res) => {
  const { fileIds } = req.body;
  
  if (!fileIds || !Array.isArray(fileIds)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'fileIds array is required'
    });
  }
  
  // Simulate AI processing delay
  setTimeout(() => {
    const classifications = fileIds.map(fileId => ({
      fileId,
      fileName: `file_${fileId}.pdf`,
      category: ['document', 'spreadsheet', 'presentation', 'image'][Math.floor(Math.random() * 4)],
      confidence: 0.7 + Math.random() * 0.3,
      tags: ['business', 'important', 'archive'][Math.floor(Math.random() * 3)],
      reasoning: `File appears to be a ${['business document', 'personal file', 'archived item'][Math.floor(Math.random() * 3)]}`
    }));
    
    res.json({ classifications });
  }, Math.random() * 2000 + 500); // 500-2500ms delay
});

// Rate limiting simulation
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100;

app.use('/api/*', (req, res, next) => {
  const clientId = req.ip || 'unknown';
  const now = Date.now();
  
  if (!rateLimitMap.has(clientId)) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const rateData = rateLimitMap.get(clientId);
  
  if (now > rateData.resetTime) {
    // Reset window
    rateData.count = 1;
    rateData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (rateData.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests',
      resetTime: rateData.resetTime,
      remaining: 0,
      limit: RATE_LIMIT_MAX
    });
  }
  
  rateData.count++;
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mockServer: true,
    endpoints: {
      driveWebhook: '/webhooks/drive/notifications',
      oauthCallback: '/oauth/callback',
      aiClassify: '/ai/classify',
      health: '/health'
    }
  });
});

// Error simulation endpoints
app.post('/simulate/timeout', (req, res) => {
  const delay = parseInt(req.query.delay) || 30000;
  console.log(`Simulating timeout with ${delay}ms delay`);
  
  setTimeout(() => {
    res.status(504).json({
      error: 'gateway_timeout',
      message: 'Request timed out',
      delay
    });
  }, delay);
});

app.post('/simulate/error/:type', (req, res) => {
  const { type } = req.params;
  const errorMap = {
    '500': { status: 500, error: 'internal_server_error', message: 'Internal server error' },
    '503': { status: 503, error: 'service_unavailable', message: 'Service temporarily unavailable' },
    '429': { status: 429, error: 'rate_limit_exceeded', message: 'Too many requests' },
    '400': { status: 400, error: 'bad_request', message: 'Invalid request data' },
    '401': { status: 401, error: 'unauthorized', message: 'Authentication required' },
    '403': { status: 403, error: 'forbidden', message: 'Access denied' }
  };
  
  const errorResponse = errorMap[type] || errorMap['500'];
  console.log(`Simulating ${type} error:`, errorResponse);
  
  res.status(errorResponse.status).json(errorResponse);
});

// Webhook management endpoints
app.get('/webhooks/status', (req, res) => {
  res.json({
    processedWebhooks: processedWebhooks.size,
    dedupWindow: DEDUP_WINDOW_MS,
    activeConnections: 1,
    lastActivity: new Date().toISOString()
  });
});

app.delete('/webhooks/reset', (req, res) => {
  processedWebhooks.clear();
  console.log('Webhook deduplication cache cleared');
  
  res.json({
    status: 'cleared',
    message: 'Webhook cache reset',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Mock Webhook Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Drive webhook: http://localhost:${PORT}/webhooks/drive/notifications`);
  console.log(`🔑 OAuth callback: http://localhost:${PORT}/oauth/callback`);
  console.log(`🤖 AI classify: http://localhost:${PORT}/ai/classify`);
  console.log(`\n💡 Set WEBHOOK_SECRET environment variable to test authentication`);
  console.log(`💡 Use /simulate/error/:type to test error handling\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down mock server...');
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