import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { FileDiff } from '@/stores/file-store';

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
}

interface FileViewerState {
  // Open file tabs
  openTabs: ViewedFile[];
  activeTabPath: string | null;

  // Navigation history
  history: string[];
  historyIndex: number;

  // Loading state
  isLoading: boolean;
  loadingPath: string | null;

  // Search state
  searchOpen: boolean;
  searchQuery: string;
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
  setScrollPosition: (path: string, position: number) => void;

  // View mode
  toggleViewMode: (path: string) => void;
  setViewMode: (path: string, mode: FileViewMode) => void;

  // Navigation
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;

  // Loading
  setLoading: (isLoading: boolean, path?: string) => void;

  // Search
  toggleSearch: () => void;
  setSearchQuery: (query: string) => void;
  closeSearch: () => void;
}

type FileViewerStore = FileViewerState & FileViewerActions;

// Map file extensions to language identifiers
export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
    toml: 'toml',
    ini: 'ini',
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

export const useFileViewerStore = create<FileViewerStore>()(
  immer((set, get) => ({
    // Initial state
    openTabs: [],
    activeTabPath: null,
    history: [],
    historyIndex: -1,
    isLoading: false,
    loadingPath: null,
    searchOpen: false,
    searchQuery: '',

    openFile: (path: string, content?: string): void => {
      set((state) => {
        // Check if tab already exists
        const existingTab = state.openTabs.find((tab) => tab.path === path);

        if (existingTab) {
          // Just switch to existing tab, reset to file view mode
          state.activeTabPath = path;
          existingTab.viewMode = 'file';
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
      set((state) => {
        const tab = state.openTabs.find((t) => t.path === path);
        if (tab) {
          tab.originalContent = tab.content;
          tab.isModified = false;
        }
      });
    },

    setScrollPosition: (path: string, position: number): void => {
      set((state) => {
        const tab = state.openTabs.find((t) => t.path === path);
        if (tab) {
          tab.scrollPosition = position;
        }
      });
    },

    toggleViewMode: (path: string): void => {
      set((state) => {
        const tab = state.openTabs.find((t) => t.path === path);
        if (tab?.diffData) {
          tab.viewMode = tab.viewMode === 'file' ? 'diff' : 'file';
        }
      });
    },

    setViewMode: (path: string, mode: FileViewMode): void => {
      set((state) => {
        const tab = state.openTabs.find((t) => t.path === path);
        if (tab) {
          tab.viewMode = mode;
        }
      });
    },

    goBack: (): void => {
      const state = get();
      if (state.openTabs.length < 2 || !state.activeTabPath) return;

      const currentIndex = state.openTabs.findIndex((t) => t.path === state.activeTabPath);
      if (currentIndex === -1) return;

      // Cycle to previous tab (wrap around to end if at start)
      const newIndex = currentIndex === 0 ? state.openTabs.length - 1 : currentIndex - 1;
      const newPath = state.openTabs[newIndex]?.path;

      if (newPath) {
        set((s) => {
          s.activeTabPath = newPath;
        });
      }
    },

    goForward: (): void => {
      const state = get();
      if (state.openTabs.length < 2 || !state.activeTabPath) return;

      const currentIndex = state.openTabs.findIndex((t) => t.path === state.activeTabPath);
      if (currentIndex === -1) return;

      // Cycle to next tab (wrap around to start if at end)
      const newIndex = currentIndex === state.openTabs.length - 1 ? 0 : currentIndex + 1;
      const newPath = state.openTabs[newIndex]?.path;

      if (newPath) {
        set((s) => {
          s.activeTabPath = newPath;
        });
      }
    },

    canGoBack: (): boolean => {
      const state = get();
      return state.openTabs.length > 1;
    },

    canGoForward: (): boolean => {
      const state = get();
      return state.openTabs.length > 1;
    },

    setLoading: (isLoading: boolean, path?: string): void => {
      set((state) => {
        state.isLoading = isLoading;
        state.loadingPath = path ?? null;
      });
    },

    toggleSearch: (): void => {
      set((state) => {
        state.searchOpen = !state.searchOpen;
        if (!state.searchOpen) {
          state.searchQuery = '';
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
      });
    },
  }))
);

// Selector hooks
export const useActiveFile = (): ViewedFile | null => {
  return useFileViewerStore((state) => {
    if (!state.activeTabPath) return null;
    return state.openTabs.find((t) => t.path === state.activeTabPath) ?? null;
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
