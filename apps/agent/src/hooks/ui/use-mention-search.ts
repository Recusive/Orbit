/**
 * useMentionSearch - Fuzzy file search for @ mention picker
 *
 * Provides debounced fuzzy search with staleness tracking to prevent
 * race conditions when typing quickly. Handles the "indexing" state
 * gracefully when the file index hasn't been built yet.
 *
 * NOTE: Debounce delay comes from @/lib/utils/constants.
 * To change search debounce timing, update DELAYS.debounce in constants.ts.
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FuzzySearchResult } from '@/lib/api/search';

import { fuzzySearchFiles } from '@/lib/api/search';
import { DELAYS } from '@/lib/utils';

const logger = createLogger('useMentionSearch');

// ============================================
// Types
// ============================================

export interface UseMentionSearchOptions {
  /** The search query string */
  query: string;
  /** Whether search is enabled (default: true) */
  enabled?: boolean;
  /** Maximum number of results to return (default: 50) */
  maxResults?: number;
}

export interface UseMentionSearchReturn {
  /** Array of matching file results sorted by score */
  results: FuzzySearchResult[];
  /** Whether a search request is in progress */
  isLoading: boolean;
  /** Whether the file index is still being built */
  isIndexing: boolean;
  /** Error message if search failed (null if no error) */
  error: string | null;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for fuzzy file search in the @ mention picker.
 *
 * Features:
 * - 150ms debounce to avoid excessive API calls while typing
 * - Request ID tracking to discard stale responses (race condition prevention)
 * - Graceful "indexing" state when file index not yet built
 * - Empty query returns empty results immediately (no debounce delay)
 *
 * @example
 * ```tsx
 * const { results, isLoading, isIndexing } = useMentionSearch({
 *   query: searchText,
 *   enabled: isPopoverOpen,
 *   maxResults: 20,
 * });
 * ```
 */
export function useMentionSearch(options: UseMentionSearchOptions): UseMentionSearchReturn {
  const { query, enabled = true, maxResults = 50 } = options;

  // State
  const [results, setResults] = useState<FuzzySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for request tracking and debounce timer
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Perform the actual fuzzy search API call.
   * Checks for staleness before updating state.
   * Empty query returns initial files sorted alphabetically.
   */
  const search = useCallback(
    async (searchQuery: string, requestId: number): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        // Pass query as-is - empty query returns initial files from backend
        const searchResults = await fuzzySearchFiles(searchQuery, maxResults);

        // Check staleness - only update if this is still the current request
        if (requestId === requestIdRef.current) {
          setResults(searchResults);
          setIsIndexing(false);
        }
      } catch (err: unknown) {
        // Check staleness before updating error state
        if (requestId === requestIdRef.current) {
          // Tauri can throw strings directly (from Rust Err(String)), not just Error objects
          const errorMessage =
            err instanceof Error ? err.message : typeof err === 'string' ? err : 'Search failed';

          // Special case: file index not built yet
          if (errorMessage.includes('File index not built')) {
            setIsIndexing(true);
            setResults([]);
            setError(null);
          } else {
            logger.error(
              'Fuzzy search failed',
              err instanceof Error ? err : new Error(String(err))
            );
            setError(errorMessage);
            setResults([]);
          }
        }
      } finally {
        // Only clear loading if this is still the current request
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [maxResults]
  );

  /**
   * Debounced search effect.
   * Empty query fetches initial files immediately, non-empty queries are debounced.
   */
  useEffect(() => {
    // If disabled, clear results and return
    if (!enabled) {
      setResults([]);
      return;
    }

    // Clear any pending debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Increment request ID to invalidate any in-flight requests
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    // Empty query - fetch initial files immediately without debounce
    if (query.trim().length === 0) {
      search('', currentRequestId).catch(() => {
        // Error handling is done inside search()
      });
      return;
    }

    // Set loading state immediately for visual feedback
    setIsLoading(true);

    // Debounce the actual search
    debounceTimerRef.current = setTimeout(() => {
      search(query, currentRequestId).catch(() => {
        // Error handling is done inside search()
      });
    }, DELAYS.debounce);

    // Cleanup: clear timer on unmount or query change
    return (): void => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [query, enabled, search]);

  return {
    results,
    isLoading,
    isIndexing,
    error,
  };
}
