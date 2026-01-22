/**
 * useSearch Hook Tests
 *
 * Tests for the debounced file search hook that:
 * - Debounces search requests to avoid excessive API calls
 * - Handles race conditions with stale response detection
 * - Filters directories from results
 * - Provides loading and error states
 *
 * @see use-search.ts - Hook implementation
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import type { SearchResult } from '@/lib/api';

import { useSearch } from '@/hooks/ui/use-search';
import { DELAYS } from '@/lib/utils';

// =============================================================================
// Mocks
// =============================================================================

/**
 * Mock searchFiles API function.
 * Using vi.hoisted() to ensure the mock is available when vi.mock is hoisted.
 */
const { mockSearchFiles } = vi.hoisted(() => ({
  mockSearchFiles: vi.fn<[string, string, { maxResults?: number }?], Promise<SearchResult[]>>(),
}));

vi.mock('@/lib/api', () => ({
  searchFiles: mockSearchFiles,
}));

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create mock search results.
 */
function createMockResults(count: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `/workspace/file-${String(i)}.ts`,
    name: `file-${String(i)}.ts`,
    isDir: false,
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
  rootPath: '/workspace',
  maxResults: 100,
  enabled: true,
};

// =============================================================================
// Test Lifecycle
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchFiles.mockResolvedValue([]);
  // Use fake timers with shouldAdvanceTime to allow waitFor to work
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Hook Tests: Initial State
// =============================================================================

describe('useSearch', () => {
  describe('initial state', () => {
    it('should return initial state with empty query and results', () => {
      const { result } = renderHook(() => useSearch(defaultOptions));

      expect(result.current.query).toBe('');
      expect(result.current.results).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should provide setQuery and clear functions', () => {
      const { result } = renderHook(() => useSearch(defaultOptions));

      expect(typeof result.current.setQuery).toBe('function');
      expect(typeof result.current.clear).toBe('function');
    });
  });

  // =============================================================================
  // Hook Tests: Search Flow
  // =============================================================================

  describe('search flow', () => {
    it('should debounce search requests', async () => {
      const { result } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('test');
      });

      // Should not call immediately
      expect(mockSearchFiles).not.toHaveBeenCalled();

      // Advance timer partially
      await advanceHalfDebounce();

      // Still shouldn't have called
      expect(mockSearchFiles).not.toHaveBeenCalled();

      // Advance past debounce
      await advanceTimers(DELAYS.debounce);

      // Now should have called
      expect(mockSearchFiles).toHaveBeenCalledTimes(1);
      expect(mockSearchFiles).toHaveBeenCalledWith('/workspace', 'test', { maxResults: 100 });
    });

    it('should set isLoading to true during search', async () => {
      mockSearchFiles.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve([]);
            }, 100);
          })
      );

      const { result } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('loading');
      });

      await advancePastDebounce();

      expect(result.current.isLoading).toBe(true);

      // Complete the search
      await advanceTimers(100);

      expect(result.current.isLoading).toBe(false);
    });

    it('should update results after search completes', async () => {
      mockSearchFiles.mockResolvedValue(createMockResults(3));

      const { result } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('file');
      });

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
        expect(result.current.results[0]?.name).toBe('file-0.ts');
      });
    });

    it('should filter out directories from results', async () => {
      mockSearchFiles.mockResolvedValue([
        { path: '/workspace/file.ts', name: 'file.ts', isDir: false },
        { path: '/workspace/folder', name: 'folder', isDir: true },
        { path: '/workspace/another.ts', name: 'another.ts', isDir: false },
      ]);

      const { result } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('test');
      });

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(2);
        expect(result.current.results.every((r) => !r.isDir)).toBe(true);
      });
    });
  });

  // =============================================================================
  // Hook Tests: Query Management
  // =============================================================================

  describe('query management', () => {
    it('should clear results immediately when query is empty', async () => {
      mockSearchFiles.mockResolvedValue(createMockResults(3));

      const { result } = renderHook(() => useSearch(defaultOptions));

      // First, do a search
      act(() => {
        result.current.setQuery('test');
      });

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
      });

      // Clear query
      act(() => {
        result.current.setQuery('');
      });

      // Results should clear immediately (not wait for debounce)
      await advancePastDebounce();

      expect(result.current.results).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should not search with whitespace-only query', async () => {
      const { result } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('   ');
      });

      await advancePastDebounce();

      expect(mockSearchFiles).not.toHaveBeenCalled();
      expect(result.current.results).toEqual([]);
    });

    it('should clear all state when clear() is called', async () => {
      mockSearchFiles.mockResolvedValue(createMockResults(3));

      const { result } = renderHook(() => useSearch(defaultOptions));

      // Set up some state
      act(() => {
        result.current.setQuery('test');
      });

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
      });

      // Call clear
      act(() => {
        result.current.clear();
      });

      expect(result.current.query).toBe('');
      expect(result.current.results).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  // =============================================================================
  // Hook Tests: Race Conditions
  // =============================================================================

  describe('race conditions', () => {
    it('should ignore stale responses (only show latest search)', async () => {
      // Create deferred promises with controllable resolution
      let resolveFirst: (value: SearchResult[]) => void = (): void => {
        // No-op placeholder, will be reassigned by Promise constructor
      };
      let resolveSecond: (value: SearchResult[]) => void = (): void => {
        // No-op placeholder, will be reassigned by Promise constructor
      };

      const firstPromise = new Promise<SearchResult[]>((resolve) => {
        resolveFirst = resolve;
      });

      const secondPromise = new Promise<SearchResult[]>((resolve) => {
        resolveSecond = resolve;
      });

      mockSearchFiles
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => secondPromise);

      const { result } = renderHook(() => useSearch(defaultOptions));

      // Start first search
      act(() => {
        result.current.setQuery('first');
      });

      await advancePastDebounce();

      // Start second search
      act(() => {
        result.current.setQuery('second');
      });

      await advancePastDebounce();

      // Resolve second first
      resolveSecond([{ path: '/workspace/second.ts', name: 'second.ts', isDir: false }]);

      await waitFor(() => {
        expect(result.current.results).toHaveLength(1);
        expect(result.current.results[0]?.name).toBe('second.ts');
      });

      // Now resolve first (stale)
      resolveFirst([{ path: '/workspace/first.ts', name: 'first.ts', isDir: false }]);

      // Wait a bit and ensure first result is ignored
      await advanceTimers(50);

      // Should still have second results
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0]?.name).toBe('second.ts');
    });

    it('should cancel pending debounce when query changes', async () => {
      const { result } = renderHook(() => useSearch(defaultOptions));

      // Start typing
      act(() => {
        result.current.setQuery('f');
      });

      // Advance partially
      await advanceHalfDebounce();

      // Type more (should reset debounce)
      act(() => {
        result.current.setQuery('fi');
      });

      // Advance partially again
      await advanceHalfDebounce();

      // Should not have called yet
      expect(mockSearchFiles).not.toHaveBeenCalled();

      // Advance past debounce
      await advanceTimers(DELAYS.debounce);

      // Should have called once with final query
      expect(mockSearchFiles).toHaveBeenCalledTimes(1);
      expect(mockSearchFiles).toHaveBeenCalledWith('/workspace', 'fi', { maxResults: 100 });
    });
  });

  // =============================================================================
  // Hook Tests: Error Handling
  // =============================================================================

  describe('error handling', () => {
    it('should set error state when search fails', async () => {
      mockSearchFiles.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('error');
      });

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.isLoading).toBe(false);
        expect(result.current.results).toEqual([]);
      });
    });

    it('should handle non-Error rejection', async () => {
      mockSearchFiles.mockRejectedValue('String error');

      const { result } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('error');
      });

      await advancePastDebounce();

      await waitFor(() => {
        expect(result.current.error).toBe('Search failed');
      });
    });

    it('should ignore errors from stale requests', async () => {
      // First search will fail slowly
      let rejectFirst: (error: Error) => void = (): void => {
        // No-op placeholder, will be reassigned by Promise constructor
      };
      const firstPromise = new Promise<SearchResult[]>((_, reject) => {
        rejectFirst = reject;
      });

      // Second search will succeed
      mockSearchFiles
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() =>
          Promise.resolve([{ path: '/workspace/success.ts', name: 'success.ts', isDir: false }])
        );

      const { result } = renderHook(() => useSearch(defaultOptions));

      // Start first search
      act(() => {
        result.current.setQuery('first');
      });

      await advancePastDebounce();

      // Start second search
      act(() => {
        result.current.setQuery('second');
      });

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
      expect(result.current.results[0]?.name).toBe('success.ts');
    });
  });

  // =============================================================================
  // Hook Tests: Options
  // =============================================================================

  describe('options', () => {
    it('should not search when enabled=false', async () => {
      const { result } = renderHook(() =>
        useSearch({
          ...defaultOptions,
          enabled: false,
        })
      );

      act(() => {
        result.current.setQuery('test');
      });

      await advancePastDebounce();

      expect(mockSearchFiles).not.toHaveBeenCalled();
      expect(result.current.results).toEqual([]);
    });

    it('should not search when rootPath is null', async () => {
      const { result } = renderHook(() =>
        useSearch({
          ...defaultOptions,
          rootPath: null,
        })
      );

      act(() => {
        result.current.setQuery('test');
      });

      await advancePastDebounce();

      expect(mockSearchFiles).not.toHaveBeenCalled();
    });

    it('should use provided maxResults', async () => {
      renderHook(() =>
        useSearch({
          ...defaultOptions,
          maxResults: 50,
        })
      );

      const { result } = renderHook(() =>
        useSearch({
          ...defaultOptions,
          maxResults: 50,
        })
      );

      act(() => {
        result.current.setQuery('test');
      });

      await advancePastDebounce();

      expect(mockSearchFiles).toHaveBeenCalledWith('/workspace', 'test', { maxResults: 50 });
    });
  });

  // =============================================================================
  // Hook Tests: Cleanup
  // =============================================================================

  describe('cleanup', () => {
    it('should clean up pending debounce on unmount', async () => {
      const { result, unmount } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('test');
      });

      // Unmount before debounce fires
      unmount();

      // Advance past debounce
      await advancePastDebounce();

      // Should not have caused any errors or called search
      // (The cleanup in useEffect should have cleared the timeout)
    });

    it('should not update state after unmount', async () => {
      mockSearchFiles.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(createMockResults(3));
            }, 100);
          })
      );

      const { result, unmount } = renderHook(() => useSearch(defaultOptions));

      act(() => {
        result.current.setQuery('test');
      });

      await advancePastDebounce();

      // Unmount while search is in flight
      unmount();

      // Complete the search
      await advanceTimers(100);

      // Should not throw or cause warnings (React will handle this)
    });
  });
});
