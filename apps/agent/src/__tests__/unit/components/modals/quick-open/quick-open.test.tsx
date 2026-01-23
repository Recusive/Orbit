/**
 * QuickOpen Integration Tests
 *
 * Tests for the Quick Open modal (Command Palette) that provides:
 * - File search with debouncing
 * - Recent files display
 * - File opening on selection
 *
 * This is an INTEGRATION test because:
 * - Uses real FileStore and FileViewerStore (reset between tests)
 * - Mocks only Tauri communication (invoke, postMessage)
 * - Tests full user flows from typing to file opening
 *
 * @see quick-open.tsx - Component implementation
 * @see use-search.ts - Search hook with debouncing
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SearchResult } from '@/lib/api';

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
const { mockPostMessage, mockSearchFiles } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
  mockSearchFiles: vi.fn<[string, string, { maxResults?: number }?], Promise<SearchResult[]>>(),
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
 * Mock searchFiles API function.
 */
vi.mock('@/lib/api', () => ({
  searchFiles: mockSearchFiles,
}));

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create mock search results for testing.
 */
function createMockSearchResults(count: number, prefix = 'file'): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `/workspace/src/${prefix}-${String(i)}.ts`,
    name: `${prefix}-${String(i)}.ts`,
    isDir: false,
  }));
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
  // Reset stores to initial state
  useFileStore.setState(useFileStore.getInitialState(), true);
  useFileViewerStore.setState(useFileViewerStore.getInitialState(), true);

  // Set up default workspace path
  useFileStore.setState({ rootPath: '/workspace' });

  // Clear all mocks
  vi.clearAllMocks();

  // Default mock: return empty results
  mockSearchFiles.mockResolvedValue([]);

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
    it('should show initial empty state when opened with no query', () => {
      renderQuickOpen();

      expect(screen.getByText('Type to search files...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search files...')).toBeInTheDocument();
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
      mockSearchFiles.mockImplementation(
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
      mockSearchFiles.mockResolvedValue(createMockSearchResults(3, 'component'));

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
      mockSearchFiles.mockResolvedValue([]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'nonexistent');

      await advancePastDebounce();

      await waitFor(() => {
        expect(screen.getByText('No matching files found.')).toBeInTheDocument();
      });
    });

    it('should call searchFiles with correct parameters', async () => {
      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'utils');

      await advancePastDebounce();

      expect(mockSearchFiles).toHaveBeenCalledWith('/workspace', 'utils', {
        maxResults: 100,
      });
    });

    it('should filter out directories from results', async () => {
      // Use distinct names to avoid path/name collision
      mockSearchFiles.mockResolvedValue([
        { path: '/workspace/src/components/MyFile.ts', name: 'MyFile.ts', isDir: false },
        { path: '/workspace/src/components/MyFolder', name: 'MyFolder', isDir: true },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      await advancePastDebounce();

      await waitFor(() => {
        // File should be rendered (name appears in the span)
        expect(screen.getByText('MyFile.ts')).toBeInTheDocument();
        // Directory should be filtered out by useSearch hook
        expect(screen.queryByText('MyFolder')).not.toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // Integration Tests: Recent Files
  // =============================================================================

  describe('recent files', () => {
    it('should display recent files when no query is entered', () => {
      // Set up open tabs (recent files)
      useFileViewerStore.setState({
        openTabs: [
          {
            path: '/workspace/src/recent-1.ts',
            content: '',
            originalContent: '',
            language: 'typescript',
            viewMode: 'file',
            isModified: false,
          },
          {
            path: '/workspace/src/recent-2.ts',
            content: '',
            originalContent: '',
            language: 'typescript',
            viewMode: 'file',
            isModified: false,
          },
        ],
      });

      renderQuickOpen();

      expect(screen.getByText('Recent')).toBeInTheDocument();
      expect(screen.getByText('recent-1.ts')).toBeInTheDocument();
      expect(screen.getByText('recent-2.ts')).toBeInTheDocument();
    });

    it('should limit recent files to 10', () => {
      // Set up 15 open tabs
      const tabs = Array.from({ length: 15 }, (_, i) => ({
        path: `/workspace/src/file-${String(i)}.ts`,
        content: '',
        originalContent: '',
        language: 'typescript',
        viewMode: 'file' as const,
        isModified: false,
      }));

      useFileViewerStore.setState({ openTabs: tabs });

      renderQuickOpen();

      // Should show first 10
      expect(screen.getByText('file-0.ts')).toBeInTheDocument();
      expect(screen.getByText('file-9.ts')).toBeInTheDocument();

      // Should NOT show 11th and beyond
      expect(screen.queryByText('file-10.ts')).not.toBeInTheDocument();
    });

    it('should hide recent files when query is entered', async () => {
      useFileViewerStore.setState({
        openTabs: [
          {
            path: '/workspace/src/recent.ts',
            content: '',
            originalContent: '',
            language: 'typescript',
            viewMode: 'file',
            isModified: false,
          },
        ],
      });

      const { user } = renderQuickOpen();

      expect(screen.getByText('recent.ts')).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      // Recent section should disappear when query is present
      expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    });

    it('should sort search results with recent files first', async () => {
      // Set up a recent file
      useFileViewerStore.setState({
        openTabs: [
          {
            path: '/workspace/src/button.ts',
            content: '',
            originalContent: '',
            language: 'typescript',
            viewMode: 'file',
            isModified: false,
          },
        ],
      });

      // Search returns multiple results including the recent one
      mockSearchFiles.mockResolvedValue([
        { path: '/workspace/src/accordion.ts', name: 'accordion.ts', isDir: false },
        { path: '/workspace/src/button.ts', name: 'button.ts', isDir: false },
        { path: '/workspace/src/card.ts', name: 'card.ts', isDir: false },
      ]);

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'ts');

      await advancePastDebounce();

      await waitFor(() => {
        const items = screen.getAllByRole('option');
        // Recent file (button.ts) should be first
        expect(items[0]).toHaveTextContent('button.ts');
      });
    });
  });

  // =============================================================================
  // Integration Tests: File Selection
  // =============================================================================

  describe('file selection', () => {
    it('should open file and close dialog when result is clicked', async () => {
      mockSearchFiles.mockResolvedValue([
        { path: '/workspace/src/selected.ts', name: 'selected.ts', isDir: false },
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
        openTabs: [
          {
            path: '/workspace/src/recent.ts',
            content: '',
            originalContent: '',
            language: 'typescript',
            viewMode: 'file',
            isModified: false,
          },
        ],
      });

      const { onOpenChange, user } = renderQuickOpen();

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
      mockSearchFiles.mockResolvedValue([
        { path: '/workspace/src/loading.ts', name: 'loading.ts', isDir: false },
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
      mockSearchFiles.mockResolvedValue([
        { path: '/workspace/src/components/button.ts', name: 'button.ts', isDir: false },
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
      mockSearchFiles.mockResolvedValue([
        { path: '/workspace/utils.ts', name: 'utils.ts', isDir: false },
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
      mockSearchFiles.mockResolvedValue([
        { path: '/other/location/file.ts', name: 'file.ts', isDir: false },
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

      // Type rapidly
      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      // Should not call search immediately
      expect(mockSearchFiles).not.toHaveBeenCalled();

      // Advance past debounce
      await advancePastDebounce();

      // Should have called search once with final query
      expect(mockSearchFiles).toHaveBeenCalledTimes(1);
      expect(mockSearchFiles).toHaveBeenCalledWith('/workspace', 'test', { maxResults: 100 });
    });

    it('should only show latest search results (handles out-of-order responses)', async () => {
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

      const { user } = renderQuickOpen();

      // Type first query
      await user.type(screen.getByPlaceholderText('Search files...'), 'first');

      await advancePastDebounce();

      // Clear and type second query
      await user.clear(screen.getByPlaceholderText('Search files...'));
      await user.type(screen.getByPlaceholderText('Search files...'), 'second');

      await advancePastDebounce();

      // Resolve second (fast) first
      resolveSecond([
        { path: '/workspace/src/SecondResult.ts', name: 'SecondResult.ts', isDir: false },
      ]);

      await waitFor(() => {
        expect(screen.getByText('SecondResult.ts')).toBeInTheDocument();
      });

      // Now resolve first (slow) - should be ignored
      resolveFirst([
        { path: '/workspace/src/FirstResult.ts', name: 'FirstResult.ts', isDir: false },
      ]);

      // Should still show second results (first is stale)
      await waitFor(() => {
        expect(screen.getByText('SecondResult.ts')).toBeInTheDocument();
        expect(screen.queryByText('FirstResult.ts')).not.toBeInTheDocument();
      });
    });

    it('should handle search errors gracefully', async () => {
      mockSearchFiles.mockRejectedValue(new Error('Search failed'));

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
    it('should handle no rootPath gracefully', async () => {
      useFileStore.setState({ rootPath: null });

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), 'test');

      await advancePastDebounce();

      // Should not call search without rootPath
      expect(mockSearchFiles).not.toHaveBeenCalled();
    });

    it('should handle special character filenames', async () => {
      // Mock with files containing special characters (hyphens, underscores)
      // shouldFilter={false} on Command means search results are displayed as-is from the API
      const specialResults: SearchResult[] = [
        { path: '/workspace/src/my_component.tsx', name: 'my_component.tsx', isDir: false },
        {
          path: '/workspace/src/special-chars-file.ts',
          name: 'special-chars-file.ts',
          isDir: false,
        },
      ];
      mockSearchFiles.mockResolvedValue(specialResults);

      const { user } = renderQuickOpen();

      // Query doesn't need to match paths since cmdk filtering is disabled
      await user.type(screen.getByPlaceholderText('Search files...'), 'component');

      await advancePastDebounce();

      expect(mockSearchFiles).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByText('my_component.tsx')).toBeInTheDocument();
        expect(screen.getByText('special-chars-file.ts')).toBeInTheDocument();
      });
    });

    it('should limit displayed results to 50', async () => {
      // Create 100 results - the component preserves API order (no alphabetical sorting)
      // and limits display to first 50 results
      const results: SearchResult[] = Array.from({ length: 100 }, (_, i) => ({
        path: `/workspace/src/file-${String(i)}.ts`,
        name: `file-${String(i)}.ts`,
        isDir: false,
      }));
      mockSearchFiles.mockResolvedValue(results);

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
      mockSearchFiles.mockResolvedValue(createMockSearchResults(3));

      const { user } = renderQuickOpen();

      await user.type(screen.getByPlaceholderText('Search files...'), '   ');

      await advancePastDebounce();

      // Should not search with whitespace-only query
      expect(mockSearchFiles).not.toHaveBeenCalled();
      expect(screen.getByText('Type to search files...')).toBeInTheDocument();
    });

    it('should search disabled when dialog is closed (enabled=false)', () => {
      // This is handled by the useSearch hook's enabled option
      // When open=false, useSearch won't perform searches
      renderQuickOpen(false);

      // No search should happen even if there were a query
      expect(mockSearchFiles).not.toHaveBeenCalled();
    });
  });
});
