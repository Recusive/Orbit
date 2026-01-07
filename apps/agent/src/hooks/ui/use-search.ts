import { useCallback, useEffect, useRef, useState } from 'react';

import type { SearchResult } from '@/lib/api/backend';

import { searchFiles } from '@/lib/api/backend';
import { DELAYS } from '@/lib/utils/constants';

// ============================================
// Types
// ============================================

export interface UseSearchOptions {
  /** Root path to search in */
  rootPath: string | null;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Whether search is enabled */
  enabled?: boolean;
}

export interface UseSearchReturn {
  /** Search query */
  query: string;
  /** Set search query */
  setQuery: (query: string) => void;
  /** Search results */
  results: SearchResult[];
  /** Whether search is in progress */
  isLoading: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Clear search results */
  clear: () => void;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for searching files in a workspace.
 *
 * Uses the backend searchFiles API with debouncing to avoid excessive calls.
 *
 * @example
 * ```tsx
 * const { query, setQuery, results, isLoading } = useSearch({
 *   rootPath: '/path/to/workspace',
 *   maxResults: 50,
 * });
 * ```
 */
export function useSearch(options: UseSearchOptions): UseSearchReturn {
  const { rootPath, maxResults = 100, enabled = true } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track current search request to avoid stale results
  const searchIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Perform search with debouncing
  const performSearch = useCallback(
    async (searchQuery: string, searchId: number): Promise<void> => {
      if (!rootPath || !enabled) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      // Empty query - clear results
      if (searchQuery.trim().length === 0) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const searchResults = await searchFiles(rootPath, searchQuery, {
          maxResults,
        });

        // Only update if this is still the latest search
        if (searchId === searchIdRef.current) {
          // Filter out directories - we only want files in quick-open
          const files = searchResults.filter((r) => !r.isDir);
          setResults(files);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        // Only update error if this is still the latest search
        if (searchId === searchIdRef.current) {
          const errorMessage = err instanceof Error ? err.message : 'Search failed';
          setError(errorMessage);
          setResults([]);
          setIsLoading(false);
        }
      }
    },
    [rootPath, maxResults, enabled]
  );

  // Debounced search effect
  useEffect(() => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Increment search ID to invalidate any in-flight requests
    searchIdRef.current += 1;
    const currentSearchId = searchIdRef.current;

    // Debounce the search
    debounceRef.current = setTimeout(() => {
      performSearch(query, currentSearchId).catch(console.error);
    }, DELAYS.debounce);

    return (): void => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  // Clear results and query
  const clear = useCallback((): void => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    clear,
  };
}
