import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompletionItem, HoverInfo, Location } from '@/lib/backend';

import {
  getCompletions,
  getHover,
  gotoDefinition,
  lspDidChange,
  lspDidClose,
  lspDidOpen,
  lspDidSave,
  lspIsRunning,
  lspStart,
  lspStop,
} from '@/lib/backend';

// ============================================
// Supported Languages
// ============================================

/**
 * Languages that have LSP server support.
 * This must match the backend's default_config_for_language() in snowflake-lsp.
 */
const SUPPORTED_LSP_LANGUAGES = new Set([
  // Core languages
  'rust',
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
  'tsx',
  'jsx',
  'python',
  'go',
  // Data formats
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  // Web
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'vue',
  'svelte',
  // Documentation
  'markdown',
  'md',
  // Shell
  'bash',
  'sh',
  'zsh',
  'shell',
  // C/C++
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'hxx',
  // Other languages
  'dockerfile',
  'lua',
  'php',
  'ruby',
  'rb',
  'swift',
  'graphql',
  'gql',
  'sql',
  'zig',
]);

/**
 * Check if a language has LSP support.
 */
function hasLspSupport(language: string | null): boolean {
  if (!language) return false;
  return SUPPORTED_LSP_LANGUAGES.has(language.toLowerCase());
}

// ============================================
// Types
// ============================================

export interface UseLspResult {
  /** Whether the server is running */
  isRunning: boolean;
  /** Whether we're currently checking server status */
  isChecking: boolean;
  /** Error from last operation, if any */
  error: Error | null;
  /** Start the language server */
  start: (language: string, rootPath: string) => Promise<void>;
  /** Stop the language server */
  stop: (language: string) => Promise<void>;
  /** Refresh the running status from backend */
  refresh: () => Promise<void>;
  /** Notify server that a file was opened */
  didOpen: (path: string, language: string, content: string) => Promise<void>;
  /** Notify server of file changes */
  didChange: (path: string, content: string, version: number) => Promise<void>;
  /** Notify server that a file was saved */
  didSave: (path: string) => Promise<void>;
  /** Notify server that a file was closed */
  didClose: (path: string) => Promise<void>;
  /** Get completions at position */
  getCompletions: (path: string, line: number, column: number) => Promise<CompletionItem[]>;
  /** Get hover info at position */
  getHover: (path: string, line: number, column: number) => Promise<HoverInfo | null>;
  /** Go to definition */
  gotoDefinition: (path: string, line: number, column: number) => Promise<Location | null>;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for LSP (Language Server Protocol) operations.
 *
 * Provides methods to start/stop language servers and perform
 * code intelligence operations like completion, hover, and go-to-definition.
 *
 * @param language - Optional language ID to check running status for
 * @param rootPath - Optional workspace root path for auto-starting
 * @returns LSP operations and state
 *
 * @example
 * ```tsx
 * function Editor({ file }) {
 *   const lsp = useLsp('typescript', '/path/to/project');
 *
 *   useEffect(() => {
 *     if (file && lsp.isRunning) {
 *       lsp.didOpen(file.path, 'typescript', file.content);
 *     }
 *   }, [file, lsp.isRunning]);
 *
 *   const handleCompletion = async (line: number, col: number) => {
 *     const items = await lsp.getCompletions(file.path, line, col);
 *     // Show completion menu
 *   };
 * }
 * ```
 */
export function useLsp(language: string | null, rootPath: string | null): UseLspResult {
  const [isRunning, setIsRunning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if a start operation is in progress to prevent race conditions
  const startingRef = useRef(false);

  // Refresh function to sync state with backend
  const refresh = useCallback(async (): Promise<void> => {
    if (!language || !hasLspSupport(language)) {
      setIsRunning(false);
      return;
    }
    try {
      const running = await lspIsRunning(language);
      setIsRunning(running);
    } catch {
      setIsRunning(false);
    }
  }, [language]);

  // Check if server is running on mount and when language changes
  useEffect(() => {
    if (!language || !hasLspSupport(language)) {
      setIsRunning(false);
      return;
    }

    setIsChecking(true);
    lspIsRunning(language)
      .then(setIsRunning)
      .catch(() => {
        setIsRunning(false);
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, [language]);

  const start = useCallback(
    async (lang: string, root: string): Promise<void> => {
      setError(null);
      try {
        await lspStart(lang, root);
        setIsRunning(true);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        // Re-sync state with backend after error
        if (language) {
          lspIsRunning(language)
            .then((running): void => {
              setIsRunning(running);
            })
            .catch((): void => {
              setIsRunning(false);
            });
        }
        throw error;
      }
    },
    [language]
  );

  const stop = useCallback(
    async (lang: string): Promise<void> => {
      setError(null);
      try {
        await lspStop(lang);
        setIsRunning(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        // Re-sync state with backend after error
        if (language) {
          lspIsRunning(language)
            .then((running): void => {
              setIsRunning(running);
            })
            .catch((): void => {
              setIsRunning(false);
            });
        }
        throw error;
      }
    },
    [language]
  );

  const didOpen = useCallback(
    async (path: string, lang: string, content: string): Promise<void> => {
      // Skip LSP for unsupported languages
      if (!hasLspSupport(lang)) {
        return;
      }

      // Auto-start server if not running, with race condition protection
      if (rootPath && !startingRef.current) {
        // Check actual backend state, not local state
        const actuallyRunning = await lspIsRunning(lang).catch(() => false);
        if (!actuallyRunning) {
          startingRef.current = true;
          try {
            await lspStart(lang, rootPath);
            setIsRunning(true);
          } finally {
            startingRef.current = false;
          }
        }
      }
      await lspDidOpen(path, lang, content);
    },
    [rootPath]
  );

  const didChange = useCallback(
    async (path: string, content: string, version: number): Promise<void> => {
      await lspDidChange(path, content, version);
    },
    []
  );

  const didSave = useCallback(async (path: string): Promise<void> => {
    await lspDidSave(path);
  }, []);

  const didClose = useCallback(async (path: string): Promise<void> => {
    await lspDidClose(path);
  }, []);

  const completions = useCallback(
    async (path: string, line: number, column: number): Promise<CompletionItem[]> => {
      return getCompletions(path, line, column);
    },
    []
  );

  const hover = useCallback(
    async (path: string, line: number, column: number): Promise<HoverInfo | null> => {
      return getHover(path, line, column);
    },
    []
  );

  const definition = useCallback(
    async (path: string, line: number, column: number): Promise<Location | null> => {
      return gotoDefinition(path, line, column);
    },
    []
  );

  return {
    isRunning,
    isChecking,
    error,
    start,
    stop,
    refresh,
    didOpen,
    didChange,
    didSave,
    didClose,
    getCompletions: completions,
    getHover: hover,
    gotoDefinition: definition,
  };
}
