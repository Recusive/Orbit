/**
 * File Watcher Hook
 *
 * Detects external file modifications by watching component source files.
 * Uses hash-based comparison to detect changes from other editors or processes.
 *
 * Usage:
 * ```tsx
 * const { isStale, externallyModified, acknowledgeChange, refreshHash } = useFileWatcher({
 *   componentName: 'button',
 *   componentType: 'ui',
 *   enabled: true,
 * });
 *
 * // Show warning when file was modified externally
 * {externallyModified && (
 *   <Alert>
 *     File was modified externally.
 *     <Button onClick={acknowledgeChange}>Dismiss</Button>
 *   </Alert>
 * )}
 * ```
 */

import { createLogger } from '@orbit/common/lib';
import { invoke } from '@tauri-apps/api/core';
import { watch } from '@tauri-apps/plugin-fs';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WatchEvent, UnwatchFn } from '@tauri-apps/plugin-fs';

// ============================================
// Logger
// ============================================

const logger = createLogger('useFileWatcher');

// ============================================
// Types
// ============================================

/**
 * Options for the file watcher hook
 */
export interface UseFileWatcherOptions {
  /** Name of the component to watch */
  componentName: string;
  /** Type of component (ui or custom) */
  componentType: 'ui' | 'custom';
  /** Whether file watching is enabled */
  enabled?: boolean;
}

/**
 * Result of computing file hash
 */
interface FileHashResult {
  success: boolean;
  hash: string | null;
  error: string | null;
}

/**
 * Result of getting file path
 */
interface FilePathResult {
  success: boolean;
  path: string | null;
  error: string | null;
}

/**
 * Return type for the hook
 */
export interface UseFileWatcherReturn {
  /** Whether the current content may be stale (file was modified) */
  isStale: boolean;
  /** Whether the file was modified externally (vs our own writes) */
  externallyModified: boolean;
  /** Last known hash of the file content */
  lastKnownHash: string | null;
  /** Acknowledge the external change and reset the flag */
  acknowledgeChange: () => void;
  /** Manually refresh the hash (e.g., after our own save) */
  refreshHash: () => Promise<void>;
  /** Whether file watching is active */
  isWatching: boolean;
  /** Any error that occurred during watching */
  error: string | null;
}

// ============================================
// Constants
// ============================================

/** Debounce delay for hash checks (ms) */
const HASH_DEBOUNCE_MS = 100;

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for watching component source files for external modifications.
 *
 * Uses Tauri's file system watcher to detect changes, then computes
 * a hash to determine if the content actually changed (vs metadata updates).
 */
export function useFileWatcher(options: UseFileWatcherOptions): UseFileWatcherReturn {
  const { componentName, componentType, enabled = true } = options;

  // State
  const [isStale, setIsStale] = useState(false);
  const [externallyModified, setExternallyModified] = useState(false);
  const [lastKnownHash, setLastKnownHash] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for tracking async state
  const isMountedRef = useRef<boolean>(true);
  const unwatchRef = useRef<UnwatchFn | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOurWriteRef = useRef<boolean>(false);
  const currentHashRef = useRef<string | null>(null);

  // Getter functions prevent TypeScript from narrowing ref values across async boundaries
  const isMounted = useCallback((): boolean => isMountedRef.current, []);

  /**
   * Get the file hash from the backend
   */
  const getFileHash = useCallback(async (): Promise<string | null> => {
    try {
      const result = await invoke<FileHashResult>('canvas_get_component_hash', {
        componentName,
        componentType,
      });

      if (!result.success || !result.hash) {
        logger.warn('Failed to get file hash', { error: result.error });
        return null;
      }

      return result.hash;
    } catch (err) {
      logger.error('Error getting file hash', err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }, [componentName, componentType]);

  /**
   * Refresh the hash and update state
   */
  const refreshHash = useCallback(async (): Promise<void> => {
    const hash = await getFileHash();
    if (isMountedRef.current && hash !== null) {
      setLastKnownHash(hash);
      currentHashRef.current = hash;
      setIsStale(false);
      // Mark as our write so next change detection doesn't trigger external modified
      isOurWriteRef.current = true;
    }
  }, [getFileHash]);

  /**
   * Acknowledge the external change and reset flags
   */
  const acknowledgeChange = useCallback((): void => {
    if (isMountedRef.current) {
      setExternallyModified(false);
      setIsStale(false);
    }
  }, []);

  /**
   * Handle file change events with debouncing
   */
  const handleFileChange = useCallback(
    (event: WatchEvent): void => {
      // Ignore non-modify events (type can be 'any', 'other', or an object with specific event kind)
      const eventType = event.type;
      const isModifyEvent =
        eventType === 'any' || (typeof eventType === 'object' && 'modify' in eventType);

      if (!isModifyEvent) {
        return;
      }

      logger.debug('File change detected', { event: event.type });

      // Clear existing debounce timer
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce the hash check
      debounceTimerRef.current = setTimeout(() => {
        void (async (): Promise<void> => {
          // Check mount status - can change during async operations
          if (!isMounted()) return;

          const newHash = await getFileHash();

          // Check mount status again after await
          if (!isMounted()) return;

          // Check if hash actually changed
          if (newHash !== null && newHash !== currentHashRef.current) {
            const previousHash = currentHashRef.current;
            currentHashRef.current = newHash;
            setLastKnownHash(newHash);
            setIsStale(true);

            // If we just wrote the file ourselves, this is expected
            if (isOurWriteRef.current) {
              isOurWriteRef.current = false;
              logger.debug('Hash changed from our write', { previousHash, newHash });
            } else {
              // External modification detected
              setExternallyModified(true);
              logger.info('External modification detected', { previousHash, newHash });
            }
          }
        })();
      }, HASH_DEBOUNCE_MS);
    },
    [getFileHash, isMounted]
  );

  /**
   * Start watching the file
   */
  useEffect(() => {
    if (!enabled || !componentName) {
      return;
    }

    // Track cancellation state - use getter to prevent TypeScript narrowing
    const state = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;

    const startWatching = async (): Promise<void> => {
      try {
        // Get the file path
        const pathResult = await invoke<FilePathResult>('canvas_get_component_path', {
          componentName,
          componentType,
        });

        if (isCancelled() || !isMounted()) return;

        if (!pathResult.success || !pathResult.path) {
          setError(pathResult.error ?? 'Failed to get component path');
          return;
        }

        const filePath = pathResult.path;

        // Get initial hash
        const initialHash = await getFileHash();

        // Check if we should abort after async operation
        if (isCancelled() || !isMounted()) return;

        if (initialHash) {
          setLastKnownHash(initialHash);
          currentHashRef.current = initialHash;
        }

        // Start watching
        const unwatch = await watch(filePath, handleFileChange, {
          recursive: false,
        });

        // Check again if we should abort after async operation
        if (isCancelled() || !isMounted()) {
          // Component unmounted during async operation
          unwatch();
          return;
        }

        unwatchRef.current = unwatch;
        setIsWatching(true);
        setError(null);

        logger.info('Started watching file', { filePath, initialHash });
      } catch (err) {
        if (isCancelled() || !isMounted()) return;

        const errMsg = err instanceof Error ? err.message : 'Failed to start file watcher';
        setError(errMsg);
        setIsWatching(false);
        logger.error(
          'Failed to start file watcher',
          err instanceof Error ? err : new Error(errMsg)
        );
      }
    };

    void startWatching();

    // Cleanup
    return () => {
      state.cancelled = true;

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (unwatchRef.current) {
        unwatchRef.current();
        logger.debug('Stopped watching file');
        unwatchRef.current = null;
      }

      setIsWatching(false);
    };
  }, [componentName, componentType, enabled, getFileHash, handleFileChange, isMounted]);

  // Track mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    isStale,
    externallyModified,
    lastKnownHash,
    acknowledgeChange,
    refreshHash,
    isWatching,
    error,
  };
}
