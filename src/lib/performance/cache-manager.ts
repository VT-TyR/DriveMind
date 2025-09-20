/**
 * @fileoverview Central cache management for performance optimization
 * Reduces P99 latency by caching frequently accessed data
 */

import { LRUCache } from 'lru-cache';
import { logger } from '@/lib/logger';

// Cache configurations for different data types
const CACHE_CONFIGS = {
  fileMetadata: { max: 5000, ttl: 1000 * 60 * 15 }, // 15 minutes
  userSettings: { max: 1000, ttl: 1000 * 60 * 30 }, // 30 minutes
  scanResults: { max: 100, ttl: 1000 * 60 * 60 }, // 1 hour
  apiResponses: { max: 500, ttl: 1000 * 60 * 5 }, // 5 minutes
  queryResults: { max: 200, ttl: 1000 * 60 * 10 }, // 10 minutes
} as const;

class CacheManager {
  private caches: Map<string, LRUCache<string, any>>;
  private hitRate: Map<string, { hits: number; misses: number }>;

  constructor() {
    this.caches = new Map();
    this.hitRate = new Map();
    
    // Initialize caches
    Object.entries(CACHE_CONFIGS).forEach(([name, config]) => {
      this.caches.set(name, new LRUCache(config));
      this.hitRate.set(name, { hits: 0, misses: 0 });
    });
  }

  /**
   * Get cached value with automatic miss tracking
   */
  get<T>(cacheName: string, key: string): T | undefined {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      logger.warn('Cache not found', { cacheName });
      return undefined;
    }

    const value = cache.get(key);
    const stats = this.hitRate.get(cacheName)!;
    
    if (value !== undefined) {
      stats.hits++;
      logger.debug('Cache hit', { cacheName, key, hitRate: this.getHitRate(cacheName) });
    } else {
      stats.misses++;
      logger.debug('Cache miss', { cacheName, key, hitRate: this.getHitRate(cacheName) });
    }
    
    return value as T;
  }

  /**
   * Set cached value
   */
  set<T>(cacheName: string, key: string, value: T): void {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      logger.warn('Cache not found', { cacheName });
      return;
    }
    
    cache.set(key, value);
    logger.debug('Cache set', { cacheName, key });
  }

  /**
   * Get or compute cached value
   */
  async getOrCompute<T>(
    cacheName: string,
    key: string,
    computeFn: () => Promise<T>
  ): Promise<T> {
    const cached = this.get<T>(cacheName, key);
    if (cached !== undefined) {
      return cached;
    }

    const startTime = Date.now();
    const value = await computeFn();
    const computeTime = Date.now() - startTime;
    
    this.set(cacheName, key, value);
    logger.debug('Cache computed', { cacheName, key, computeTimeMs: computeTime });
    
    return value;
  }

  /**
   * Clear specific cache or all caches
   */
  clear(cacheName?: string): void {
    if (cacheName) {
      const cache = this.caches.get(cacheName);
      if (cache) {
        cache.clear();
        logger.info('Cache cleared', { cacheName });
      }
    } else {
      this.caches.forEach((cache, name) => {
        cache.clear();
        logger.info('Cache cleared', { cacheName: name });
      });
    }
  }

  /**
   * Get cache hit rate
   */
  getHitRate(cacheName: string): number {
    const stats = this.hitRate.get(cacheName);
    if (!stats || stats.hits + stats.misses === 0) {
      return 0;
    }
    return stats.hits / (stats.hits + stats.misses);
  }

  /**
   * Get cache metrics for monitoring
   */
  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    this.caches.forEach((cache, name) => {
      const stats = this.hitRate.get(name)!;
      metrics[name] = {
        size: cache.size,
        hitRate: this.getHitRate(name),
        hits: stats.hits,
        misses: stats.misses,
      };
    });
    
    return metrics;
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();

// Export cache names for type safety
export const CacheNames = {
  FILE_METADATA: 'fileMetadata',
  USER_SETTINGS: 'userSettings',
  SCAN_RESULTS: 'scanResults',
  API_RESPONSES: 'apiResponses',
  QUERY_RESULTS: 'queryResults',
} as const;

export type CacheName = typeof CacheNames[keyof typeof CacheNames];