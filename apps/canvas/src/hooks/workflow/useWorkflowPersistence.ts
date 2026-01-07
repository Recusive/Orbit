/**
 * Workflow Persistence Hook
 * Handles save/load, snapshots, and export functionality via backend sync
 */

import { useCallback, useMemo } from 'react';

import { useWorkflowStore, selectSyncState } from '../../stores/workflowStore';
import { useBackendSync } from '../backend/useBackendSync';

import type { SyncState } from '../../stores/workflowStore';
import type {
  MarkdownCard,
  Workflow,
  WorkflowConnection,
  WorkflowSnapshot,
} from '../../types/workflowTypes';

// ============================================================================
// Export Types
// ============================================================================

export interface WorkflowExport {
  version: string;
  exportedAt: number;
  workflow: Workflow;
  cards: MarkdownCard[];
  connections: WorkflowConnection[];
}

export interface WorkflowImportResult {
  success: boolean;
  error?: string;
  workflow?: Workflow;
}

// ============================================================================
// Hook
// ============================================================================

interface UseWorkflowPersistenceReturn {
  // State
  activeWorkflow: Workflow | null;
  hasUnsavedChanges: boolean;
  snapshots: WorkflowSnapshot[];
  currentSnapshotId: string | null;
  syncState: SyncState;

  // Workflow operations
  createWorkflow: (name: string) => void;
  saveWorkflow: () => void;
  loadWorkflow: (workflowId: string) => void;
  deleteWorkflow: (workflowId: string) => void;
  listWorkflows: () => void;
  clearWorkflow: () => void;

  // Snapshot operations
  createSnapshot: (name: string) => void;
  restoreSnapshot: (snapshotId: string) => void;
  deleteSnapshot: (snapshotId: string) => void;

  // Export/Import operations
  exportToJSON: () => string;
  exportToFile: (filename?: string) => void;
  exportToBackend: (format: 'json' | 'markdown') => void;
  importFromJSON: (jsonString: string) => WorkflowImportResult;
  importFromFile: (file: File) => Promise<WorkflowImportResult>;
  importToBackend: (data: string) => void;

  // Markdown export
  exportToMarkdown: () => string;
}

export function useWorkflowPersistence(): UseWorkflowPersistenceReturn {
  const store = useWorkflowStore();
  const syncState = useWorkflowStore(selectSyncState);
  const backendSync = useBackendSync();

  // Get current user ID (mock for frontend-only)
  const userId = 'demo-user';

  // ================================================================
  // Derived State
  // ================================================================

  const hasUnsavedChanges = useMemo(() => {
    return syncState.isDirty;
  }, [syncState.isDirty]);

  const snapshots = useMemo(() => {
    return store.activeWorkflow?.snapshots ?? [];
  }, [store.activeWorkflow]);

  const currentSnapshotId = useMemo(() => {
    return store.activeWorkflow?.currentSnapshotId ?? null;
  }, [store.activeWorkflow]);

  // ================================================================
  // Workflow Operations
  // ================================================================

  const createWorkflow = useCallback(
    (name: string): void => {
      // Create locally first, then sync to backend
      store.createNewWorkflow(name, userId);
      // Backend sync will auto-save due to dirty state
    },
    [store, userId]
  );

  const saveWorkflow = useCallback((): void => {
    backendSync.saveWorkflow();
  }, [backendSync]);

  const loadWorkflow = useCallback(
    (workflowId: string): void => {
      backendSync.loadWorkflow(workflowId);
    },
    [backendSync]
  );

  const deleteWorkflow = useCallback(
    (workflowId: string): void => {
      backendSync.deleteWorkflow(workflowId);
    },
    [backendSync]
  );

  const listWorkflows = useCallback((): void => {
    backendSync.listWorkflows();
  }, [backendSync]);

  const clearWorkflow = useCallback((): void => {
    store.clearWorkflow();
  }, [store]);

  // ================================================================
  // Snapshot Operations
  // ================================================================

  const createSnapshot = useCallback(
    (name: string): void => {
      // Create locally first
      store.createSnapshot(name, userId);
      // Then sync to backend
      backendSync.createSnapshot(name);
    },
    [store, userId, backendSync]
  );

  const restoreSnapshot = useCallback(
    (snapshotId: string): void => {
      // Restore locally first
      store.restoreSnapshot(snapshotId);
      // Then notify backend
      backendSync.restoreSnapshot(snapshotId);
    },
    [store, backendSync]
  );

  const deleteSnapshot = useCallback(
    (snapshotId: string): void => {
      // Delete locally first
      store.deleteSnapshot(snapshotId);
      // Then notify backend
      backendSync.deleteSnapshot(snapshotId);
    },
    [store, backendSync]
  );

  // ================================================================
  // Export Operations (Local)
  // ================================================================

  const exportToJSON = useCallback((): string => {
    const { activeWorkflow } = store;
    if (activeWorkflow === null) {
      return JSON.stringify({ error: 'No active workflow' });
    }

    const exportData: WorkflowExport = {
      version: '1.0',
      exportedAt: Date.now(),
      workflow: activeWorkflow,
      cards: store.getCardsArray(),
      connections: store.getConnectionsArray(),
    };

    return JSON.stringify(exportData, null, 2);
  }, [store]);

  const exportToFile = useCallback(
    (filename?: string): void => {
      const json = exportToJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `workflow-${String(Date.now())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [exportToJSON]
  );

  const exportToBackend = useCallback(
    (format: 'json' | 'markdown'): void => {
      backendSync.exportWorkflow(format);
    },
    [backendSync]
  );

  const importFromJSON = useCallback(
    (jsonString: string): WorkflowImportResult => {
      try {
        const data = JSON.parse(jsonString) as unknown;

        // Validate structure
        if (typeof data !== 'object' || data === null) {
          return { success: false, error: 'Invalid JSON structure' };
        }

        const exportData = data as Partial<WorkflowExport>;

        if (exportData.workflow === undefined) {
          return { success: false, error: 'Missing workflow data' };
        }

        if (!Array.isArray(exportData.cards)) {
          return { success: false, error: 'Missing or invalid cards array' };
        }

        if (!Array.isArray(exportData.connections)) {
          return { success: false, error: 'Missing or invalid connections array' };
        }

        // Load the workflow
        store.loadWorkflow(exportData.workflow, exportData.cards, exportData.connections);

        return { success: true, workflow: exportData.workflow };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: `Failed to parse JSON: ${message}` };
      }
    },
    [store]
  );

  const importFromFile = useCallback(
    async (file: File): Promise<WorkflowImportResult> => {
      try {
        const text = await file.text();
        return importFromJSON(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: `Failed to read file: ${message}` };
      }
    },
    [importFromJSON]
  );

  const importToBackend = useCallback(
    (data: string): void => {
      backendSync.importWorkflow(data);
    },
    [backendSync]
  );

  // ================================================================
  // Markdown Export
  // ================================================================

  const exportToMarkdown = useCallback((): string => {
    const { activeWorkflow } = store;
    if (activeWorkflow === null) {
      return '# No Workflow';
    }

    const cards = store.getCardsArray();
    const connections = store.getConnectionsArray();

    const sections: string[] = [];

    // Header
    sections.push(`# ${activeWorkflow.name}`);
    sections.push('');

    if (activeWorkflow.description !== undefined && activeWorkflow.description.length > 0) {
      sections.push(activeWorkflow.description);
      sections.push('');
    }

    if (activeWorkflow.tags.length > 0) {
      sections.push(`**Tags:** ${activeWorkflow.tags.join(', ')}`);
      sections.push('');
    }

    sections.push('---');
    sections.push('');

    // Cards
    sections.push('## Cards');
    sections.push('');

    for (const card of cards) {
      sections.push(`### ${card.name}`);
      sections.push('');
      sections.push(`**Type:** ${card.type}`);
      if (card.tags.length > 0) {
        sections.push(`**Tags:** ${card.tags.join(', ')}`);
      }
      sections.push('');
      sections.push(card.content);
      sections.push('');
      sections.push('---');
      sections.push('');
    }

    // Connections
    if (connections.length > 0) {
      sections.push('## Connections');
      sections.push('');

      for (const connection of connections) {
        const sourceCard = cards.find((c) => c.id === connection.sourceCardId);
        const targetCard = cards.find((c) => c.id === connection.targetCardId);

        const sourceName = sourceCard?.name ?? connection.sourceCardId;
        const targetName = targetCard?.name ?? connection.targetCardId;
        const arrow = connection.direction === 'bidirectional' ? '<->' : '->';

        sections.push(`- **${sourceName}** ${arrow} **${targetName}**: ${connection.label}`);
        if (connection.description !== undefined && connection.description.length > 0) {
          sections.push(`  - ${connection.description}`);
        }
      }
      sections.push('');
    }

    // Metadata
    sections.push('---');
    sections.push('');
    sections.push(`*Exported on ${new Date().toISOString()}*`);

    return sections.join('\n');
  }, [store]);

  // ================================================================
  // Return
  // ================================================================

  return {
    activeWorkflow: store.activeWorkflow,
    hasUnsavedChanges,
    snapshots,
    currentSnapshotId,
    syncState,
    createWorkflow,
    saveWorkflow,
    loadWorkflow,
    deleteWorkflow,
    listWorkflows,
    clearWorkflow,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    exportToJSON,
    exportToFile,
    exportToBackend,
    importFromJSON,
    importFromFile,
    importToBackend,
    exportToMarkdown,
  };
}
