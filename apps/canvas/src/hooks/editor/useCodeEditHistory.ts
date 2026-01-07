/**
 * useCodeEditHistory - Undo/redo history for code and class changes
 *
 * Tracks changes to node code, allowing users to undo/redo edits
 * made through the ElementPropertiesPanel.
 */
import { useCallback, useRef, useState } from 'react';

interface CodeEdit {
  nodeId: string;
  previousCode: string;
  newCode: string;
  description: string;
  timestamp: number;
}

interface UseCodeEditHistoryOptions {
  maxHistorySize?: number;
}

interface UseCodeEditHistoryReturn {
  /** Record a code change for undo support */
  recordEdit: (nodeId: string, previousCode: string, newCode: string, description?: string) => void;
  /** Undo the last edit, returns { nodeId, code } to apply */
  undo: () => { nodeId: string; code: string } | null;
  /** Redo the last undone edit, returns { nodeId, code } to apply */
  redo: () => { nodeId: string; code: string } | null;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Clear all history */
  clearHistory: () => void;
  /** Get undo description for UI */
  undoDescription: string | null;
  /** Get redo description for UI */
  redoDescription: string | null;
}

const DEFAULT_MAX_HISTORY = 50;

export function useCodeEditHistory(
  options: UseCodeEditHistoryOptions = {}
): UseCodeEditHistoryReturn {
  const { maxHistorySize = DEFAULT_MAX_HISTORY } = options;

  // History stacks
  const [past, setPast] = useState<CodeEdit[]>([]);
  const [future, setFuture] = useState<CodeEdit[]>([]);

  // Debounce tracking to merge rapid edits
  const lastEditRef = useRef<{ nodeId: string; timestamp: number } | null>(null);
  const MERGE_THRESHOLD_MS = 500;

  const recordEdit = useCallback(
    (nodeId: string, previousCode: string, newCode: string, description?: string): void => {
      const desc = description ?? 'Edit code';
      if (previousCode === newCode) return;

      const now = Date.now();
      const lastEdit = lastEditRef.current;

      // Check if we should merge with the last edit
      const shouldMerge =
        lastEdit !== null &&
        lastEdit.nodeId === nodeId &&
        now - lastEdit.timestamp < MERGE_THRESHOLD_MS;

      setPast((prevPast) => {
        if (shouldMerge && prevPast.length > 0) {
          // Merge: update the last edit's newCode instead of adding new entry
          const updated = [...prevPast];
          const lastEntry = updated[updated.length - 1];
          if (lastEntry !== undefined) {
            updated[updated.length - 1] = {
              ...lastEntry,
              newCode,
              timestamp: now,
            };
          }
          return updated;
        }

        // Add new edit to history
        const newEdit: CodeEdit = {
          nodeId,
          previousCode,
          newCode,
          description: desc,
          timestamp: now,
        };

        const newPast = [...prevPast, newEdit];
        // Trim history if it exceeds max size
        if (newPast.length > maxHistorySize) {
          return newPast.slice(-maxHistorySize);
        }
        return newPast;
      });

      // Clear redo stack on new edit
      setFuture([]);

      // Update last edit tracking
      lastEditRef.current = { nodeId, timestamp: now };
    },
    [maxHistorySize]
  );

  const undo = useCallback((): { nodeId: string; code: string } | null => {
    if (past.length === 0) return null;

    const lastEdit = past[past.length - 1];
    if (lastEdit === undefined) return null;

    // Move to future stack
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [lastEdit, ...prev]);

    // Clear merge tracking
    lastEditRef.current = null;

    return { nodeId: lastEdit.nodeId, code: lastEdit.previousCode };
  }, [past]);

  const redo = useCallback((): { nodeId: string; code: string } | null => {
    if (future.length === 0) return null;

    const nextEdit = future[0];
    if (nextEdit === undefined) return null;

    // Move back to past stack
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, nextEdit]);

    // Clear merge tracking
    lastEditRef.current = null;

    return { nodeId: nextEdit.nodeId, code: nextEdit.newCode };
  }, [future]);

  const clearHistory = useCallback((): void => {
    setPast([]);
    setFuture([]);
    lastEditRef.current = null;
  }, []);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const undoDescription = past.length > 0 ? (past[past.length - 1]?.description ?? null) : null;
  const redoDescription = future.length > 0 ? (future[0]?.description ?? null) : null;

  return {
    recordEdit,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    undoDescription,
    redoDescription,
  };
}
