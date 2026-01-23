/**
 * Style Persistence Hook
 *
 * Handles persisting CSS changes to component source files via Rust backend.
 *
 * State Machine:
 * ```
 * idle → validating → transforming → waiting_hmr → success → idle
 *          ↓              ↓               ↓
 *        error          error           error
 * ```
 *
 * Features:
 * - Mutex to prevent concurrent persist operations
 * - Rust-based Tailwind class transformation (avoids browser Babel issues)
 * - Automatic backup creation before writes
 * - HMR event listening for Vite hot reload detection
 * - Undo support via backup restoration
 */

import { cssToTailwind } from '@canvas/lib/tailwind';
import { useCSSCustomizationStore } from '@canvas/stores/css-customization-store';
import { createLogger } from '@orbit/common/lib';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Style change sent to Rust backend
 */
interface StyleChange {
  /** CSS property name (camelCase) */
  property: string;
  /** CSS value */
  value: string;
  /** Tailwind class to add/replace */
  tailwindClass: string;
}

/**
 * Result from Rust transform command
 */
interface TransformResult {
  /** Whether transformation succeeded */
  success: boolean;
  /** Transformed source code (only if success=true) */
  code: string | null;
  /** Classes that were added */
  addedClasses: string[];
  /** Classes that were removed */
  removedClasses: string[];
  /** Non-fatal warnings */
  warnings: string[];
  /** Error message (only if success=false) */
  error: string | null;
}
import type { UndoEntry } from '@canvas/stores/css-customization-store';

// ============================================
// Logger
// ============================================

const logger = createLogger('useStylePersistence');

// ============================================
// Types
// ============================================

/**
 * Persistence state machine states
 *
 * For style persistence: validating → transforming → waiting_hmr → success
 * (The Rust backend handles reading, transforming, and writing atomically)
 *
 * For backup restoration: transforming → success
 * For design token updates: reading → transforming → writing → success
 */
export type PersistState =
  | 'idle'
  | 'validating'
  | 'reading'
  | 'transforming'
  | 'writing'
  | 'waiting_hmr'
  | 'success'
  | 'error';

/**
 * Result types from Tauri commands
 */
interface FileReadResult {
  success: boolean;
  content: string | null;
  error: string | null;
}

interface FileWriteResult {
  success: boolean;
  backupPath: string | null;
  error: string | null;
}

/**
 * Return type for the hook
 */
export interface UseStylePersistenceReturn {
  /** Whether a persist operation is currently in progress */
  isPersisting: boolean;
  /** Current state in the persistence state machine */
  persistState: PersistState;
  /** Result of the last transform operation */
  lastResult: TransformResult | null;
  /** Error message if persistence failed */
  error: string | null;
  /** Whether HMR failed after file write */
  hmrFailed: boolean;
  /** Persist current CSS overrides to component source */
  persistStyles: (componentName: string, componentType: 'ui' | 'custom') => Promise<boolean>;
  /** Restore component from its most recent backup */
  restoreBackup: (componentName: string, componentType: 'ui' | 'custom') => Promise<boolean>;
  /** Update a design token in globals.css */
  updateDesignToken: (tokenName: string, newValue: string) => Promise<boolean>;
}

// ============================================
// Constants
// ============================================

/** Timeout for HMR to complete (ms) */
const HMR_TIMEOUT_MS = 5000;

/** Timeout for state reset after success (ms) */
const SUCCESS_RESET_DELAY_MS = 2000;

// ============================================
// CSS to StyleChange Mapper
// ============================================

/**
 * Convert CSS overrides to StyleChange array for AST transformation
 */
function mapOverridesToStyleChanges(overrides: Record<string, string>): StyleChange[] {
  const changes: StyleChange[] = [];

  for (const [property, value] of Object.entries(overrides)) {
    const tailwindResult = cssToTailwind(property, value);
    if (tailwindResult) {
      changes.push({
        property,
        value,
        tailwindClass: tailwindResult.tailwindClass,
      });
    } else {
      logger.warn('Could not map CSS property to Tailwind', { property, value });
    }
  }

  return changes;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for persisting CSS style changes to component source files.
 *
 * @example
 * ```tsx
 * const { isPersisting, persistStyles, error } = useStylePersistence();
 *
 * const handleSave = async () => {
 *   const success = await persistStyles('button', 'ui');
 *   if (success) {
 *     toast.success('Styles saved!');
 *   }
 * };
 * ```
 */
export function useStylePersistence(): UseStylePersistenceReturn {
  // State
  const [persistState, setPersistState] = useState<PersistState>('idle');
  const [lastResult, setLastResult] = useState<TransformResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hmrFailed, setHmrFailed] = useState(false);

  // Refs
  const isMutexLocked = useRef(false);
  const isMountedRef = useRef(true);
  const hmrTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store actions
  const getOverrides = useCSSCustomizationStore((s) => s.getOverrides);
  const markPropertiesPersisted = useCSSCustomizationStore((s) => s.markPropertiesPersisted);
  const pushUndo = useCSSCustomizationStore((s) => s.pushUndo);

  // Derived state
  const isPersisting =
    persistState !== 'idle' && persistState !== 'success' && persistState !== 'error';

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (hmrTimeoutRef.current) clearTimeout(hmrTimeoutRef.current);
      if (successResetRef.current) clearTimeout(successResetRef.current);
    };
  }, []);

  /**
   * Reset state to idle (checks mount status)
   */
  const resetState = useCallback(() => {
    if (!isMountedRef.current) return;
    setPersistState('idle');
    setError(null);
    setHmrFailed(false);
    setLastResult(null);
  }, []);

  /**
   * Persist current CSS overrides to component source file
   *
   * Uses the Rust backend to:
   * 1. Read the component source
   * 2. Transform Tailwind classes via regex
   * 3. Create a backup
   * 4. Write the modified source atomically
   */
  const persistStyles = useCallback(
    async (componentName: string, componentType: 'ui' | 'custom'): Promise<boolean> => {
      // Mutex check - prevent concurrent persist operations
      if (isMutexLocked.current) {
        logger.warn('Persist operation already in progress');
        return false;
      }

      // Acquire mutex
      isMutexLocked.current = true;

      try {
        // Reset previous state (with mount check)
        if (isMountedRef.current) {
          setError(null);
          setHmrFailed(false);
          setLastResult(null);
        }

        // =========================================================
        // Step 1: Validating - Check we have overrides to persist
        // =========================================================
        if (isMountedRef.current) setPersistState('validating');

        const overrides = getOverrides();
        const overrideKeys = Object.keys(overrides);

        if (overrideKeys.length === 0) {
          logger.info('No overrides to persist');
          if (isMountedRef.current) setPersistState('idle');
          return true; // Not an error, just nothing to do
        }

        // Convert CSS overrides to style changes
        const styleChanges = mapOverridesToStyleChanges(overrides);

        if (styleChanges.length === 0) {
          if (isMountedRef.current) {
            setError('Could not convert CSS properties to Tailwind classes');
            setPersistState('error');
          }
          return false;
        }

        logger.debug('Style changes prepared', {
          count: styleChanges.length,
          changes: styleChanges,
        });

        // =========================================================
        // Step 2: Transforming - Call Rust backend to transform and write
        // =========================================================
        if (isMountedRef.current) setPersistState('transforming');

        // Call the Rust backend which handles read, transform, backup, and write atomically
        const transformResult = await invoke<TransformResult>('canvas_persist_styles', {
          componentName,
          componentType,
          changes: styleChanges,
          testMode: false,
        });

        if (isMountedRef.current) setLastResult(transformResult);

        if (!transformResult.success) {
          const errMsg = transformResult.error ?? 'Transformation failed';
          if (isMountedRef.current) {
            setError(errMsg);
            setPersistState('error');
          }
          logger.error('Transform failed', new Error(errMsg));
          return false;
        }

        // Log any warnings
        if (transformResult.warnings.length > 0) {
          for (const warning of transformResult.warnings) {
            logger.warn('Transform warning', { warning });
          }
        }

        logger.debug('Transform complete', {
          addedClasses: transformResult.addedClasses,
          removedClasses: transformResult.removedClasses,
        });

        // Push undo entry (we don't have originalContent anymore, but we can track the changes)
        const undoEntry: UndoEntry = {
          componentName,
          componentType,
          previousContent: '', // Rust backend handles restoration via backups
          changes: styleChanges,
          timestamp: Date.now(),
          backupPath: '', // Backup is created by Rust backend
        };
        pushUndo(undoEntry);

        // =========================================================
        // Step 3: Waiting for HMR - Listen for Vite hot reload
        // =========================================================
        if (isMountedRef.current) setPersistState('waiting_hmr');

        // Set up HMR event listeners
        const hmrPromise = new Promise<boolean>((resolve) => {
          // Success listener - Vite completed hot update
          const handleHmrSuccess = (): void => {
            cleanup();
            resolve(true);
          };

          // Error listener - Vite HMR failed
          const handleHmrError = (event: CustomEvent): void => {
            cleanup();
            logger.warn('HMR error detected', { detail: event.detail });
            if (isMountedRef.current) setHmrFailed(true);
            resolve(false);
          };

          // Cleanup function
          const cleanup = (): void => {
            if (hmrTimeoutRef.current) {
              clearTimeout(hmrTimeoutRef.current);
              hmrTimeoutRef.current = null;
            }
            window.removeEventListener('vite:afterUpdate', handleHmrSuccess);
            window.removeEventListener('vite:error', handleHmrError as EventListener);
          };

          // Listen for Vite HMR events
          window.addEventListener('vite:afterUpdate', handleHmrSuccess);
          window.addEventListener('vite:error', handleHmrError as EventListener);

          // Timeout - assume success if no error within timeout
          hmrTimeoutRef.current = setTimeout(() => {
            cleanup();
            logger.debug('HMR timeout reached, assuming success');
            resolve(true);
          }, HMR_TIMEOUT_MS);
        });

        const hmrSuccess = await hmrPromise;

        if (!hmrSuccess) {
          // HMR failed but file was written - not a fatal error
          logger.warn('HMR failed but file was saved');
        }

        // =========================================================
        // Step 4: Success - Mark properties as persisted
        // =========================================================
        if (isMountedRef.current) setPersistState('success');

        // Mark the persisted properties in the store
        markPropertiesPersisted(overrideKeys);

        logger.info('Styles persisted successfully', {
          componentName,
          componentType,
          propertiesPersisted: overrideKeys,
        });

        // Reset to idle after delay
        successResetRef.current = setTimeout(() => {
          resetState();
        }, SUCCESS_RESET_DELAY_MS);

        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error during persistence';
        if (isMountedRef.current) {
          setError(errMsg);
          setPersistState('error');
        }
        logger.error('Persistence error', err instanceof Error ? err : new Error(errMsg));
        return false;
      } finally {
        // Release mutex
        isMutexLocked.current = false;
      }
    },
    [getOverrides, markPropertiesPersisted, pushUndo, resetState]
  );

  /**
   * Restore component from its most recent backup
   */
  const restoreBackup = useCallback(
    async (componentName: string, componentType: 'ui' | 'custom'): Promise<boolean> => {
      // Mutex check
      if (isMutexLocked.current) {
        logger.warn('Operation already in progress');
        return false;
      }

      isMutexLocked.current = true;

      try {
        if (isMountedRef.current) {
          setError(null);
          setPersistState('writing');
        }

        const result = await invoke<FileWriteResult>('canvas_restore_backup', {
          componentName,
          componentType,
          testMode: false,
        });

        if (!result.success) {
          const errMsg = result.error ?? 'Failed to restore backup';
          if (isMountedRef.current) {
            setError(errMsg);
            setPersistState('error');
          }
          logger.error('Backup restoration failed', new Error(errMsg));
          return false;
        }

        logger.info('Backup restored', { componentName, restoredFrom: result.backupPath });

        if (isMountedRef.current) {
          setPersistState('success');
        }

        // Reset to idle after delay
        successResetRef.current = setTimeout(() => {
          resetState();
        }, SUCCESS_RESET_DELAY_MS);

        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error during restoration';
        if (isMountedRef.current) {
          setError(errMsg);
          setPersistState('error');
        }
        logger.error('Restoration error', err instanceof Error ? err : new Error(errMsg));
        return false;
      } finally {
        isMutexLocked.current = false;
      }
    },
    [resetState]
  );

  /**
   * Update a design token in globals.css
   *
   * Reads globals.css, replaces the token value, and writes back with backup.
   *
   * @param tokenName - Name of the token (e.g., 'primary', 'background')
   * @param newValue - New color value (e.g., '#ff0000', 'oklch(0.5 0.2 30)')
   * @returns Whether the update succeeded
   */
  const updateDesignToken = useCallback(
    async (tokenName: string, newValue: string): Promise<boolean> => {
      // Mutex check
      if (isMutexLocked.current) {
        logger.warn('Operation already in progress');
        return false;
      }

      isMutexLocked.current = true;

      try {
        if (isMountedRef.current) {
          setError(null);
          setPersistState('reading');
        }

        // Get globals.css path
        const globalsPath = await invoke<string>('canvas_get_globals_path');
        if (!globalsPath) {
          throw new Error('Could not determine globals.css path');
        }

        // Read current content
        const readResult = await invoke<FileReadResult>('canvas_read_file', {
          path: globalsPath,
        });

        if (!readResult.success || !readResult.content) {
          throw new Error(readResult.error ?? 'Failed to read globals.css');
        }

        if (isMountedRef.current) {
          setPersistState('transforming');
        }

        // Replace the token value using regex
        // Matches both light and dark mode declarations:
        // --primary: oklch(0.56 0.18 25);
        // --primary: #ff0000;
        const tokenPattern = new RegExp(`(--${tokenName}\\s*:\\s*)([^;]+)(;)`, 'g');

        const originalContent = readResult.content;
        let replacementCount = 0;

        const newContent = originalContent.replace(
          tokenPattern,
          (_match: string, prefix: string, _oldValue: string, suffix: string) => {
            replacementCount++;
            return `${prefix}${newValue}${suffix}`;
          }
        );

        if (replacementCount === 0) {
          throw new Error(`Token --${tokenName} not found in globals.css`);
        }

        logger.debug('Token replacement', { tokenName, replacementCount, newValue });

        if (isMountedRef.current) {
          setPersistState('writing');
        }

        // Write back with backup
        const writeResult = await invoke<FileWriteResult>('canvas_write_file', {
          path: globalsPath,
          content: newContent,
          shouldBackup: true,
        });

        if (!writeResult.success) {
          throw new Error(writeResult.error ?? 'Failed to write globals.css');
        }

        logger.info('Design token updated', {
          tokenName,
          newValue,
          replacementCount,
          backupPath: writeResult.backupPath,
        });

        if (isMountedRef.current) {
          setPersistState('success');
        }

        // Reset to idle after delay
        successResetRef.current = setTimeout(() => {
          resetState();
        }, SUCCESS_RESET_DELAY_MS);

        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error updating design token';
        if (isMountedRef.current) {
          setError(errMsg);
          setPersistState('error');
        }
        logger.error('Design token update error', err instanceof Error ? err : new Error(errMsg));
        return false;
      } finally {
        isMutexLocked.current = false;
      }
    },
    [resetState]
  );

  return {
    isPersisting,
    persistState,
    lastResult,
    error,
    hmrFailed,
    persistStyles,
    restoreBackup,
    updateDesignToken,
  };
}
