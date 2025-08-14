/**
 * Duplicate file detection utilities
 */
import { File } from './types';

export interface DuplicateGroup {
  files: File[];
  type: 'exact' | 'similar' | 'name';
  confidence: number;
}

/**
 * Detect duplicate files based on various criteria
 */
export function detectDuplicates(files: File[]): DuplicateGroup[] {
  const duplicateGroups: DuplicateGroup[] = [];

  // Group by exact size and name
  const exactMatches = findExactMatches(files);
  duplicateGroups.push(...exactMatches);

  // Group by similar names and sizes
  const similarMatches = findSimilarMatches(files, exactMatches);
  duplicateGroups.push(...similarMatches);

  return duplicateGroups;
}

/**
 * Find exact matches based on size and name
 */
function findExactMatches(files: File[]): DuplicateGroup[] {
  const groups = new Map<string, File[]>();

  files.forEach(file => {
    // Skip zero-byte files and folders
    if (file.size === 0 || file.type === 'Folder') return;

    const key = `${file.size}_${file.name.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(file);
  });

  return Array.from(groups.values())
    .filter(group => group.length > 1)
    .map(files => ({
      files,
      type: 'exact' as const,
      confidence: 1.0
    }));
}

/**
 * Find similar matches based on name similarity and size
 */
function findSimilarMatches(files: File[], exactGroups: DuplicateGroup[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const exactFileIds = new Set(exactGroups.flatMap(g => g.files.map(f => f.id)));
  
  // Filter out files already in exact matches
  const remainingFiles = files.filter(f => !exactFileIds.has(f.id) && f.size > 0 && f.type !== 'Folder');

  // Group by size first
  const sizeGroups = new Map<number, File[]>();
  remainingFiles.forEach(file => {
    if (!sizeGroups.has(file.size)) {
      sizeGroups.set(file.size, []);
    }
    sizeGroups.get(file.size)!.push(file);
  });

  // Find similar names within each size group
  sizeGroups.forEach(sameSize => {
    if (sameSize.length < 2) return;

    const similarGroups = findSimilarNames(sameSize);
    groups.push(...similarGroups);
  });

  return groups;
}

/**
 * Find files with similar names using fuzzy matching
 */
function findSimilarNames(files: File[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  files.forEach((file1, i) => {
    if (processed.has(file1.id)) return;

    const similarFiles = [file1];
    processed.add(file1.id);

    files.forEach((file2, j) => {
      if (i !== j && !processed.has(file2.id)) {
        const similarity = calculateNameSimilarity(file1.name, file2.name);
        if (similarity > 0.8) {
          similarFiles.push(file2);
          processed.add(file2.id);
        }
      }
    });

    if (similarFiles.length > 1) {
      groups.push({
        files: similarFiles,
        type: 'similar',
        confidence: 0.8
      });
    }
  });

  return groups;
}

/**
 * Calculate name similarity using Levenshtein distance
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const s1 = name1.toLowerCase();
  const s2 = name2.toLowerCase();

  if (s1 === s2) return 1.0;

  // Remove common suffixes and prefixes
  const clean1 = removeCommonAffixes(s1);
  const clean2 = removeCommonAffixes(s2);

  const distance = levenshteinDistance(clean1, clean2);
  const maxLength = Math.max(clean1.length, clean2.length);
  
  if (maxLength === 0) return 1.0;
  
  return 1 - (distance / maxLength);
}

/**
 * Remove common file prefixes and suffixes
 */
function removeCommonAffixes(filename: string): string {
  let clean = filename;

  // Remove common prefixes
  const prefixes = ['copy of', 'copy_of', 'copy-of', 'duplicate_'];
  prefixes.forEach(prefix => {
    if (clean.startsWith(prefix)) {
      clean = clean.substring(prefix.length).trim();
    }
  });

  // Remove common suffixes (but keep file extension)
  const parts = clean.split('.');
  if (parts.length > 1) {
    const extension = parts.pop();
    let basename = parts.join('.');
    
    const suffixes = [' (copy)', ' copy', ' (1)', ' (2)', ' (3)', '_copy', '-copy'];
    suffixes.forEach(suffix => {
      if (basename.endsWith(suffix)) {
        basename = basename.substring(0, basename.length - suffix.length);
      }
    });
    
    clean = `${basename}.${extension}`;
  }

  return clean;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];

  // Create matrix
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Mark files as duplicates in the file array
 */
export function markDuplicates(files: File[]): File[] {
  const duplicateGroups = detectDuplicates(files);
  const duplicateIds = new Set<string>();

  duplicateGroups.forEach(group => {
    // Mark all but the first file as duplicates
    group.files.slice(1).forEach(file => {
      duplicateIds.add(file.id);
    });
  });

  return files.map(file => ({
    ...file,
    isDuplicate: duplicateIds.has(file.id)
  }));
}