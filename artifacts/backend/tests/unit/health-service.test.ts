/**
 * Health Service Unit Tests
 * Comprehensive test suite for system health monitoring and dependency checks
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HealthService, DependencyHealth, SystemHealth } from '../../services/system/health-service';
import { admin } from '../../../src/lib/admin';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock dependencies
jest.mock('../../../src/lib/admin');
jest.mock('googleapis');
jest.mock('@google/generative-ai');
jest.mock('../../services/logging/logger');
jest.mock('../../services/monitoring/metrics');

describe('HealthService', () => {
  let healthService: HealthService;
  let mockFirestore: any;
  let mockAuth: any;
  let mockOAuth2: any;
  let mockDrive: any;
  let mockGenAI: any;
  let mockModel: any;

  beforeEach(() => {
    // Reset environment
    process.env.APP_VERSION = '1.0.0';
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    
    // Clear singleton instance
    jest.clearAllMocks();
    (HealthService as any).instance = null;
    
    // Mock Firebase Admin
    mockFirestore = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ id: 'test-doc', exists: true }),
        }),
      }),
    };
    
    mockAuth = {
      getUser: jest.fn().mockRejectedValue(new Error('User not found')),
    };
    
    (admin.firestore as jest.Mock).mockReturnValue(mockFirestore);
    (admin.auth as jest.Mock).mockReturnValue(mockAuth);
    
    // Mock Google APIs
    mockOAuth2 = {
      generateAuthUrl: jest.fn().mockReturnValue('https://oauth.example.com'),
    };
    
    mockDrive = {
      about: {
        get: jest.fn().mockRejectedValue({ code: 401 }),
      },
    };
    
    (google.auth.OAuth2 as jest.Mock).mockImplementation(() => mockOAuth2);
    (google.drive as jest.Mock).mockReturnValue(mockDrive);
    
    // Mock Gemini AI
    mockModel = {
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'OK',
        },
      }),
    };
    
    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    };
    
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => mockGenAI);
    
    // Mock metrics service
    const { metrics } = require('../../services/monitoring/metrics');
    metrics.getRecentMetrics = jest.fn().mockResolvedValue({
      p50: 50,
      p95: 95,
      p99: 150,
      requestCount: 1000,
      errorRate: 2.5,
    });
    metrics.recordEvent = jest.fn();
    
    healthService = HealthService.getInstance();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.APP_VERSION;
    delete process.env.NODE_ENV;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GEMINI_API_KEY;
  });

  describe('Constructor', () => {
    it('should create singleton instance', () => {
      const instance1 = HealthService.getInstance();
      const instance2 = HealthService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when all dependencies are working', async () => {
      const result = await healthService.checkHealth();
      
      expect(result).toMatchObject({
        status: 'healthy',
        version: '1.0.0',
        environment: 'test',
        timestamp: expect.any(Date),
        uptime: expect.any(Number),
      });
      
      expect(result.dependencies).toHaveProperty('firebase');
      expect(result.dependencies).toHaveProperty('google_auth');
      expect(result.dependencies).toHaveProperty('google_drive');
      expect(result.dependencies).toHaveProperty('gemini');
      
      expect(result.dependencies.firebase.status).toBe('healthy');
      expect(result.dependencies.google_auth.status).toBe('healthy');
      expect(result.dependencies.google_drive.status).toBe('healthy');
      expect(result.dependencies.gemini.status).toBe('healthy');
      
      expect(result.metrics).toHaveProperty('memory');
      expect(result.metrics).toHaveProperty('cpu');
      expect(result.metrics).toHaveProperty('performance');
      expect(result.sla).toHaveProperty('availability');
    });

    it('should return degraded status when some dependencies fail', async () => {
      // Make Firebase fail
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockRejectedValue(new Error('Connection failed')),
        }),
      });

      const result = await healthService.checkHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.dependencies.firebase.status).toBe('unhealthy');
      expect(result.dependencies.firebase.message).toContain('Firebase error');
    });

    it('should handle complete health check failure gracefully', async () => {
      // Mock admin.firestore to throw during main health check
      (admin.firestore as jest.Mock).mockImplementation(() => {
        throw new Error('Complete failure');
      });

      const result = await healthService.checkHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.metrics.performance.errorRate).toBe(100);
      expect(result.sla.availability).toBe(0);
    });

    it('should record health check metrics', async () => {
      const { metrics } = require('../../services/monitoring/metrics');
      
      await healthService.checkHealth();
      
      expect(metrics.recordEvent).toHaveBeenCalledWith('health_check_completed', {
        status: 'healthy',
        latency: expect.any(Number),
        dependencyCount: 4,
      });
    });

    it('should include system metrics in response', async () => {
      const result = await healthService.checkHealth();
      
      expect(result.metrics.memory).toMatchObject({
        rss: expect.any(Number),
        heapTotal: expect.any(Number),
        heapUsed: expect.any(Number),
        external: expect.any(Number),
      });
      
      expect(result.metrics.cpu).toMatchObject({
        user: expect.any(Number),
        system: expect.any(Number),
      });
      
      expect(result.metrics.performance).toMatchObject({
        p50: 50,
        p95: 95,
        p99: 150,
        requestCount: 1000,
        errorRate: 2.5,
      });
    });
  });

  describe('quickHealthCheck', () => {
    it('should return healthy status for quick check', async () => {
      const result = await healthService.quickHealthCheck();
      
      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThan(0);
      expect(result.latency).toBeLessThan(1000);
    });

    it('should return degraded for slow response', async () => {
      // Mock slow Firestore response
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockImplementation(() => 
            new Promise(resolve => setTimeout(() => resolve({ exists: true }), 150))
          ),
        }),
      });

      const result = await healthService.quickHealthCheck();
      
      expect(result.status).toBe('degraded');
      expect(result.latency).toBeGreaterThan(100);
    });

    it('should return unhealthy on Firebase failure', async () => {
      mockFirestore.collection.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const result = await healthService.quickHealthCheck();
      
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('Dependency Checks', () => {
    describe('Firebase Health Check', () => {
      it('should check Firebase connectivity successfully', async () => {
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.firebase.status).toBe('healthy');
        expect(result.dependencies.firebase.message).toBe('Firebase services operational');
        expect(result.dependencies.firebase.metadata).toMatchObject({
          firestoreConnected: true,
          authConnected: true,
        });
      });

      it('should handle Firebase connection failure', async () => {
        mockFirestore.collection.mockImplementation(() => {
          throw new Error('Network error');
        });

        const result = await healthService.checkHealth();
        
        expect(result.dependencies.firebase.status).toBe('unhealthy');
        expect(result.dependencies.firebase.message).toContain('Firebase error: Network error');
      });
    });

    describe('Google Auth Health Check', () => {
      it('should validate Google OAuth configuration', async () => {
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.google_auth.status).toBe('healthy');
        expect(result.dependencies.google_auth.message).toBe('Google OAuth configuration valid');
        expect(result.dependencies.google_auth.metadata).toMatchObject({
          hasClientId: true,
          hasClientSecret: true,
        });
      });

      it('should detect missing OAuth credentials', async () => {
        delete process.env.GOOGLE_OAUTH_CLIENT_ID;
        
        // Clear cache and get new instance
        healthService.clearCache();
        
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.google_auth.metadata?.hasClientId).toBe(false);
      });

      it('should handle OAuth client creation failure', async () => {
        (google.auth.OAuth2 as jest.Mock).mockImplementation(() => {
          throw new Error('Invalid credentials');
        });

        healthService.clearCache();
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.google_auth.status).toBe('unhealthy');
        expect(result.dependencies.google_auth.message).toContain('Google OAuth error');
      });
    });

    describe('Google Drive Health Check', () => {
      it('should validate Drive API availability', async () => {
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.google_drive.status).toBe('healthy');
        expect(result.dependencies.google_drive.message).toBe('Google Drive API accessible');
        expect(result.dependencies.google_drive.metadata).toMatchObject({
          apiAvailable: true,
          requiresAuth: true,
        });
      });

      it('should handle Drive API unavailability', async () => {
        mockDrive.about.get.mockRejectedValue(new Error('Service unavailable'));

        healthService.clearCache();
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.google_drive.status).toBe('unhealthy');
        expect(result.dependencies.google_drive.message).toContain('Google Drive API error');
      });

      it('should handle non-auth Drive API errors', async () => {
        mockDrive.about.get.mockRejectedValue({ code: 503 });

        healthService.clearCache();
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.google_drive.status).toBe('unhealthy');
      });
    });

    describe('Gemini AI Health Check', () => {
      it('should validate Gemini AI service', async () => {
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.gemini.status).toBe('healthy');
        expect(result.dependencies.gemini.message).toBe('Gemini AI service responsive');
        expect(result.dependencies.gemini.metadata).toMatchObject({
          hasApiKey: true,
          responseReceived: true,
        });
      });

      it('should handle missing Gemini API key', async () => {
        delete process.env.GEMINI_API_KEY;
        
        healthService.clearCache();
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.gemini.status).toBe('unhealthy');
        expect(result.dependencies.gemini.message).toContain('GEMINI_API_KEY not configured');
        expect(result.dependencies.gemini.metadata?.hasApiKey).toBe(false);
      });

      it('should handle Gemini API failure', async () => {
        mockModel.generateContent.mockRejectedValue(new Error('API quota exceeded'));

        healthService.clearCache();
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.gemini.status).toBe('unhealthy');
        expect(result.dependencies.gemini.message).toContain('Gemini AI error');
      });

      it('should handle unexpected Gemini response', async () => {
        mockModel.generateContent.mockResolvedValue({
          response: {
            text: () => 'Unexpected response',
          },
        });

        healthService.clearCache();
        const result = await healthService.checkHealth();
        
        expect(result.dependencies.gemini.status).toBe('degraded');
      });
    });
  });

  describe('Caching', () => {
    it('should cache dependency health results', async () => {
      // First call
      await healthService.checkHealth();
      expect(mockFirestore.collection).toHaveBeenCalled();
      
      // Reset mock call count
      jest.clearAllMocks();
      
      // Second call within cache timeout should use cache
      await healthService.checkHealth();
      
      // Should not call Firebase again due to caching
      expect(mockFirestore.collection).not.toHaveBeenCalled();
    });

    it('should expire cache after timeout', async () => {
      // First call
      await healthService.checkHealth();
      
      // Clear cache manually to simulate expiration
      healthService.clearCache();
      
      // Reset mock call count
      jest.clearAllMocks();
      
      // Second call after cache expiration
      await healthService.checkHealth();
      
      // Should call Firebase again
      expect(mockFirestore.collection).toHaveBeenCalled();
    });
  });

  describe('Status Calculation', () => {
    it('should return healthy when all dependencies are healthy', async () => {
      const result = await healthService.checkHealth();
      expect(result.status).toBe('healthy');
    });

    it('should return degraded when some dependencies are degraded', async () => {
      // Mock slow response for degraded status
      mockModel.generateContent.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({ response: { text: () => 'OK' } }), 4000)
        )
      );

      const result = await healthService.checkHealth();
      expect(result.status).toBe('degraded');
    });

    it('should return unhealthy when any dependency is unhealthy', async () => {
      mockFirestore.collection.mockImplementation(() => {
        throw new Error('Complete failure');
      });

      const result = await healthService.checkHealth();
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('Health History', () => {
    it('should track health check history', async () => {
      await healthService.checkHealth();
      await healthService.checkHealth();
      
      const history = healthService.getHealthHistory();
      
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        timestamp: expect.any(Date),
        status: expect.any(String),
        latency: expect.any(Number),
      });
    });

    it('should limit health history to 100 entries', async () => {
      // Simulate 101 health checks
      for (let i = 0; i < 101; i++) {
        await healthService.quickHealthCheck();
      }
      
      const history = healthService.getHealthHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('SLA Metrics', () => {
    it('should calculate SLA metrics from health history', async () => {
      // Perform multiple health checks to build history
      await healthService.checkHealth();
      await healthService.checkHealth();
      
      const result = await healthService.checkHealth();
      
      expect(result.sla).toMatchObject({
        availability: expect.any(Number),
        responseTime: expect.any(Number),
        errorRate: expect.any(Number),
      });
      
      expect(result.sla.availability).toBeGreaterThanOrEqual(0);
      expect(result.sla.availability).toBeLessThanOrEqual(100);
    });
  });

  describe('Dependency Status', () => {
    it('should return current dependency status', async () => {
      await healthService.checkHealth();
      
      const dependencies = healthService.getDependencyStatus();
      
      expect(dependencies).toBeInstanceOf(Map);
      expect(dependencies.has('firebase')).toBe(true);
      expect(dependencies.has('google_auth')).toBe(true);
      expect(dependencies.has('google_drive')).toBe(true);
      expect(dependencies.has('gemini')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Promise.allSettled failures gracefully', async () => {
      // Mock a dependency check that throws synchronously
      (admin.firestore as jest.Mock).mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      const result = await healthService.checkHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.dependencies.firebase.status).toBe('unhealthy');
    });

    it('should record failed health check metrics', async () => {
      const { metrics } = require('../../services/monitoring/metrics');
      
      // Force health check to fail
      (admin.firestore as jest.Mock).mockImplementation(() => {
        throw new Error('Complete failure');
      });

      await healthService.checkHealth();
      
      expect(metrics.recordEvent).toHaveBeenCalledWith('health_check_failed', {
        latency: expect.any(Number),
        errorType: 'Error',
      });
    });
  });

  describe('Environment Configuration', () => {
    it('should handle missing APP_VERSION', async () => {
      delete process.env.APP_VERSION;
      
      const result = await healthService.checkHealth();
      
      expect(result.version).toBe('1.0.0'); // Default version
    });

    it('should handle different NODE_ENV values', async () => {
      process.env.NODE_ENV = 'production';
      
      const result = await healthService.checkHealth();
      
      expect(result.environment).toBe('production');
    });
  });
});