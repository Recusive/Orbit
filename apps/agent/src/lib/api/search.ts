/**
 * Search Operations
 *
 * Functions for searching files and text content.
 */

import { invoke } from './core';

// ============================================
// Types
// ============================================

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  include?: string[];
  exclude?: string[];
  maxResults?: number;
}

export interface SearchResult {
  path: string;
  name: string;
  isDir: boolean;
}

export interface TextSearchResult {
  path: string;
  line: number;
  column: number;
  matchLength: number;
  lineContent: string;
  beforeContext?: string[];
  afterContext?: string[];
}

// ============================================
// Search Operations
// ============================================

export async function searchFiles(
  rootPath: string,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_files', { rootPath, query, ...options });
}

export async function searchText(
  rootPath: string,
  pattern: string,
  options?: SearchOptions
): Promise<TextSearchResult[]> {
  return invoke<TextSearchResult[]>('search_text', { rootPath, pattern, ...options });
}
