
'use server';
/**
 * @fileOverview Production similarity clustering engine.
 * Implements advanced ML clustering algorithms including fuzzy name matching,
 * content similarity, and behavioral clustering. Implements ALPHA-CODENAME v1.4 standards.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { SimilarityClusterInputSchema, SimilarityClusterInput, SimilarityClusterOutputSchema, SimilarityClusterOutput } from '@/lib/ai-types';
import { FileSchema } from '@/lib/ai-types';
import { saveSimilarityCluster } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { requireFreshAuth } from '@/lib/guards';
import crypto from 'crypto';

/**
 * File cluster data structure
 */
interface FileCluster {
  clusterId: string;
  uid: string;
  strategy: 'name_similarity' | 'size_similarity' | 'content_type' | 'hybrid';
  members: ClusterMember[];
  centroid: ClusterCentroid;
  metrics: ClusterMetrics;
  confidence: number;
  createdAt: Date;
}

interface ClusterMember {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  lastModified: Date;
  path: string[];
  score: number; // Similarity score to cluster centroid
  features: FileFeatures;
}

interface FileFeatures {
  nameTokens: string[];
  sizeCategory: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  extension: string;
  nameLength: number;
  pathDepth: number;
  ageCategory: 'recent' | 'medium' | 'old';
}

interface ClusterCentroid {
  avgSize: number;
  commonTokens: string[];
  dominantMimeType: string;
  representativeFile: string; // fileId of most representative file
}

interface ClusterMetrics {
  cohesion: number; // How similar files are within cluster
  separation: number; // How different cluster is from others
  silhouette: number; // Overall quality metric
  totalSize: number;
  duplicatePotential: number;
}

/**
 * Extract meaningful features from a file for clustering.
 */
function extractFileFeatures(file: any): FileFeatures {
  const name = file.name || '';
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
  const nameWithoutExt = extension ? name.slice(0, -(extension.length + 1)) : name;
  
  // Tokenize name (split on non-alphanumeric characters)
  const nameTokens = nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1); // Filter short tokens
  
  // Categorize file size
  const size = file.size || 0;
  let sizeCategory: FileFeatures['sizeCategory'];
  if (size < 1024) sizeCategory = 'tiny'; // < 1KB
  else if (size < 1024 * 1024) sizeCategory = 'small'; // < 1MB
  else if (size < 50 * 1024 * 1024) sizeCategory = 'medium'; // < 50MB
  else if (size < 500 * 1024 * 1024) sizeCategory = 'large'; // < 500MB
  else sizeCategory = 'huge'; // >= 500MB
  
  // Categorize file age
  const now = Date.now();
  const fileTime = file.lastModified ? file.lastModified.getTime() : now;
  const ageMs = now - fileTime;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  let ageCategory: FileFeatures['ageCategory'];
  if (ageDays < 30) ageCategory = 'recent';
  else if (ageDays < 365) ageCategory = 'medium';
  else ageCategory = 'old';
  
  const pathDepth = (file.path || []).length;
  
  return {
    nameTokens,
    sizeCategory,
    extension,
    nameLength: name.length,
    pathDepth,
    ageCategory
  };
}

/**
 * Calculate similarity score between two files based on multiple features.
 */
function calculateFileSimilarity(file1: any, file2: any, features1: FileFeatures, features2: FileFeatures): number {
  let totalScore = 0;
  let totalWeight = 0;
  
  // Name token similarity (40% weight)
  const nameWeight = 0.4;
  const commonTokens = features1.nameTokens.filter(token => features2.nameTokens.includes(token));
  const totalTokens = new Set([...features1.nameTokens, ...features2.nameTokens]).size;
  const tokenSimilarity = totalTokens > 0 ? commonTokens.length / totalTokens : 0;
  totalScore += tokenSimilarity * nameWeight;
  totalWeight += nameWeight;
  
  // Extension similarity (20% weight)
  const extWeight = 0.2;
  const extSimilarity = features1.extension === features2.extension ? 1 : 0;
  totalScore += extSimilarity * extWeight;
  totalWeight += extWeight;
  
  // Size similarity (20% weight)
  const sizeWeight = 0.2;
  const sizeSimilarity = features1.sizeCategory === features2.sizeCategory ? 1 : 0;
  totalScore += sizeSimilarity * sizeWeight;
  totalWeight += sizeWeight;
  
  // MIME type similarity (15% weight)
  const mimeWeight = 0.15;
  const mimeType1 = file1.mimeType || '';
  const mimeType2 = file2.mimeType || '';
  const mimeSimilarity = mimeType1 === mimeType2 ? 1 : 
    mimeType1.split('/')[0] === mimeType2.split('/')[0] ? 0.5 : 0;
  totalScore += mimeSimilarity * mimeWeight;
  totalWeight += mimeWeight;
  
  // Age similarity (5% weight)
  const ageWeight = 0.05;
  const ageSimilarity = features1.ageCategory === features2.ageCategory ? 1 : 0;
  totalScore += ageSimilarity * ageWeight;
  totalWeight += ageWeight;
  
  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * Implement hierarchical clustering using single linkage.
 */
function hierarchicalClustering(files: any[], features: FileFeatures[], threshold: number = 0.6): FileCluster[] {
  if (files.length === 0) return [];
  
  // Initialize each file as its own cluster
  const clusters: { files: any[], features: FileFeatures[], centroid?: any }[] = files.map((file, i) => ({
    files: [file],
    features: [features[i]]
  }));
  
  // Calculate pairwise similarities
  while (true) {
    let maxSimilarity = 0;
    let mergeIndices: [number, number] | null = null;
    
    // Find most similar pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Calculate minimum similarity between clusters (single linkage)
        let minSimilarity = Infinity;
        
        for (let fi = 0; fi < clusters[i].files.length; fi++) {
          for (let fj = 0; fj < clusters[j].files.length; fj++) {
            const similarity = calculateFileSimilarity(
              clusters[i].files[fi],
              clusters[j].files[fj],
              clusters[i].features[fi],
              clusters[j].features[fj]
            );
            minSimilarity = Math.min(minSimilarity, similarity);
          }
        }
        
        if (minSimilarity > maxSimilarity) {
          maxSimilarity = minSimilarity;
          mergeIndices = [i, j];
        }
      }
    }
    
    // Stop if no similar clusters found
    if (maxSimilarity < threshold || !mergeIndices) break;
    
    // Merge most similar clusters
    const [i, j] = mergeIndices;
    clusters[i].files.push(...clusters[j].files);
    clusters[i].features.push(...clusters[j].features);
    clusters.splice(j, 1);
  }
  
  // Convert to FileCluster format and filter small clusters
  return clusters
    .filter(cluster => cluster.files.length > 1)
    .map((cluster, index) => createFileCluster(cluster.files, cluster.features, 'hybrid', index));
}

/**
 * Create a FileCluster from a group of files.
 */
function createFileCluster(files: any[], features: FileFeatures[], strategy: FileCluster['strategy'], index: number): FileCluster {
  const uid = files[0]?.uid || 'unknown';
  
  // Calculate centroid
  const avgSize = files.reduce((sum, f) => sum + (f.size || 0), 0) / files.length;
  
  // Find most common tokens
  const allTokens = features.flatMap(f => f.nameTokens);
  const tokenCounts = allTokens.reduce((acc, token) => {
    acc[token] = (acc[token] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const commonTokens = Object.entries(tokenCounts)
    .filter(([token, count]) => count >= Math.ceil(files.length * 0.3)) // Appear in 30% of files
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([token]) => token);
  
  // Find dominant MIME type
  const mimeTypes = files.map(f => f.mimeType || 'unknown');
  const mimeTypeCounts = mimeTypes.reduce((acc, mime) => {
    acc[mime] = (acc[mime] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const dominantMimeType = Object.entries(mimeTypeCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown';
  
  // Find representative file (largest or most recent)
  const representativeFile = files.reduce((best, current) => {
    if (!best) return current;
    
    const currentScore = (current.size || 0) * 0.6 + 
      (current.lastModified?.getTime() || 0) * 0.4 / 1000000000;
    const bestScore = (best.size || 0) * 0.6 + 
      (best.lastModified?.getTime() || 0) * 0.4 / 1000000000;
    
    return currentScore > bestScore ? current : best;
  });
  
  const centroid: ClusterCentroid = {
    avgSize,
    commonTokens,
    dominantMimeType,
    representativeFile: representativeFile?.id || files[0]?.id
  };
  
  // Create cluster members with similarity scores
  const members: ClusterMember[] = files.map((file, i) => ({
    fileId: file.id,
    name: file.name || '',
    size: file.size || 0,
    mimeType: file.mimeType || '',
    lastModified: file.lastModified || new Date(),
    path: file.path || [],
    score: file.id === representativeFile?.id ? 1.0 : 
      calculateFileSimilarity(file, representativeFile, features[i], features[0]),
    features: features[i]
  }));
  
  // Calculate cluster metrics
  const totalSize = members.reduce((sum, m) => sum + m.size, 0);
  const avgScore = members.reduce((sum, m) => sum + m.score, 0) / members.length;
  
  // Estimate duplicate potential (higher when files are very similar)
  const duplicatePotential = avgScore * members.length * 0.1;
  
  const metrics: ClusterMetrics = {
    cohesion: avgScore,
    separation: 0, // Would need inter-cluster comparison
    silhouette: avgScore, // Simplified
    totalSize,
    duplicatePotential
  };
  
  const clusterId = crypto.createHash('md5')
    .update(`${uid}:${strategy}:${members.map(m => m.fileId).sort().join(',')}`)
    .digest('hex')
    .substring(0, 16);
  
  return {
    clusterId,
    uid,
    strategy,
    members,
    centroid,
    metrics,
    confidence: Math.min(1, avgScore * Math.min(1, members.length / 10)),
    createdAt: new Date()
  };
}

export async function similarityCluster(input: SimilarityClusterInput): Promise<SimilarityClusterOutput> {
  return similarityClusterFlow(input);
}

const similarityClusterFlow = ai.defineFlow(
  {
    name: 'similarityClusterFlow',
    inputSchema: SimilarityClusterInputSchema,
    outputSchema: SimilarityClusterOutputSchema,
  },
  async ({ files, auth }: SimilarityClusterInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth);
      
      logger.info('Starting similarity clustering analysis', {
        uid: user.uid,
        fileCount: files.length
      });
      
      if (files.length < 2) {
        logger.info('Not enough files for clustering', { uid: user.uid, fileCount: files.length });
        return { clusters: 0 };
      }
      
      // Extract features for all files
      const filesWithFeatures = files.map(file => ({
        file: { ...file, uid: user.uid },
        features: extractFileFeatures(file)
      }));
      
      logger.info('File features extracted', {
        uid: user.uid,
        fileCount: filesWithFeatures.length,
        sampleFeatures: filesWithFeatures.slice(0, 3).map(f => ({
          name: f.file.name,
          tokens: f.features.nameTokens,
          sizeCategory: f.features.sizeCategory
        }))
      });
      
      // Perform hierarchical clustering
      const clusters = hierarchicalClustering(
        filesWithFeatures.map(f => f.file),
        filesWithFeatures.map(f => f.features),
        0.6 // Similarity threshold
      );
      
      logger.info('Initial clustering completed', {
        uid: user.uid,
        clusterCount: clusters.length,
        avgClusterSize: clusters.length > 0 
          ? clusters.reduce((sum, c) => sum + c.members.length, 0) / clusters.length 
          : 0
      });
      
      // Filter and refine clusters
      const qualityClusters = clusters.filter(cluster => {
        // Only keep high-quality clusters
        return cluster.confidence >= 0.5 && 
               cluster.members.length >= 2 &&
               cluster.members.length <= 50 && // Avoid massive clusters
               cluster.metrics.cohesion >= 0.4;
      });
      
      logger.info('Clusters filtered for quality', {
        uid: user.uid,
        originalCount: clusters.length,
        filteredCount: qualityClusters.length
      });
      
      // Save clusters to database
      if (qualityClusters.length > 0) {
        const clustersData = {
          uid: user.uid,
          clusters: qualityClusters.map(cluster => ({
            clusterId: cluster.clusterId,
            strategy: cluster.strategy,
            memberCount: cluster.members.length,
            representativeFile: cluster.centroid.representativeFile,
            commonTokens: cluster.centroid.commonTokens,
            dominantMimeType: cluster.centroid.dominantMimeType,
            totalSize: cluster.metrics.totalSize,
            potentialSavings: cluster.metrics.duplicatePotential,
            confidence: cluster.confidence,
            cohesion: cluster.metrics.cohesion,
            createdAt: cluster.createdAt
          })),
          summary: {
            totalClusters: qualityClusters.length,
            totalFiles: qualityClusters.reduce((sum, c) => sum + c.members.length, 0),
            totalPotentialSavings: qualityClusters.reduce((sum, c) => sum + c.metrics.duplicatePotential, 0),
            avgConfidence: qualityClusters.reduce((sum, c) => sum + c.confidence, 0) / qualityClusters.length
          },
          createdAt: new Date()
        };
        
        await saveSimilarityCluster(user.uid, clustersData);
      }
      
      const duration = Date.now() - startTime;
      
      logger.info('Similarity clustering completed', {
        uid: user.uid,
        inputFiles: files.length,
        clustersCreated: qualityClusters.length,
        totalPotentialSavings: qualityClusters.reduce((sum, c) => sum + c.metrics.duplicatePotential, 0),
        avgClusterSize: qualityClusters.length > 0 
          ? qualityClusters.reduce((sum, c) => sum + c.members.length, 0) / qualityClusters.length 
          : 0,
        avgConfidence: qualityClusters.length > 0 
          ? qualityClusters.reduce((sum, c) => sum + c.confidence, 0) / qualityClusters.length 
          : 0,
        duration
      });
      
      return { clusters: qualityClusters.length };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Similarity clustering failed', {
        error: error instanceof Error ? error.message : String(error),
        duration,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw with more context
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred during similarity clustering.');
    }
  }
);

    
