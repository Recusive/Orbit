/**
 * useCanvasPersistence - Hook for persisting canvas state across webview reloads
 *
 * Uses VS Code's webview state API (getState/setState) to persist:
 * - Nodes (positions, data, code)
 * - Edges (connections)
 * - Viewport (zoom, pan position)
 */

import { useCallback, useEffect, useRef } from 'react';

import type { CanvasMode } from '../types/canvasMode';
import type { Node, Edge, Viewport } from '@xyflow/react';

// State version for future migrations
const STATE_VERSION = 2;

// Debounce delay for saving state (ms)
const SAVE_DEBOUNCE_MS = 500;

export interface CanvasPersistedState {
  version: number;
  nodes: Node[];
  edges: Edge[];
  viewport?: Viewport;
  canvasMode?: CanvasMode;
  savedAt?: number;
}

interface UseCanvasPersistenceOptions {
  /** Called when state is loaded from persistence */
  onStateLoaded?: (state: CanvasPersistedState) => void;
}

interface UseCanvasPersistenceResult {
  /** Load persisted state (call on mount) */
  loadState: () => CanvasPersistedState | null;
  /** Save current state (debounced) */
  saveState: (nodes: Node[], edges: Edge[], viewport?: Viewport, canvasMode?: CanvasMode) => void;
  /** Clear persisted state */
  clearState: () => void;
  /** Force immediate save (bypasses debounce) */
  saveStateImmediate: (
    nodes: Node[],
    edges: Edge[],
    viewport?: Viewport,
    canvasMode?: CanvasMode
  ) => void;
}

/**
 * Hook for persisting canvas state using VS Code webview state API
 */
export function useCanvasPersistence(
  options?: UseCanvasPersistenceOptions
): UseCanvasPersistenceResult {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStateRef = useRef<CanvasPersistedState | null>(null);

  // Perform the actual save to VS Code state
  const performSave = useCallback((state: CanvasPersistedState): void => {
    if (window.vscode !== undefined) {
      window.vscode.setState(state);
    }
  }, []);

  // Save state immediately (bypasses debounce)
  const saveStateImmediate = useCallback(
    (nodes: Node[], edges: Edge[], viewport?: Viewport, canvasMode?: CanvasMode): void => {
      // Cancel any pending debounced save
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const state: CanvasPersistedState = {
        version: STATE_VERSION,
        nodes,
        edges,
        ...(viewport !== undefined ? { viewport } : {}),
        ...(canvasMode !== undefined ? { canvasMode } : {}),
        savedAt: Date.now(),
      };

      performSave(state);
    },
    [performSave]
  );

  // Save state with debounce to avoid excessive saves
  const saveState = useCallback(
    (nodes: Node[], edges: Edge[], viewport?: Viewport, canvasMode?: CanvasMode): void => {
      const state: CanvasPersistedState = {
        version: STATE_VERSION,
        nodes,
        edges,
        ...(viewport !== undefined ? { viewport } : {}),
        ...(canvasMode !== undefined ? { canvasMode } : {}),
        savedAt: Date.now(),
      };

      // Store pending state
      pendingStateRef.current = state;

      // Clear existing timeout
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Schedule debounced save
      saveTimeoutRef.current = setTimeout(() => {
        if (pendingStateRef.current !== null) {
          performSave(pendingStateRef.current);
          pendingStateRef.current = null;
        }
        saveTimeoutRef.current = null;
      }, SAVE_DEBOUNCE_MS);
    },
    [performSave]
  );

  // Load state from VS Code state API
  const loadState = useCallback((): CanvasPersistedState | null => {
    if (!window.vscode) {
      return null;
    }

    const state = window.vscode.getState() as CanvasPersistedState | undefined;

    if (!state) {
      return null;
    }

    // Validate state structure
    if (typeof state.version !== 'number' || !Array.isArray(state.nodes)) {
      return null;
    }

    // Handle version migrations
    if (state.version < STATE_VERSION) {
      // Migration: 'code' mode was removed, map to 'design'
      if (state.canvasMode === ('code' as CanvasMode)) {
        state.canvasMode = 'design';
      }
      state.version = STATE_VERSION;
    }

    options?.onStateLoaded?.(state);
    return state;
  }, [options]);

  // Clear persisted state
  const clearState = useCallback((): void => {
    if (window.vscode !== undefined) {
      window.vscode.setState(undefined);
    }
  }, []);

  // Cleanup on unmount - save any pending state
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Save any pending state on unmount
      if (pendingStateRef.current !== null) {
        performSave(pendingStateRef.current);
      }
    };
  }, [performSave]);

  return {
    loadState,
    saveState,
    saveStateImmediate,
    clearState,
  };
}
