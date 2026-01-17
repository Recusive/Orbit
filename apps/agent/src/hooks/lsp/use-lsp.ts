import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompletionItem, HoverInfo, Location } from '@/lib/api';

import {
  getCompletions,
  getHover,
  gotoDefinition,
  lspDidChange,
  lspDidClose,
  lspDidOpen,
  lspDidSave,
  lspIsRunning,
  lspSetWorkspace,
  lspStart,
  lspStop,
} from '@/lib/api';

const logger = createLogger('LSP');

// ============================================
// Supported Languages
// ============================================

/**
 * Languages that have LSP server support.
 * This must match the backend's default_config_for_language() in orbit-lsp.
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
  /** Whether the workspace is initialized in the backend */
  isWorkspaceReady: boolean;
  /** Whether the language server is running */
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
// Module-level state for workspace initialization
// ============================================

/**
 * Track which workspace paths have been initialized.
 * This prevents redundant lspSetWorkspace calls when multiple
 * useLsp instances exist (e.g., multiple editors).
 */
const initializedWorkspaces = new Set<string>();

/**
 * Track which workspace paths are currently being initialized.
 * This prevents multiple concurrent initialization attempts.
 */
const initializingWorkspaces = new Set<string>();

/**
 * Callbacks to notify when a workspace becomes ready.
 * Used to trigger re-renders in all hook instances when initialization completes.
 */
const workspaceReadyListeners = new Map<string, Set<() => void>>();

// ============================================
// Hook
// ============================================

/**
 * Hook for LSP (Language Server Protocol) operations.
 *
 * This hook manages its own workspace initialization reactively:
 * - When rootPath changes, it automatically calls lspSetWorkspace
 * - Operations are skipped (with logging) until workspace is ready
 * - Multiple instances share workspace state to avoid redundant calls
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
 *   // No need to check isWorkspaceReady for operations - they handle it
 *   useEffect(() => {
 *     if (file && lsp.isRunning) {
 *       lsp.didOpen(file.path, 'typescript', file.content);
 *     }
 *   }, [file, lsp.isRunning]);
 *
 *   // UI can show initialization status
 *   if (!lsp.isWorkspaceReady) {
 *     return <div>Initializing LSP...</div>;
 *   }
 * }
 * ```
 */
export function useLsp(language: string | null, rootPath: string | null): UseLspResult {
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(
    rootPath ? initializedWorkspaces.has(rootPath) : false
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if a start operation is in progress to prevent race conditions
  const startingRef = useRef(false);

  // Ref to track current workspace ready state for use in cleanup functions
  // This avoids stale closure issues where cleanup runs with old state
  const isWorkspaceReadyRef = useRef(isWorkspaceReady);
  isWorkspaceReadyRef.current = isWorkspaceReady;

  // ============================================
  // Reactive workspace initialization
  // ============================================

  useEffect(() => {
    // No rootPath = no workspace to initialize
    if (!rootPath) {
      setIsWorkspaceReady(false);
      return;
    }

    // Already initialized this workspace - just sync state
    if (initializedWorkspaces.has(rootPath)) {
      setIsWorkspaceReady(true);
      return;
    }

    // New/uninitialized workspace: reset readiness until init completes
    // This prevents stale isWorkspaceReady=true from previous workspace
    setIsWorkspaceReady(false);

    // Register listener to be notified when initialization completes
    // This handles the case where another hook instance is initializing
    if (!workspaceReadyListeners.has(rootPath)) {
      workspaceReadyListeners.set(rootPath, new Set());
    }
    const listeners = workspaceReadyListeners.get(rootPath) ?? new Set();
    const onReady = (): void => {
      setIsWorkspaceReady(true);
    };
    listeners.add(onReady);

    // Already initializing (by another hook instance) - just wait for notification
    if (initializingWorkspaces.has(rootPath)) {
      return () => {
        listeners.delete(onReady);
      };
    }

    // This hook instance will do the initialization
    initializingWorkspaces.add(rootPath);
    logger.info('Initializing LSP workspace', { rootPath });

    lspSetWorkspace(rootPath)
      .then(() => {
        initializedWorkspaces.add(rootPath);
        logger.info('LSP workspace ready', { rootPath });
        // Notify all waiting hook instances
        const callbacks = workspaceReadyListeners.get(rootPath);
        if (callbacks) {
          callbacks.forEach((cb) => {
            cb();
          });
        }
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Failed to initialize LSP workspace', error);
        setError(error);
        setIsWorkspaceReady(false);
      })
      .finally(() => {
        initializingWorkspaces.delete(rootPath);
      });

    return () => {
      listeners.delete(onReady);
    };
  }, [rootPath]);

  // ============================================
  // Server status checking
  // ============================================

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

  // ============================================
  // Server lifecycle operations
  // ============================================

  const start = useCallback(
    async (lang: string, root: string): Promise<void> => {
      setError(null);
      try {
        logger.info('Starting LSP server', { language: lang, root });
        await lspStart(lang, root);
        setIsRunning(true);
        logger.debug('LSP server started', { language: lang });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Failed to start LSP server', error);
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
        logger.info('Stopping LSP server', { language: lang });
        await lspStop(lang);
        setIsRunning(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Failed to stop LSP server', error);
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

  // ============================================
  // Document notification operations
  // ============================================

  const didOpen = useCallback(
    async (path: string, lang: string, content: string): Promise<void> => {
      // Skip LSP for unsupported languages
      if (!hasLspSupport(lang)) {
        return;
      }

      // Skip if workspace not ready - log for observability
      if (!isWorkspaceReady || !rootPath) {
        logger.debug('Skipping LSP didOpen - workspace not ready', {
          path,
          lang,
          isWorkspaceReady,
        });
        return;
      }

      try {
        // Auto-start server if not running, with race condition protection
        if (!startingRef.current) {
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
      } catch (err) {
        // Log but don't throw - LSP errors shouldn't break the editor
        const error = err instanceof Error ? err : new Error(String(err));
        logger.warn('LSP didOpen failed', { path, lang, error: error.message });
      }
    },
    [isWorkspaceReady, rootPath]
  );

  const didChange = useCallback(
    async (path: string, content: string, version: number): Promise<void> => {
      if (!isWorkspaceReady) {
        logger.debug('Skipping LSP didChange - workspace not ready', { path });
        return;
      }
      await lspDidChange(path, content, version);
    },
    [isWorkspaceReady]
  );

  const didSave = useCallback(
    async (path: string): Promise<void> => {
      if (!isWorkspaceReady) {
        logger.debug('Skipping LSP didSave - workspace not ready', { path });
        return;
      }
      await lspDidSave(path);
    },
    [isWorkspaceReady]
  );

  const didClose = useCallback(
    async (path: string): Promise<void> => {
      // Use ref to get CURRENT workspace state, not stale closure state
      // This is important because didClose is often called from cleanup functions
      // which may have captured an old isWorkspaceReady value
      if (!isWorkspaceReadyRef.current) {
        // Silent skip - no logging for cleanup operations
        return;
      }
      try {
        await lspDidClose(path);
      } catch {
        // Silent fail - file might not have been opened, that's OK
      }
    },
    [] // No deps - uses ref for current state
  );

  // ============================================
  // Query operations
  // ============================================

  const completions = useCallback(
    async (path: string, line: number, column: number): Promise<CompletionItem[]> => {
      if (!isWorkspaceReady) {
        logger.debug('Skipping LSP completions - workspace not ready', { path });
        return [];
      }
      return getCompletions(path, line, column);
    },
    [isWorkspaceReady]
  );

  const hover = useCallback(
    async (path: string, line: number, column: number): Promise<HoverInfo | null> => {
      if (!isWorkspaceReady) {
        logger.debug('Skipping LSP hover - workspace not ready', { path });
        return null;
      }
      return getHover(path, line, column);
    },
    [isWorkspaceReady]
  );

  const definition = useCallback(
    async (path: string, line: number, column: number): Promise<Location | null> => {
      if (!isWorkspaceReady) {
        logger.debug('Skipping LSP gotoDefinition - workspace not ready', { path });
        return null;
      }
      return gotoDefinition(path, line, column);
    },
    [isWorkspaceReady]
  );

  // ============================================
  // Return value
  // ============================================

  return {
    isWorkspaceReady,
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
