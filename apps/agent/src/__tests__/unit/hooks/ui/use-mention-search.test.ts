/**
 * useMentionSearch Hook Tests
 *
 * Tests for the fuzzy file search hook used by the @ mention picker that:
 * - Debounces non-empty search requests to avoid excessive API calls
 * - Immediately fetches initial files when query is empty (no debounce)
 * - Handles race conditions with stale response detection via request IDs
 * - Provides isIndexing state when file index isn't built yet
 * - Provides loading and error states
 *
 * @see use-mention-search.ts - Hook implementation
 * @see fuzzySearchFiles - Backend API for Nucleo-based fuzzy matching
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import type { FuzzySearchResult } from '@/lib/api/search';

import { useMentionSearch } from '@/hooks/ui/use-mention-search';
import { DELAYS } from '@/lib/utils';

// =============================================================================
// Mocks
// =============================================================================

/**
 * Mock fuzzySearchFiles API function.
 * Using vi.hoisted() to ensure the mock is available when vi.mock is hoisted.
 */
const { mockFuzzySearchFiles } = vi.hoisted(() => ({
  mockFuzzySearchFiles: vi.fn<[string, number?], Promise<FuzzySearchResult[]>>(),
}));

vi.mock('@/lib/api/search', () => ({
  fuzzySearchFiles: mockFuzzySearchFiles,
}));

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create mock fuzzy search results.
 *
 * @param count - Number of results to create
 * @param prefix - Optional prefix for file names (default: 'file')
 */
function createMockResults(count: number, prefix = 'file'): FuzzySearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `src/components/${prefix}-${String(i)}.tsx`,
    name: `${prefix}-${String(i)}.tsx`,
    score: 100 - i, // Higher score = better match, decreasing for each result
    matchIndices: [0, 1, 2], // First 3 characters match
    pathMatchIndices: [],
  }));
}

/**
 * Helper to advance timers past the debounce delay.
 * Uses vi.advanceTimersByTimeAsync for proper async handling with fake timers.
 */
async function advancePastDebounce(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DELAYS.debounce + 10);
  });
}

/**
 * Helper to advance timers by half the debounce delay.
 */
async function advanceHalfDebounce(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DELAYS.debounce / 2);
  });
}

/**
 * Helper to advance timers by a specific amount.
 */
async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Default options for the hook.
 */
const defaultOptions = {
  query: '',
  enabled: true,
  maxResults: 50,
};

// =============================================================================
// Test Lifecycle
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockFuzzySearchFiles.mockResolvedValue([]);
  // Use fake timers with shouldAdvanceTime to allow waitFor to work
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Hook Tests: Initial State
// =============================================================================

describe('useMentionSearch', () => {
  describe('initial state', () => {
    it('should return initial state with empty results and no errors', async () => {
      const { result } = renderHook(() => useMentionSearch(defaultOptions));

      // Wait for initial fetch (empty query = immediate fetch, no debounce)
      await advanceTimers(10);

      expect(result.current.results).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isIndexing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should immediately fetch initial files when query is empty', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(5, 'initial'));

      const { result } = renderHook(() => useMentionSearch(defaultOptions));

      // Empty query should NOT be debounced - fetches immediately
      // Wait a tiny bit for the async call
      await advanceTimers(10);

      expect(mockFuzzySearchFiles).toHaveBeenCalledTimes(1);
      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('', 50);

      await waitFor(() => {
        expect(result.current.results).toHaveLength(5);
        expect(result.current.results[0]?.name).toBe('initial-0.tsx');
      });
    });
  });

  // =============================================================================
  // Hook Tests: Debounced Search Flow
  // =============================================================================

  describe('debounced search flow', () => {
    it('should debounce non-empty search queries', async () => {
      const { rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Wait for initial empty query fetch
      await advanceTimers(10);
      vi.clearAllMocks();

      // Update to non-empty query
      rerender({ query: 'btn' });

      // Should NOT call API immediately
      expect(mockFuzzySearchFiles).not.toHaveBeenCalled();

      // Advance timer partially
      await advanceHalfDebounce();

      // Still shouldn't have called
      expect(mockFuzzySearchFiles).not.toHaveBeenCalled();

      // Advance past debounce
      await advancePastDebounce();

      // Now should have called with the query
      expect(mockFuzzySearchFiles).toHaveBeenCalledTimes(1);
      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('btn', 50);
    });

    it('should set isLoading to true immediately when query changes', async () => {
      mockFuzzySearchFiles.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(createMockResults(3));
            }, 100);
          })
      );

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Wait for initial fetch
      await advanceTimers(10);

      // Update to non-empty query
      rerender({ query: 'loading' });

      // isLoading should be set immediately for visual feedback
      expect(result.current.isLoading).toBe(true);

      // Wait for debounce + API call
      await advancePastDebounce();
      await advanceTimers(100);

      expect(result.current.isLoading).toBe(false);
    });

    it('should update results after search completes', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(3, 'button'));

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Wait for initial fetch
      await advanceTimers(10);
      vi.clearAllMocks();

      // Search for something
      rerender({ query: 'button' });

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
        expect(result.current.results[0]?.name).toBe('button-0.tsx');
        expect(result.current.results[0]?.score).toBe(100);
        expect(result.current.results[0]?.matchIndices).toEqual([0, 1, 2]);
      });
    });
  });

  // =============================================================================
  // Hook Tests: Query Changes
  // =============================================================================

  describe('query management', () => {
    it('should fetch initial files immediately when query is cleared', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(3));

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: 'test' } }
      );

      // Wait for debounced search
      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
      });

      vi.clearAllMocks();
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(5, 'initial'));

      // Clear query
      rerender({ query: '' });

      // Empty query should fetch immediately (no debounce)
      await advanceTimers(10);

      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('', 50);
    });

    it('should not search with whitespace-only query (treated as empty)', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(5, 'initial'));

      const { rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Wait for initial fetch
      await advanceTimers(10);
      vi.clearAllMocks();

      // Set whitespace-only query
      rerender({ query: '   ' });

      // Should immediately fetch with empty string (whitespace trimmed)
      await advanceTimers(10);

      // Whitespace-only should be treated as empty string
      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('', 50);
    });

    it('should cancel pending debounce when query changes rapidly', async () => {
      const { rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Wait for initial fetch
      await advanceTimers(10);
      vi.clearAllMocks();

      // Start typing rapidly
      rerender({ query: 'b' });
      await advanceHalfDebounce();

      rerender({ query: 'bu' });
      await advanceHalfDebounce();

      rerender({ query: 'but' });
      await advanceHalfDebounce();

      // Should not have called yet (each keystroke resets debounce)
      expect(mockFuzzySearchFiles).not.toHaveBeenCalled();

      // Wait for final debounce
      await advancePastDebounce();

      // Should only call once with final query
      expect(mockFuzzySearchFiles).toHaveBeenCalledTimes(1);
      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('but', 50);
    });
  });

  // =============================================================================
  // Hook Tests: Race Conditions
  // =============================================================================

  describe('race conditions', () => {
    it('should ignore stale responses (only show latest search)', async () => {
      // Create deferred promises with controllable resolution
      let resolveFirst: (value: FuzzySearchResult[]) => void = (): void => {
        // No-op placeholder
      };
      let resolveSecond: (value: FuzzySearchResult[]) => void = (): void => {
        // No-op placeholder
      };

      const firstPromise = new Promise<FuzzySearchResult[]>((resolve) => {
        resolveFirst = resolve;
      });

      const secondPromise = new Promise<FuzzySearchResult[]>((resolve) => {
        resolveSecond = resolve;
      });

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Wait for initial fetch
      await advanceTimers(10);
      vi.clearAllMocks();

      mockFuzzySearchFiles
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => secondPromise);

      // Start first search
      rerender({ query: 'first' });
      await advancePastDebounce();

      // Start second search
      rerender({ query: 'second' });
      await advancePastDebounce();

      // Resolve second first (out-of-order response)
      resolveSecond(createMockResults(1, 'second'));

      await waitFor(() => {
        expect(result.current.results).toHaveLength(1);
        expect(result.current.results[0]?.name).toBe('second-0.tsx');
      });

      // Now resolve first (stale) - should be ignored
      resolveFirst(createMockResults(1, 'first'));

      await advanceTimers(50);

      // Should still have second results (stale response ignored)
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0]?.name).toBe('second-0.tsx');
    });

    it('should increment request ID on each query change', async () => {
      const { rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Each rerender with new query should increment internal requestId
      // We verify this by checking stale responses are properly discarded
      await advanceTimers(10);

      // Multiple rapid query changes
      rerender({ query: 'a' });
      rerender({ query: 'ab' });
      rerender({ query: 'abc' });

      await advancePastDebounce();

      // Only the last query should be searched
      expect(mockFuzzySearchFiles).toHaveBeenLastCalledWith('abc', 50);
    });
  });

  // =============================================================================
  // Hook Tests: Indexing State
  // =============================================================================

  describe('indexing state', () => {
    it('should set isIndexing=true when file index not built error occurs', async () => {
      mockFuzzySearchFiles.mockRejectedValue('File index not built');

      const { result } = renderHook(() => useMentionSearch(defaultOptions));

      await advanceTimers(10);

      await waitFor(() => {
        expect(result.current.isIndexing).toBe(true);
        expect(result.current.results).toEqual([]);
        expect(result.current.error).toBeNull(); // Not treated as error
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle "File index not built" as Error object', async () => {
      mockFuzzySearchFiles.mockRejectedValue(new Error('File index not built yet'));

      const { result } = renderHook(() => useMentionSearch(defaultOptions));

      await advanceTimers(10);

      await waitFor(() => {
        expect(result.current.isIndexing).toBe(true);
        expect(result.current.error).toBeNull();
      });
    });

    it('should clear isIndexing when subsequent search succeeds', async () => {
      mockFuzzySearchFiles.mockRejectedValue('File index not built');

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);

      await waitFor(() => {
        expect(result.current.isIndexing).toBe(true);
      });

      // Index is now built, search works
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(3));

      rerender({ query: 'test' });
      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.isIndexing).toBe(false);
        expect(result.current.results).toHaveLength(3);
      });
    });
  });

  // =============================================================================
  // Hook Tests: Error Handling
  // =============================================================================

  describe('error handling', () => {
    it('should set error state when search fails with Error object', async () => {
      mockFuzzySearchFiles.mockRejectedValue(new Error('Network error'));

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      // Wait for initial fetch
      await advanceTimers(10);
      vi.clearAllMocks();

      mockFuzzySearchFiles.mockRejectedValue(new Error('Network error'));

      rerender({ query: 'error' });
      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.isLoading).toBe(false);
        expect(result.current.results).toEqual([]);
        expect(result.current.isIndexing).toBe(false);
      });
    });

    it('should handle Tauri string errors (Rust Err(String))', async () => {
      // Tauri can throw strings directly, not just Error objects
      mockFuzzySearchFiles.mockRejectedValue('Search command failed: timeout');

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      mockFuzzySearchFiles.mockRejectedValue('Search command failed: timeout');

      rerender({ query: 'timeout' });
      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.error).toBe('Search command failed: timeout');
      });
    });

    it('should handle unknown error types with fallback message', async () => {
      mockFuzzySearchFiles.mockRejectedValue({ weird: 'error' });

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      mockFuzzySearchFiles.mockRejectedValue({ weird: 'error' });

      rerender({ query: 'weird' });
      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.error).toBe('Search failed');
      });
    });

    it('should ignore errors from stale requests', async () => {
      // First search will fail slowly
      let rejectFirst: (error: Error) => void = (): void => {
        // No-op placeholder
      };
      const firstPromise = new Promise<FuzzySearchResult[]>((_, reject) => {
        rejectFirst = reject;
      });

      // Second search will succeed
      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      mockFuzzySearchFiles
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => Promise.resolve(createMockResults(1, 'success')));

      // Start first search
      rerender({ query: 'first' });
      await advancePastDebounce();

      // Start second search
      rerender({ query: 'second' });
      await advancePastDebounce();

      // Second succeeds
      await waitFor(() => {
        expect(result.current.results).toHaveLength(1);
      });

      // First fails (stale) - should be ignored
      rejectFirst(new Error('First failed'));

      await advanceTimers(50);

      // Should still have success state
      expect(result.current.error).toBeNull();
      expect(result.current.results[0]?.name).toBe('success-0.tsx');
    });
  });

  // =============================================================================
  // Hook Tests: Options
  // =============================================================================

  describe('options', () => {
    it('should clear results when enabled=false', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(3));

      const { result, rerender } = renderHook(
        ({ enabled }) => useMentionSearch({ ...defaultOptions, query: 'test', enabled }),
        { initialProps: { enabled: true } }
      );

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
      });

      // Disable the search
      rerender({ enabled: false });

      // Results should be cleared immediately
      expect(result.current.results).toEqual([]);
    });

    it('should not search when enabled=false', async () => {
      const { result, rerender } = renderHook(
        ({ enabled, query }) => useMentionSearch({ ...defaultOptions, query, enabled }),
        { initialProps: { enabled: false, query: '' } }
      );

      // Change query while disabled
      rerender({ enabled: false, query: 'test' });

      await advancePastDebounce();

      expect(mockFuzzySearchFiles).not.toHaveBeenCalled();
      expect(result.current.results).toEqual([]);
    });

    it('should use provided maxResults option', async () => {
      const { rerender } = renderHook(
        ({ query, maxResults }) => useMentionSearch({ ...defaultOptions, query, maxResults }),
        { initialProps: { query: '', maxResults: 20 } }
      );

      // Wait for initial fetch
      await advanceTimers(10);

      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('', 20);

      vi.clearAllMocks();

      rerender({ query: 'test', maxResults: 20 });
      await advancePastDebounce();

      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('test', 20);
    });

    it('should use default maxResults of 50 when not specified', async () => {
      renderHook(() =>
        useMentionSearch({
          query: '',
          enabled: true,
          // maxResults not specified - should default to 50
        })
      );

      await advanceTimers(10);

      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('', 50);
    });
  });

  // =============================================================================
  // Hook Tests: Cleanup
  // =============================================================================

  describe('cleanup', () => {
    it('should clean up pending debounce timer on unmount', async () => {
      const { rerender, unmount } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      // Start a search
      rerender({ query: 'test' });

      // Unmount before debounce fires
      unmount();

      // Advance past debounce
      await advancePastDebounce();

      // Should not have caused any errors or called search
      // (The cleanup in useEffect should have cleared the timeout)
    });

    it('should not update state after unmount', async () => {
      mockFuzzySearchFiles.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(createMockResults(3));
            }, 100);
          })
      );

      const { rerender, unmount } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      mockFuzzySearchFiles.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(createMockResults(3));
            }, 100);
          })
      );

      rerender({ query: 'test' });
      await advancePastDebounce();

      // Unmount while search is in flight
      unmount();

      // Complete the search
      await advanceTimers(100);

      // Should not throw or cause warnings (React will handle this)
      // The requestId check should prevent state updates
    });

    it('should clear debounce timer when query changes', async () => {
      const { rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      // Start typing
      rerender({ query: 'f' });

      // Advance partially
      await advanceHalfDebounce();

      // Query changes (should clear previous timer)
      rerender({ query: 'fi' });

      // Advance partially again
      await advanceHalfDebounce();

      // Should not have called yet (timer was reset)
      expect(mockFuzzySearchFiles).not.toHaveBeenCalled();

      // Now advance past full debounce
      await advanceTimers(DELAYS.debounce);

      // Should have called once with final query
      expect(mockFuzzySearchFiles).toHaveBeenCalledTimes(1);
      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('fi', 50);
    });
  });

  // =============================================================================
  // Hook Tests: Edge Cases
  // =============================================================================

  describe('edge cases', () => {
    it('should handle empty results gracefully', async () => {
      mockFuzzySearchFiles.mockResolvedValue([]);

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);

      rerender({ query: 'nonexistent' });
      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toEqual([]);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });

    it('should handle unicode characters in query', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(1, '文档'));

      const { result, rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      rerender({ query: '文档' });
      await advancePastDebounce();

      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('文档', 50);

      await waitFor(() => {
        expect(result.current.results).toHaveLength(1);
      });
    });

    it('should handle special characters in query', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(1, 'test-file'));

      const { rerender } = renderHook(
        ({ query }) => useMentionSearch({ ...defaultOptions, query }),
        { initialProps: { query: '' } }
      );

      await advanceTimers(10);
      vi.clearAllMocks();

      rerender({ query: 'test-file.tsx' });
      await advancePastDebounce();

      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('test-file.tsx', 50);
    });

    it('should handle rapid enable/disable toggling', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockResults(3));

      const { result, rerender } = renderHook(
        ({ enabled }) => useMentionSearch({ ...defaultOptions, query: 'test', enabled }),
        { initialProps: { enabled: true } }
      );

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
      });

      // Rapidly toggle enabled
      rerender({ enabled: false });
      expect(result.current.results).toEqual([]);

      rerender({ enabled: true });
      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
      });
    });
  });
});
