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

/**
 * Fuzzy file search result from the Nucleo matcher.
 *
 * Used by the @ mention file picker to display ranked file matches
 * with highlighting support for matched characters.
 */
export interface FuzzySearchResult {
  /** File path relative to workspace root. */
  path: string;
  /** Filename only (for display). */
  name: string;
  /** Match score from Nucleo (higher = better match). */
  score: number;
  /** Character indices in `name` where the pattern matched. Used for highlighting. */
  matchIndices: number[];
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

// ============================================
// Fuzzy File Search (@ Mention Picker)
// ============================================

/**
 * Build the file index for a workspace.
 *
 * Scans all indexable files (source code, configs) and stores them in memory
 * for fast fuzzy searching. Also starts a file watcher for incremental updates.
 *
 * @param rootPath - Absolute path to the workspace root
 */
export async function buildFileIndex(rootPath: string): Promise<void> {
  // Note: Tauri 2.0 auto-converts Rust snake_case to camelCase for frontend
  return invoke('build_file_index', { rootPath });
}

/**
 * Fuzzy search for files matching a query.
 *
 * Returns results sorted by match score (highest first).
 * Uses the Nucleo matcher for high-quality fuzzy matching.
 *
 * @param query - The search query (e.g., "btn" to find "Button.tsx")
 * @param maxResults - Maximum number of results to return (default: 50, max: 100)
 * @returns Array of matching files with scores and highlight indices
 */
export async function fuzzySearchFiles(
  query: string,
  maxResults?: number
): Promise<FuzzySearchResult[]> {
  // Note: Tauri 2.0 auto-converts Rust snake_case to camelCase for frontend
  return invoke<FuzzySearchResult[]>('fuzzy_search_files', { query, maxResults });
}

/**
 * Clear the file index and stop the file watcher.
 *
 * Called when closing a workspace or switching to a different project.
 */
export async function clearFileIndex(): Promise<void> {
  return invoke('clear_file_index');
}
