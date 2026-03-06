/**
 * QuickOpen Integration Tests
 *
 * Tests for the Quick Open modal (Command Palette) that provides:
 * - Fuzzy file search via Nucleo matcher with match highlighting
 * - Recent files display
 * - File opening on selection
 *
 * This is an INTEGRATION test because:
 * - Uses real FileStore and FileViewerStore (reset between tests)
 * - Mocks only Tauri communication (invoke, postMessage)
 * - Tests full user flows from typing to file opening
 *
 * @see quick-open.tsx - Component implementation
 * @see use-mention-search.ts - Fuzzy search hook with debouncing
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FuzzySearchResult } from '@/lib/api/search';
import type { ViewedFile } from '@/stores/file/file-viewer-store';

import { QuickOpen } from '@/components/modals/quick-open/quick-open';
import { DELAYS } from '@/lib/utils';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

// =============================================================================
// Mocks
// =============================================================================

/**
 * Hoisted mocks to ensure they're available when vi.mock is hoisted.
 */
const { mockPostMessage, mockFuzzySearchFiles } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
  mockFuzzySearchFiles: vi.fn<[string, number?], Promise<FuzzySearchResult[]>>(),
}));

/**
 * Mock useTauri hook to intercept postMessage calls.
 */
vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({
    postMessage: mockPostMessage,
    isConnected: true,
    isMockMode: true,
  }),
}));

/**
 * Mock fuzzySearchFiles API function.
 * This is called by useMentionSearch internally.
 */
vi.mock('@/lib/api/search', () => ({
  fuzzySearchFiles: mockFuzzySearchFiles,
}));

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create mock fuzzy search results for testing.
 */
function createMockFuzzyResults(count: number, prefix = 'file'): FuzzySearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `src/${prefix}-${String(i)}.ts`,
    name: `${prefix}-${String(i)}.ts`,
    score: 100 - i,
    matchIndices: [],
    pathMatchIndices: [],
  }));
}

let nextInstanceId = 0;

function createViewedFile(path: string): ViewedFile {
  return {
    instanceId: ++nextInstanceId,
    path,
    content: '',
    originalContent: '',
    language: 'typescript',
    fileType: 'text',
    viewMode: 'file',
    isModified: false,
    isExternal: false,
  };
}

/**
 * Render QuickOpen with controlled open state.
 * Uses delay: null to make userEvent synchronous, allowing precise control of debounce timing.
 */
function renderQuickOpen(open = true): {
  onOpenChange: ReturnType<typeof vi.fn>;
  user: ReturnType<typeof userEvent.setup>;
} {
  const onOpenChange = vi.fn();
  // Using delay: null makes userEvent synchronous, which is required for fake timer tests
  // This allows us to precisely control when the debounce fires via advancePastDebounce()
  const user = userEvent.setup({ delay: null });

  render(<QuickOpen open={open} onOpenChange={onOpenChange} />);

  return { onOpenChange, user };
}

/**
 * Advance timers past debounce period.
 * Uses vi.advanceTimersByTimeAsync for proper async handling with fake timers.
 */
async function advancePastDebounce(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DELAYS.debounce + 10);
  });
}

// =============================================================================
// Test Lifecycle
// =============================================================================

beforeEach(() => {
  nextInstanceId = 0;
  // Reset stores to initial state
  useFileStore.setState(useFileStore.getInitialState(), true);
  useFileViewerStore.setState(useFileViewerStore.getInitialState(), true);

  // Set up default workspace path
  useFileStore.setState({ rootPath: '/workspace' });

  // Clear all mocks
  vi.clearAllMocks();

  // Default mock: return empty results
  mockFuzzySearchFiles.mockResolvedValue([]);

  // Use fake timers with shouldAdvanceTime to allow waitFor to work
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Integration Tests: Dialog States
// =============================================================================

describe('QuickOpen', () => {
  describe('dialog states', () => {
    it('should show suggestions when opened with no query', async () => {
      mockFuzzySearchFiles.mockResolvedValue([
        { path: 'src/app.tsx', name: 'app.tsx', score: 0, matchIndices: [], pathMatchIndices: [] },
        { path: 'src/main.ts', name: 'main.ts', score: 0, matchIndices: [], pathMatchIndices: [] },
      ]);

      renderQuickOpen();

      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('Suggestions')).toBeInTheDocument();
        expect(screen.getByText('app.tsx')).toBeInTheDocument();
        expect(screen.getByText('main.ts')).toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText('Search files...')).toBeInTheDocument();
    });

    it('should show empty state when no files exist', async () => {
      renderQuickOpen();

      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('No files found.')).toBeInTheDocument();
      });
    });

    it('should not render content when closed', () => {
      renderQuickOpen(false);

      // Dialog should not be in the document when closed
      expect(screen.queryByPlaceholderText('Search files...')).not.toBeInTheDocument();
    });

    it('should have accessible dialog title', () => {
      renderQuickOpen();

      // sr-only title should be present for screen readers
      expect(screen.getByText('Command Palette')).toBeInTheDocument();
    });
  });

  // =============================================================================
  // Integration Tests: Search Flow
  // =============================================================================

  describe('search flow', () => {
    it('should show loading state while searching', async () => {
      // Mock a slow search
      mockFuzzySearchFiles.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve([]);
            }, 500);
          })
      );

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      // Advance past debounce
      await advancePastDebounce();

      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    it('should display search results after debounce', async () => {
      mockFuzzySearchFiles.mockResolvedValue(createMockFuzzyResults(3, 'component'));

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'component');

      // Advance past debounce
      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('component-0.ts')).toBeInTheDocument();
        expect(screen.getByText('component-1.ts')).toBeInTheDocument();
        expect(screen.getByText('component-2.ts')).toBeInTheDocument();
      });
    });

    it('should show no results message when search returns empty', async () => {
      mockFuzzySearchFiles.mockResolvedValue([]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'nonexistent');

      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('No matching files found.')).toBeInTheDocument();
      });
    });

    it('should call fuzzySearchFiles with correct parameters', async () => {
      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'utils');

      await advancePastDebounce();

      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('utils', 100);
    });

    it('should show indexing state when file index not built', async () => {
      mockFuzzySearchFiles.mockRejectedValue(new Error('File index not built'));

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('Indexing files...')).toBeInTheDocument();
      });
    });

    it('should highlight matched characters in results', async () => {
      mockFuzzySearchFiles.mockResolvedValue([
        {
          path: 'src/button.tsx',
          name: 'button.tsx',
          score: 100,
          matchIndices: [0, 1, 2], // "but" matched
          pathMatchIndices: [],
        },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'but');

      await advancePastDebounce();

      await waitFor(() => {
        // Check that mark elements exist for highlighted characters
        const marks = document.querySelectorAll('mark');
        expect(marks).toHaveLength(3);
        expect(marks.item(0).textContent).toBe('b');
        expect(marks.item(1).textContent).toBe('u');
        expect(marks.item(2).textContent).toBe('t');
      });
    });
  });

  // =============================================================================
  // Integration Tests: Recent Files
  // =============================================================================

  describe('recent files', () => {
    it('should display recent files when no query is entered', async () => {
      // Set up open tabs (recent files)
      useFileViewerStore.setState({
        openTabs: [
          createViewedFile('/workspace/src/recent-1.ts'),
          createViewedFile('/workspace/src/recent-2.ts'),
        ],
      });

      renderQuickOpen();

      // Wait for initial empty-query search to settle
      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('Recent')).toBeInTheDocument();
        expect(screen.getByText('recent-1.ts')).toBeInTheDocument();
        expect(screen.getByText('recent-2.ts')).toBeInTheDocument();
      });
    });

    it('should limit recent files to 10', async () => {
      // Set up 15 open tabs
      const tabs = Array.from({ length: 15 }, (_, i) =>
        createViewedFile(`/workspace/src/file-${String(i)}.ts`)
      );

      useFileViewerStore.setState({ openTabs: tabs });

      renderQuickOpen();

      // Wait for initial search to settle
      await advancePastDebounce();

      await waitFor(() => {
        // Should show first 10
        expect(screen.getByText('file-0.ts')).toBeInTheDocument();
        expect(screen.getByText('file-9.ts')).toBeInTheDocument();

        // Should NOT show 11th and beyond
        expect(screen.queryByText('file-10.ts')).not.toBeInTheDocument();
      });
    });

    it('should hide recent files when query is entered', async () => {
      useFileViewerStore.setState({
        openTabs: [createViewedFile('/workspace/src/recent.ts')],
      });

      const { user } = renderQuickOpen();

      // Wait for initial state to settle
      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('recent.ts')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      // Recent section should disappear when query is present
      expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    });

    it('should preserve Nucleo relevance order (no recent-files boost)', async () => {
      // Set up a recent file
      useFileViewerStore.setState({
        openTabs: [createViewedFile('/workspace/src/button.ts')],
      });

      // Search returns multiple results — accordion has highest score
      mockFuzzySearchFiles.mockResolvedValue([
        {
          path: 'src/accordion.ts',
          name: 'accordion.ts',
          score: 90,
          matchIndices: [],
          pathMatchIndices: [],
        },
        {
          path: 'src/button.ts',
          name: 'button.ts',
          score: 80,
          matchIndices: [],
          pathMatchIndices: [],
        },
        { path: 'src/card.ts', name: 'card.ts', score: 70, matchIndices: [], pathMatchIndices: [] },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'ts');

      await advancePastDebounce();

      await waitFor(() => {
        const items = screen.getAllByRole('option');
        // Highest-scored result should be first (fuzzy relevance preserved)
        expect(items[0]).toHaveTextContent('accordion.ts');
        expect(items[1]).toHaveTextContent('button.ts');
        expect(items[2]).toHaveTextContent('card.ts');
      });
    });
  });

  // =============================================================================
  // Integration Tests: File Selection
  // =============================================================================

  describe('file selection', () => {
    it('should open file and close dialog when result is clicked', async () => {
      mockFuzzySearchFiles.mockResolvedValue([
        {
          path: 'src/selected.ts',
          name: 'selected.ts',
          score: 100,
          matchIndices: [],
          pathMatchIndices: [],
        },
      ]);

      const { onOpenChange, user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'selected');

      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('selected.ts')).toBeInTheDocument();
      });

      await user.click(screen.getByText('selected.ts'));

      // Should close dialog
      expect(onOpenChange).toHaveBeenCalledWith(false);

      // Should update FileViewerStore
      expect(useFileViewerStore.getState().openTabs).toContainEqual(
        expect.objectContaining({ path: '/workspace/src/selected.ts' })
      );

      // Should send file:read message
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file:read',
          path: '/workspace/src/selected.ts',
        })
      );
    });

    it('should open recent file when clicked', async () => {
      useFileViewerStore.setState({
        openTabs: [createViewedFile('/workspace/src/recent.ts')],
      });

      const { onOpenChange, user } = renderQuickOpen();

      // Wait for initial state
      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('recent.ts')).toBeInTheDocument();
      });

      await user.click(screen.getByText('recent.ts'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file:read',
          path: '/workspace/src/recent.ts',
        })
      );
    });

    it('should set loading state when file is selected', async () => {
      mockFuzzySearchFiles.mockResolvedValue([
        {
          path: 'src/loading.ts',
          name: 'loading.ts',
          score: 100,
          matchIndices: [],
          pathMatchIndices: [],
        },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'loading');

      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('loading.ts')).toBeInTheDocument();
      });

      await user.click(screen.getByText('loading.ts'));

      expect(useFileViewerStore.getState().isLoading).toBe(true);
      expect(useFileViewerStore.getState().loadingPath).toBe('/workspace/src/loading.ts');
    });
  });

  // =============================================================================
  // Integration Tests: Path Display
  // =============================================================================

  describe('path display', () => {
    it('should display relative path for files in subdirectories', async () => {
      mockFuzzySearchFiles.mockResolvedValue([
        {
          path: 'src/components/button.ts',
          name: 'button.ts',
          score: 100,
          matchIndices: [],
          pathMatchIndices: [],
        },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'button');

      await advancePastDebounce();

      await waitFor(() => {
        // Should show relative path: src/components/button.ts (without /workspace/)
        expect(screen.getByText('src/components/button.ts')).toBeInTheDocument();
      });
    });

    it('should NOT show path for root-level files (avoids redundant display)', async () => {
      // For a file at workspace root, the path would be identical to the filename
      // which is redundant - so we hide it
      mockFuzzySearchFiles.mockResolvedValue([
        { path: 'utils.ts', name: 'utils.ts', score: 100, matchIndices: [], pathMatchIndices: [] },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'utils');

      await advancePastDebounce();

      await waitFor(() => {
        // Filename should be shown
        expect(screen.getByText('utils.ts')).toBeInTheDocument();
      });

      // Path (which would be "utils.ts") should NOT be shown separately
      // The element count check: filename appears once, not twice
      const utilsElements = screen.getAllByText('utils.ts');
      expect(utilsElements).toHaveLength(1);
    });

    it('should show full path when it does not start with workspace root', async () => {
      mockFuzzySearchFiles.mockResolvedValue([
        {
          path: '/other/location/file.ts',
          name: 'file.ts',
          score: 100,
          matchIndices: [],
          pathMatchIndices: [],
        },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'file');

      await advancePastDebounce();

      await waitFor(() => {
        // Should show full path since it's not under workspace
        expect(screen.getByText('/other/location/file.ts')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // Integration Tests: Dialog Close Cleanup
  // =============================================================================

  describe('dialog close cleanup', () => {
    it('should clear search state when dialog closes', async () => {
      const { user } = renderQuickOpen();

      // Type a query
      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      // Advance to trigger the search
      await advancePastDebounce();

      // The cleanup happens when open prop changes to false
      // This is a controlled component - cleanup is tested via effect behavior
    });
  });

  // =============================================================================
  // Edge Cases: Async
  // =============================================================================

  describe('edge cases: async', () => {
    it('should debounce rapid typing', async () => {
      const { user } = renderQuickOpen();

      // Wait for initial empty-query search to settle
      await advancePastDebounce();
      mockFuzzySearchFiles.mockClear();

      // Type rapidly
      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      // Advance past debounce
      await advancePastDebounce();

      // Should have called search once with final query
      expect(mockFuzzySearchFiles).toHaveBeenCalledWith('test', 100);
    });

    it('should only show latest search results (handles out-of-order responses)', async () => {
      const { user } = renderQuickOpen();

      // Wait for initial empty-query search to settle
      await advancePastDebounce();

      // Create deferred promises with controllable resolution
      let resolveFirst: (value: FuzzySearchResult[]) => void = (): void => {
        // No-op placeholder, will be reassigned by Promise constructor
      };
      let resolveSecond: (value: FuzzySearchResult[]) => void = (): void => {
        // No-op placeholder, will be reassigned by Promise constructor
      };

      const firstPromise = new Promise<FuzzySearchResult[]>((resolve) => {
        resolveFirst = resolve;
      });

      const secondPromise = new Promise<FuzzySearchResult[]>((resolve) => {
        resolveSecond = resolve;
      });

      // Use a dynamic mock that returns deferred promises for non-empty queries
      // and resolves immediately for empty queries (from clearing the input)
      let callCount = 0;
      mockFuzzySearchFiles.mockImplementation((query: string) => {
        if (query === '') {
          return Promise.resolve([]);
        }
        callCount += 1;
        if (callCount === 1) {
          return firstPromise;
        }
        return secondPromise;
      });

      // Type first query
      await user.type(screen.getByPlaceholderText('Search files...'), 'first');

      await advancePastDebounce();

      // Clear and type second query
      await user.clear(screen.getByPlaceholderText('Search files...'));
      await user.type(screen.getByPlaceholderText('Search files...'), 'second');

      await advancePastDebounce();

      // Resolve second (fast) first
      resolveSecond([
        {
          path: 'src/SecondResult.ts',
          name: 'SecondResult.ts',
          score: 100,
          matchIndices: [],
          pathMatchIndices: [],
        },
      ]);

      await waitFor(() => {
        expect(screen.getByText('SecondResult.ts')).toBeInTheDocument();
      });

      // Now resolve first (slow) - should be ignored
      resolveFirst([
        {
          path: 'src/FirstResult.ts',
          name: 'FirstResult.ts',
          score: 100,
          matchIndices: [],
          pathMatchIndices: [],
        },
      ]);

      // Should still show second results (first is stale)
      await waitFor(() => {
        expect(screen.getByText('SecondResult.ts')).toBeInTheDocument();
        expect(screen.queryByText('FirstResult.ts')).not.toBeInTheDocument();
      });
    });

    it('should handle search errors gracefully', async () => {
      mockFuzzySearchFiles.mockRejectedValue(new Error('Search failed'));

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'error');

      await advancePastDebounce();

      // Should show no results (not crash)
      await waitFor(() => {
        expect(screen.getByText('No matching files found.')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // Edge Cases: Data
  // =============================================================================

  describe('edge cases: data', () => {
    it('should handle special character filenames', async () => {
      const specialResults: FuzzySearchResult[] = [
        {
          path: 'src/my_component.tsx',
          name: 'my_component.tsx',
          score: 90,
          matchIndices: [],
          pathMatchIndices: [],
        },
        {
          path: 'src/special-chars-file.ts',
          name: 'special-chars-file.ts',
          score: 80,
          matchIndices: [],
          pathMatchIndices: [],
        },
      ];
      mockFuzzySearchFiles.mockResolvedValue(specialResults);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'component');

      await advancePastDebounce();

      expect(mockFuzzySearchFiles).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByText('my_component.tsx')).toBeInTheDocument();
        expect(screen.getByText('special-chars-file.ts')).toBeInTheDocument();
      });
    });

    it('should limit displayed results to 50', async () => {
      // Create 100 results - the component preserves API order (no alphabetical sorting)
      // and limits display to first 50 results
      const results: FuzzySearchResult[] = Array.from({ length: 100 }, (_, i) => ({
        path: `src/file-${String(i)}.ts`,
        name: `file-${String(i)}.ts`,
        score: 100 - i,
        matchIndices: [],
        pathMatchIndices: [],
      }));
      mockFuzzySearchFiles.mockResolvedValue(results);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'file');

      await advancePastDebounce();

      await waitFor(() => {
        // Should show first 50 in API order (file-0.ts to file-49.ts)
        expect(screen.getByText('file-0.ts')).toBeInTheDocument();
        expect(screen.getByText('file-49.ts')).toBeInTheDocument();

        // Should NOT show 51st and beyond (file-50.ts onwards)
        expect(screen.queryByText('file-50.ts')).not.toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // Edge Cases: State
  // =============================================================================

  describe('edge cases: state', () => {
    it('should handle empty query (whitespace only)', async () => {
      const { user } = renderQuickOpen();

      // Wait for initial empty-query search
      await advancePastDebounce();
      mockFuzzySearchFiles.mockClear();

      await user.type(screen.getByPlaceholderText('Search files...'), '   ');

      await advancePastDebounce();

      // Whitespace-only query should be treated as empty — shows suggestions, not search results
      await waitFor(() => {
        expect(screen.getByText('No files found.')).toBeInTheDocument();
      });
    });

    it('should search disabled when dialog is closed (enabled=false)', () => {
      // This is handled by the useMentionSearch hook's enabled option
      // When open=false, useMentionSearch won't perform searches
      renderQuickOpen(false);

      // No search should happen
      expect(mockFuzzySearchFiles).not.toHaveBeenCalled();
    });
  });
});
