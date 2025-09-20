/**
 * @fileoverview Query optimization for Firestore operations
 * Reduces P99 latency through batching, pagination, and query optimization
 */

import { Firestore, Query, CollectionReference, FieldPath } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';
import { cacheManager, CacheNames } from './cache-manager';

export class QueryOptimizer {
  private batchQueue: Map<string, { docs: any[]; resolver: (value: any) => void }[]>;
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 500; // Firestore limit
  private readonly BATCH_DELAY_MS = 50; // Aggregate queries for 50ms

  constructor(private db: Firestore) {
    this.batchQueue = new Map();
  }

  /**
   * Optimized query with automatic caching and pagination
   */
  async optimizedQuery<T>(
    collection: string,
    filters: Array<{ field: string; op: FirebaseFirestore.WhereFilterOp; value: any }> = [],
    options: {
      limit?: number;
      orderBy?: { field: string; direction?: 'asc' | 'desc' };
      startAfter?: any;
      cache?: boolean;
      cacheKey?: string;
    } = {}
  ): Promise<T[]> {
    const startTime = Date.now();
    
    // Generate cache key if caching is enabled
    if (options.cache && options.cacheKey) {
      const cached = cacheManager.get<T[]>(CacheNames.QUERY_RESULTS, options.cacheKey);
      if (cached) {
        logger.debug('Query cache hit', { collection, cacheKey: options.cacheKey });
        return cached;
      }
    }

    let query: Query = this.db.collection(collection);

    // Apply filters
    filters.forEach(filter => {
      query = query.where(filter.field, filter.op, filter.value);
    });

    // Apply ordering
    if (options.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'asc');
    }

    // Apply pagination
    if (options.startAfter) {
      query = query.startAfter(options.startAfter);
    }

    // Apply limit (default to 100 for performance)
    const limit = options.limit || 100;
    query = query.limit(limit);

    // Execute query with performance tracking
    const snapshot = await query.get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    
    const queryTime = Date.now() - startTime;
    logger.performanceLog('optimized_query', queryTime, {
      collection,
      resultCount: results.length,
      cached: false,
    });

    // Cache results if enabled
    if (options.cache && options.cacheKey) {
      cacheManager.set(CacheNames.QUERY_RESULTS, options.cacheKey, results);
    }

    return results;
  }

  /**
   * Batch read operations for efficiency
   */
  async batchGet(collection: string, ids: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    // Check cache first
    const uncachedIds: string[] = [];
    ids.forEach(id => {
      const cached = cacheManager.get(CacheNames.FILE_METADATA, `${collection}:${id}`);
      if (cached) {
        results.set(id, cached);
      } else {
        uncachedIds.push(id);
      }
    });

    if (uncachedIds.length === 0) {
      return results;
    }

    // Batch fetch uncached documents
    const chunks = this.chunkArray(uncachedIds, 10); // Firestore 'in' query limit
    
    await Promise.all(
      chunks.map(async chunk => {
        const snapshot = await this.db
          .collection(collection)
          .where(FieldPath.documentId(), 'in', chunk)
          .get();
        
        snapshot.docs.forEach(doc => {
          const data = { id: doc.id, ...doc.data() };
          results.set(doc.id, data);
          // Cache the result
          cacheManager.set(CacheNames.FILE_METADATA, `${collection}:${doc.id}`, data);
        });
      })
    );

    return results;
  }

  /**
   * Optimized count query
   */
  async getCount(
    collection: string,
    filters: Array<{ field: string; op: FirebaseFirestore.WhereFilterOp; value: any }> = []
  ): Promise<number> {
    const cacheKey = `count:${collection}:${JSON.stringify(filters)}`;
    const cached = cacheManager.get<number>(CacheNames.QUERY_RESULTS, cacheKey);
    
    if (cached !== undefined) {
      return cached;
    }

    let query: Query = this.db.collection(collection);
    filters.forEach(filter => {
      query = query.where(filter.field, filter.op, filter.value);
    });

    // Use Firestore's count() for efficiency
    const snapshot = await query.count().get();
    const count = snapshot.data().count;
    
    // Cache for 5 minutes
    cacheManager.set(CacheNames.QUERY_RESULTS, cacheKey, count);
    
    return count;
  }

  /**
   * Create compound index suggestions based on query patterns
   */
  suggestIndexes(queryPatterns: Array<{ collection: string; fields: string[] }>): string[] {
    const suggestions: string[] = [];
    
    queryPatterns.forEach(pattern => {
      const indexDef = `Collection: ${pattern.collection}, Fields: ${pattern.fields.join(' + ')}`;
      suggestions.push(indexDef);
    });
    
    return suggestions;
  }

  /**
   * Parallel query execution for independent queries
   */
  async parallelQueries<T extends Record<string, Promise<any>>>(
    queries: T
  ): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
    const startTime = Date.now();
    const keys = Object.keys(queries) as Array<keyof T>;
    
    const results = await Promise.all(
      keys.map(key => queries[key])
    );
    
    const resultMap = {} as { [K in keyof T]: Awaited<T[K]> };
    keys.forEach((key, index) => {
      resultMap[key] = results[index];
    });
    
    const totalTime = Date.now() - startTime;
    logger.performanceLog('parallel_queries', totalTime, {
      queryCount: keys.length,
    });
    
    return resultMap;
  }

  /**
   * Helper to chunk arrays for batch operations
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Export singleton instance
let queryOptimizer: QueryOptimizer | null = null;

export function getQueryOptimizer(db: Firestore): QueryOptimizer {
  if (!queryOptimizer) {
    queryOptimizer = new QueryOptimizer(db);
  }
  return queryOptimizer;
}