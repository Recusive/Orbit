import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { FileDiff } from '@/stores/file/file-store';

import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('FileViewerStore');

// Diff data for files opened from Changes tab
export interface ViewedFileDiff {
  oldContent: string;
  newContent: string;
  diff: FileDiff;
}

// View mode for files with diff data
export type FileViewMode = 'file' | 'diff';

// File being viewed in the file viewer
export interface ViewedFile {
  path: string;
  content: string;
  originalContent: string; // Content when file was opened (for dirty detection)
  language: string;
  scrollPosition?: number;
  // Diff support for files opened from Changes tab
  diffData?: ViewedFileDiff;
  viewMode: FileViewMode;
  isModified: boolean; // Track if content has been modified
  isExternal: boolean; // File is outside workspace (read-only, no save)
}

// Position to navigate to after opening a file
export interface GotoPosition {
  /** File path this goto applies to (for split view scoping) */
  path: string;
  line: number; // 0-indexed
  column: number; // 0-indexed
  /** Unique ID to ensure effect re-triggers for same position */
  id: number;
}

// Cursor position for status bar display
export interface CursorPosition {
  line: number; // 1-indexed for display
  column: number; // 1-indexed for display
}

// Stable default reference - MUST be a constant to avoid infinite re-renders in Zustand selectors
const DEFAULT_CURSOR_POSITION: CursorPosition = { line: 1, column: 1 };

// Search trigger scoped by file path (for split view)
export interface SearchTrigger {
  path: string;
  id: number;
}

// Monotonic counter for unique IDs (guaranteed unique, unlike Date.now())
let gotoIdCounter = 0;
let searchIdCounter = 0;

interface FileViewerState {
  // Open file tabs
  openTabs: ViewedFile[];
  activeTabPath: string | null;

  // Cursor positions per file (for split view - each pane tracks its own cursor)
  cursorPositions: Record<string, CursorPosition>;

  // Navigation history
  history: string[];
  historyIndex: number;

  // Loading state
  isLoading: boolean;
  loadingPath: string | null;

  // Search state (scoped by file path for split view)
  searchOpen: boolean;
  searchTrigger: SearchTrigger | null; // { path, id } - only matching editor opens search
  searchQuery: string;

  // Pending goto position (for diagnostic clicks, etc.)
  pendingGoto: GotoPosition | null;

  // Editor settings
  wordWrap: boolean;
}

interface FileViewerActions {
  // Tab management
  openFile: (path: string, content?: string) => void;
  openFileWithDiff: (path: string, diffData: ViewedFileDiff, language?: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  closeAllTabs: () => void;

  // Content management
  setFileContent: (path: string, content: string, language?: string) => void;
  updateContent: (path: string, content: string) => void; // For editor changes
  markSaved: (path: string) => void; // Mark file as saved (not modified)

  // Goto line/column (for diagnostics, etc.)
  gotoPosition: (path: string, line: number, column: number, content?: string) => void;
  clearPendingGoto: () => void;

  // Cursor position (for status bar) - scoped by file path for split view
  setCursorPosition: (path: string, line: number, column: number) => void;

  // Loading
  setLoading: (isLoading: boolean, path?: string) => void;

  // Search - scoped by file path for split view
  toggleSearch: (path: string) => void;
  setSearchQuery: (query: string) => void;
  closeSearch: () => void;

  // Editor settings
  toggleWordWrap: () => void;
}

type FileViewerStore = FileViewerState & FileViewerActions;

// Map file extensions to language identifiers
export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const languageMap: Record<string, string> = {
    // TypeScript variants
    ts: 'typescript',
    tsx: 'typescriptreact',
    mts: 'typescript',
    cts: 'typescript',
    // JavaScript variants
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    cjs: 'javascript',
    // Data formats
    json: 'json',
    jsonc: 'json',
    json5: 'json',
    // Markup & docs
    md: 'markdown',
    mdx: 'markdown',
    // Styles
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    // Web
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    // Config
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    // Languages
    py: 'python',
    pyw: 'python',
    pyi: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    hxx: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    kts: 'kotlin',
    // Shell
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    // Other
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };

  // Handle special filenames
  const filename = path.split('/').pop()?.toLowerCase() ?? '';
  if (filename === 'dockerfile') return 'dockerfile';
  if (filename === 'makefile') return 'makefile';
  if (filename.startsWith('.env')) return 'dotenv';

  return languageMap[ext] ?? 'plaintext';
}

/** Check whether a file path is outside the current workspace. */
function isPathExternal(filePath: string): boolean {
  const workspacePath = useUIStore.getState().workspacePath;
  if (!workspacePath) return false;
  return !filePath.startsWith(workspacePath);
}

export const useFileViewerStore = create<FileViewerStore>()(
  persist(
    immer((set, get) => ({
      // Initial state
      openTabs: [],
      activeTabPath: null,
      cursorPositions: {}, // Per-file cursor positions for split view
      history: [],
      historyIndex: -1,
      isLoading: false,
      loadingPath: null,
      searchOpen: false,
      searchTrigger: null, // { path, id } for scoped search in split view
      searchQuery: '',
      pendingGoto: null,
      wordWrap: false,

      openFile: (path: string, content?: string): void => {
        logger.debug(`Opening file: ${path}`);
        set((state) => {
          // Close search when opening/switching files
          state.searchOpen = false;
          state.searchQuery = '';

          // Check if tab already exists
          const existingTab = state.openTabs.find((tab) => tab.path === path);

          if (existingTab) {
            // Switch to existing tab, reset to file view mode
            state.activeTabPath = path;
            existingTab.viewMode = 'file';
            // Update language in case detection was improved
            existingTab.language = getLanguageFromPath(path);
          } else {
            // Create new tab
            const fileContent = content ?? '';
            const newTab: ViewedFile = {
              path,
              content: fileContent,
              originalContent: fileContent,
              language: getLanguageFromPath(path),
              viewMode: 'file',
              isModified: false,
              isExternal: isPathExternal(path),
            };
            state.openTabs.push(newTab);
            state.activeTabPath = path;
          }

          // Update history (only if different from current position)
          if (state.history[state.historyIndex] !== path) {
            // Truncate forward history and add new entry
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(path);
            state.historyIndex = state.history.length - 1;
          }
        });
      },

      openFileWithDiff: (path: string, diffData: ViewedFileDiff, language?: string): void => {
        set((state) => {
          // Check if tab already exists
          const existingTab = state.openTabs.find((tab) => tab.path === path);

          if (existingTab) {
            // Update existing tab with diff data and switch to diff view
            existingTab.diffData = diffData;
            existingTab.viewMode = 'diff';
            state.activeTabPath = path;
          } else {
            // Create new tab with diff data
            const newTab: ViewedFile = {
              path,
              content: diffData.newContent,
              originalContent: diffData.newContent,
              language: language ?? getLanguageFromPath(path),
              diffData,
              viewMode: 'diff',
              isModified: false,
              isExternal: isPathExternal(path),
            };
            state.openTabs.push(newTab);
            state.activeTabPath = path;
          }

          // Update history
          if (state.history[state.historyIndex] !== path) {
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(path);
            state.historyIndex = state.history.length - 1;
          }
        });
      },

      closeTab: (path: string): void => {
        logger.debug(`Closing tab: ${path}`);
        set((state) => {
          const tabIndex = state.openTabs.findIndex((tab) => tab.path === path);
          if (tabIndex === -1) return;

          // Remove the tab
          state.openTabs.splice(tabIndex, 1);

          // If closing active tab, switch to another
          if (state.activeTabPath === path) {
            if (state.openTabs.length === 0) {
              state.activeTabPath = null;
            } else {
              // Switch to previous tab or first available
              const newIndex = Math.min(tabIndex, state.openTabs.length - 1);
              state.activeTabPath = state.openTabs[newIndex]?.path ?? null;
            }
          }
        });
      },

      setActiveTab: (path: string): void => {
        set((state) => {
          const tab = state.openTabs.find((t) => t.path === path);
          if (tab) {
            state.activeTabPath = path;
            // Close search when switching tabs
            state.searchOpen = false;
            state.searchQuery = '';

            // Update history
            if (state.history[state.historyIndex] !== path) {
              state.history = state.history.slice(0, state.historyIndex + 1);
              state.history.push(path);
              state.historyIndex = state.history.length - 1;
            }
          }
        });
      },

      closeAllTabs: (): void => {
        set((state) => {
          state.openTabs = [];
          state.activeTabPath = null;
          state.history = [];
          state.historyIndex = -1;
        });
      },

      setFileContent: (path: string, content: string, language?: string): void => {
        set((state) => {
          const tab = state.openTabs.find((t) => t.path === path);
          if (tab) {
            tab.content = content;
            tab.originalContent = content;
            tab.isModified = false;
            if (language) {
              tab.language = language;
            }
          } else {
            // Create new tab with content
            state.openTabs.push({
              path,
              content,
              originalContent: content,
              language: language ?? getLanguageFromPath(path),
              viewMode: 'file',
              isModified: false,
              isExternal: isPathExternal(path),
            });
            state.activeTabPath = path;
          }
          state.isLoading = false;
          state.loadingPath = null;
        });
      },

      updateContent: (path: string, content: string): void => {
        set((state) => {
          const tab = state.openTabs.find((t) => t.path === path);
          if (tab) {
            tab.content = content;
            tab.isModified = content !== tab.originalContent;
          }
        });
      },

      markSaved: (path: string): void => {
        logger.info(`File saved: ${path}`);
        set((state) => {
          const tab = state.openTabs.find((t) => t.path === path);
          if (tab) {
            tab.originalContent = tab.content;
            tab.isModified = false;
          }
        });
      },

      setLoading: (isLoading: boolean, path?: string): void => {
        set((state) => {
          state.isLoading = isLoading;
          state.loadingPath = path ?? null;
        });
      },

      toggleSearch: (path: string): void => {
        set((state) => {
          if (state.searchOpen && state.searchTrigger?.path === path) {
            // Closing: clear search state for this file
            state.searchOpen = false;
            state.searchQuery = '';
            state.searchTrigger = null;
          } else {
            // Opening: set scoped trigger so only matching editor opens search
            // Use monotonic counter for guaranteed unique IDs
            searchIdCounter += 1;
            state.searchTrigger = { path, id: searchIdCounter };
            state.searchOpen = true;
          }
        });
      },

      setSearchQuery: (query: string): void => {
        set((state) => {
          state.searchQuery = query;
        });
      },

      closeSearch: (): void => {
        set((state) => {
          state.searchOpen = false;
          state.searchQuery = '';
          state.searchTrigger = null;
        });
      },

      gotoPosition: (path: string, line: number, column: number, content?: string): void => {
        // Open the file (or switch to it if already open)
        get().openFile(path, content);

        // Set the pending goto position with unique ID to ensure effect re-triggers
        // Include path for split view scoping - only matching editor should navigate
        // Use monotonic counter for guaranteed unique IDs (Date.now() can collide)
        gotoIdCounter += 1;
        set((state) => {
          state.pendingGoto = { path, line, column, id: gotoIdCounter };
        });
      },

      clearPendingGoto: (): void => {
        set((state) => {
          state.pendingGoto = null;
        });
      },

      setCursorPosition: (path: string, line: number, column: number): void => {
        set((state) => {
          state.cursorPositions[path] = { line, column };
        });
      },

      toggleWordWrap: (): void => {
        set((state) => {
          state.wordWrap = !state.wordWrap;
        });
      },
    })),
    {
      name: 'orbit-file-viewer',
      partialize: (state) => ({
        wordWrap: state.wordWrap,
      }),
    }
  )
);

// Selector hooks
export const useActiveFile = (): ViewedFile | null => {
  return useFileViewerStore((state) => {
    if (!state.activeTabPath) return null;
    return state.openTabs.find((t) => t.path === state.activeTabPath) ?? null;
  });
};

export const useFileByPath = (path: string | null): ViewedFile | null => {
  return useFileViewerStore((state) => {
    if (!path) return null;
    return state.openTabs.find((t) => t.path === path) ?? null;
  });
};

export const useOpenTabs = (): ViewedFile[] => {
  return useFileViewerStore((state) => state.openTabs);
};

export const useHasOpenFiles = (): boolean => {
  return useFileViewerStore((state) => state.openTabs.length > 0);
};

// Use shallow comparison for object selectors to prevent infinite re-renders
export const useFileViewerLoading = (): { isLoading: boolean; path: string | null } => {
  const isLoading = useFileViewerStore((state) => state.isLoading);
  const path = useFileViewerStore((state) => state.loadingPath);
  return { isLoading, path };
};

// Get cursor position for a specific file (for split view)
// Returns stable DEFAULT_CURSOR_POSITION reference to prevent infinite re-renders
export const useCursorPosition = (path: string | null): CursorPosition => {
  return useFileViewerStore((state) => {
    if (!path) return DEFAULT_CURSOR_POSITION;
    return state.cursorPositions[path] ?? DEFAULT_CURSOR_POSITION;
  });
};

export const useWordWrap = (): boolean => {
  return useFileViewerStore((state) => state.wordWrap);
};
