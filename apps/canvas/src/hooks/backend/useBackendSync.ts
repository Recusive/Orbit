/**
 * Backend Sync Hook
 * Handles communication with the Orbit backend via postMessage
 * and implements debounced auto-save functionality
 */

import { useCallback, useEffect, useRef } from 'react';

import { useWorkflowStore, selectSyncState } from '../../stores/workflowStore';

import type {
  FileConflict,
  FileSyncMode,
  MarkdownCard,
  SharedCardMetadata,
  Workflow,
  WorkflowConnection,
  WorkflowMetadata,
  WorkflowSnapshot,
} from '../../types/workflowTypes';

// ============================================================================
// Types
// ============================================================================

interface WorkflowData {
  workflow: Workflow;
  cards: MarkdownCard[];
  connections: WorkflowConnection[];
}

interface BackendPayload {
  success?: boolean;
  message?: string;
  workflowId?: string;
  cardId?: string;
  connectionId?: string;
  snapshotId?: string;
  content?: string;
  format?: 'json' | 'markdown';
}

interface BackendMessage {
  type: string;
  payload?:
    | Workflow
    | MarkdownCard
    | WorkflowConnection
    | WorkflowSnapshot
    | BackendPayload
    | {
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
      }[];
}

/**
 * Backend workflow payload - differs from frontend Workflow type
 * Backend sends cards/connections as objects, frontend expects cardIds/connectionIds arrays
 */
interface BackendWorkflowPayload {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  cards?: Record<string, MarkdownCard>;
  connections?: Record<string, WorkflowConnection>;
  cardIds?: string[];
  connectionIds?: string[];
  snapshots: WorkflowSnapshot[];
  currentSnapshotId: string | null;
  owner: string;
  visibility: 'private' | 'team' | 'public';
  collaborators: { userId: string; role: 'viewer' | 'editor' | 'admin'; addedAt: number }[];
  linkedWorkflowIds: string[];
  isTemplate: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Normalize a workflow from the backend to the frontend Workflow type.
 * Backend may send cards/connections as objects; we need cardIds/connectionIds arrays.
 */
function normalizeWorkflow(payload: BackendWorkflowPayload): {
  workflow: Workflow;
  cards: MarkdownCard[];
  connections: WorkflowConnection[];
} {
  // Debug logging for workflow normalization
  if (process.env.NODE_ENV === 'development') {
    console.warn('[WorkflowSync] normalizeWorkflow input:', {
      id: payload.id,
      name: payload.name,
      hasCards: payload.cards !== undefined,
      cardsCount: payload.cards !== undefined ? Object.keys(payload.cards).length : 0,
      cardIdsFromPayload: payload.cardIds,
      hasConnections: payload.connections !== undefined,
      connectionsCount:
        payload.connections !== undefined ? Object.keys(payload.connections).length : 0,
    });
  }

  // Extract cards from the payload
  const cardsObj = payload.cards ?? {};
  const cards = Object.values(cardsObj);
  const cardIds = payload.cardIds ?? Object.keys(cardsObj);

  // Extract connections from the payload
  const connectionsObj = payload.connections ?? {};
  const connections = Object.values(connectionsObj);
  const connectionIds = payload.connectionIds ?? Object.keys(connectionsObj);

  // Build the normalized workflow
  const workflow: Workflow = {
    id: payload.id,
    name: payload.name,
    tags: payload.tags,
    cardIds,
    connectionIds,
    snapshots: payload.snapshots,
    currentSnapshotId: payload.currentSnapshotId,
    owner: payload.owner,
    visibility: payload.visibility,
    collaborators: payload.collaborators,
    linkedWorkflowIds: payload.linkedWorkflowIds,
    isTemplate: payload.isTemplate,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };

  // Only add description if it exists
  if (payload.description !== undefined) {
    workflow.description = payload.description;
  }

  return { workflow, cards, connections };
}

// ============================================================================
// Constants
// ============================================================================

const SAVE_DEBOUNCE_MS = 2000;

// ============================================================================
// VS Code API Access
// ============================================================================

function postMessage(message: unknown): void {
  if (window.vscode !== undefined) {
    window.vscode.postMessage(message);
  }
}

// ============================================================================
// Hook
// ============================================================================

interface UseBackendSyncReturn {
  // Manual operations
  saveWorkflow: () => void;
  loadWorkflow: (workflowId: string) => void;
  createWorkflow: (name: string) => void;
  deleteWorkflow: (workflowId: string) => void;
  listWorkflows: () => void;

  // Snapshot operations
  createSnapshot: (name: string, description?: string) => void;
  restoreSnapshot: (snapshotId: string) => void;
  deleteSnapshot: (snapshotId: string) => void;

  // Export/Import
  exportWorkflow: (format: 'json' | 'markdown') => void;
  importWorkflow: (data: string) => void;

  // Shared Card Library
  listSharedCards: () => void;
  promoteCardToLibrary: (cardId: string) => void;
  copySharedCardToWorkflow: (cardId: string) => void;
  searchSharedCards: (query: string) => void;

  // File Sync Operations
  linkFile: (cardId: string, filePath: string, syncMode?: FileSyncMode) => void;
  unlinkFile: (cardId: string) => void;
  syncFile: (cardId: string) => void;
  resolveConflict: (cardId: string, resolution: 'keep-card' | 'keep-file' | 'merge') => void;

  // File Browser
  browseFile: () => Promise<string | undefined>;
}

export function useBackendSync(): UseBackendSyncReturn {
  const syncState = useWorkflowStore(selectSyncState);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<boolean>(false);
  // Ref to hold the resolver for the file browse promise
  const browseFileResolverRef = useRef<((path: string | undefined) => void) | null>(null);

  // Get stable references to store actions (these don't change)
  const activeWorkflow = useWorkflowStore((state) => state.activeWorkflow);

  // ================================================================
  // Build workflow data for saving
  // ================================================================

  const buildWorkflowData = useCallback((): WorkflowData | null => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) {
      console.warn('[WorkflowSync] buildWorkflowData: No active workflow');
      return null;
    }

    const cards = state.getCardsArray();
    const connections = state.getConnectionsArray();

    // Debug logging for workflow data building
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WorkflowSync] buildWorkflowData:', {
        workflowId: state.activeWorkflow.id,
        workflowName: state.activeWorkflow.name,
        cardIds: state.activeWorkflow.cardIds,
        actualCards: cards.map((c) => ({ id: c.id, name: c.name })),
        cardIdCount: state.activeWorkflow.cardIds.length,
        actualCardCount: cards.length,
        connectionIds: state.activeWorkflow.connectionIds,
        actualConnectionCount: connections.length,
      });
    }

    return {
      workflow: state.activeWorkflow,
      cards,
      connections,
    };
  }, []);

  // ================================================================
  // Save to backend
  // ================================================================

  const performSave = useCallback((): void => {
    // Debug logging for save operation
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WorkflowSync] performSave: Starting save...');
    }

    const data = buildWorkflowData();
    if (data === null) {
      console.warn('[WorkflowSync] performSave: No data to save');
      return;
    }

    useWorkflowStore.getState().setSyncStatus('saving');
    pendingSaveRef.current = false;

    // Convert cards array to Record<id, card> for backend
    const cardsObj: Record<string, MarkdownCard> = {};
    for (const card of data.cards) {
      cardsObj[card.id] = card;
    }

    // Convert connections array to Record<id, connection> for backend
    const connectionsObj: Record<string, WorkflowConnection> = {};
    for (const conn of data.connections) {
      connectionsObj[conn.id] = conn;
    }

    // Validate cardIds match actual cards - warn if mismatch
    const missingCards = data.workflow.cardIds.filter((id) => cardsObj[id] === undefined);
    if (missingCards.length > 0) {
      console.error('[WorkflowSync] performSave: MISMATCH! Missing cards:', {
        missingCardIds: missingCards,
        workflowCardIds: data.workflow.cardIds,
        actualCardIds: Object.keys(cardsObj),
      });
    }

    // Build workflow object with embedded cards and connections objects
    // Backend expects cards/connections as Record objects, not arrays
    const workflowToSave = {
      ...data.workflow,
      cards: cardsObj,
      connections: connectionsObj,
    };

    // Debug logging for backend save
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WorkflowSync] performSave: Sending to backend:', {
        workflowId: workflowToSave.id,
        workflowName: workflowToSave.name,
        cardCount: Object.keys(cardsObj).length,
        connectionCount: Object.keys(connectionsObj).length,
        cardIds: workflowToSave.cardIds,
        savedCardIds: Object.keys(cardsObj),
      });
    }

    postMessage({
      type: 'workflow:save',
      data: workflowToSave,
    });
  }, [buildWorkflowData]);

  const saveWorkflow = useCallback((): void => {
    // Clear any pending debounced save
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    performSave();
  }, [performSave]);

  // ================================================================
  // Debounced auto-save
  // ================================================================

  const scheduleSave = useCallback((): void => {
    // Don't schedule if already saving
    if (syncState.status === 'saving') {
      pendingSaveRef.current = true;
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule new save
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      performSave();
    }, SAVE_DEBOUNCE_MS);
  }, [syncState.status, performSave]);

  // Watch for dirty state changes and trigger auto-save
  useEffect(() => {
    if (syncState.isDirty && activeWorkflow !== null) {
      scheduleSave();
    }
  }, [syncState.isDirty, activeWorkflow, scheduleSave]);

  // ================================================================
  // Load from backend
  // ================================================================

  const loadWorkflow = useCallback((workflowId: string): void => {
    useWorkflowStore.getState().setSyncStatus('loading');
    postMessage({
      type: 'workflow:load',
      data: { workflowId },
    });
  }, []);

  const createWorkflow = useCallback((name: string): void => {
    useWorkflowStore.getState().setSyncStatus('loading');
    postMessage({
      type: 'workflow:create',
      data: { name },
    });
  }, []);

  const deleteWorkflow = useCallback((workflowId: string): void => {
    postMessage({
      type: 'workflow:delete',
      data: { workflowId },
    });
  }, []);

  const listWorkflows = useCallback((): void => {
    useWorkflowStore.getState().setWorkflowListLoading(true);
    postMessage({
      type: 'workflow:list',
    });
  }, []);

  const getLastOpenedWorkflowId = useCallback((): void => {
    postMessage({
      type: 'workflow:get-last-opened',
    });
  }, []);

  // ================================================================
  // Snapshot operations
  // ================================================================

  const createSnapshot = useCallback((name: string, description?: string): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    postMessage({
      type: 'workflow:create-snapshot',
      data: { workflowId: state.activeWorkflow.id, name, description },
    });
  }, []);

  const restoreSnapshot = useCallback((snapshotId: string): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    state.setSyncStatus('loading');
    postMessage({
      type: 'workflow:restore-snapshot',
      data: { workflowId: state.activeWorkflow.id, snapshotId },
    });
  }, []);

  const deleteSnapshot = useCallback((snapshotId: string): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    postMessage({
      type: 'workflow:delete-snapshot',
      data: { workflowId: state.activeWorkflow.id, snapshotId },
    });
  }, []);

  // ================================================================
  // Export/Import
  // ================================================================

  const exportWorkflow = useCallback((format: 'json' | 'markdown'): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    postMessage({
      type: 'workflow:export',
      data: { workflowId: state.activeWorkflow.id, format },
    });
  }, []);

  const importWorkflow = useCallback((importData: string): void => {
    useWorkflowStore.getState().setSyncStatus('loading');
    postMessage({
      type: 'workflow:import',
      data: { data: importData },
    });
  }, []);

  // ================================================================
  // Shared Card Library Operations
  // ================================================================

  const listSharedCards = useCallback((): void => {
    postMessage({
      type: 'workflow:list-shared-cards',
    });
  }, []);

  const promoteCardToLibrary = useCallback((cardId: string): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    postMessage({
      type: 'workflow:promote-card',
      data: { workflowId: state.activeWorkflow.id, cardId },
    });
  }, []);

  const copySharedCardToWorkflow = useCallback((cardId: string): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    postMessage({
      type: 'workflow:copy-shared-card',
      data: { cardId, workflowId: state.activeWorkflow.id },
    });
  }, []);

  const searchSharedCards = useCallback((query: string): void => {
    postMessage({
      type: 'workflow:search-shared-cards',
      data: { query },
    });
  }, []);

  // ================================================================
  // File Sync Operations
  // ================================================================

  const linkFile = useCallback(
    (cardId: string, filePath: string, syncMode?: FileSyncMode): void => {
      const state = useWorkflowStore.getState();
      if (state.activeWorkflow === null) return;

      const mode = syncMode ?? 'bidirectional';
      postMessage({
        type: 'workflow:link-file',
        data: {
          workflowId: state.activeWorkflow.id,
          cardId,
          filePath,
          syncMode: mode,
        },
      });
    },
    []
  );

  const unlinkFile = useCallback((cardId: string): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    postMessage({
      type: 'workflow:unlink-file',
      data: {
        workflowId: state.activeWorkflow.id,
        cardId,
      },
    });
  }, []);

  const syncFile = useCallback((cardId: string): void => {
    const state = useWorkflowStore.getState();
    if (state.activeWorkflow === null) return;

    postMessage({
      type: 'workflow:sync-file',
      data: {
        workflowId: state.activeWorkflow.id,
        cardId,
      },
    });
  }, []);

  const resolveConflict = useCallback(
    (cardId: string, resolution: 'keep-card' | 'keep-file' | 'merge'): void => {
      const state = useWorkflowStore.getState();
      if (state.activeWorkflow === null) return;

      postMessage({
        type: 'workflow:resolve-conflict',
        data: {
          workflowId: state.activeWorkflow.id,
          cardId,
          resolution,
        },
      });
    },
    []
  );

  // ================================================================
  // File Browser
  // ================================================================

  const browseFile = useCallback((): Promise<string | undefined> => {
    return new Promise((resolve) => {
      // Store the resolver so the message handler can call it
      browseFileResolverRef.current = resolve;

      // Request file dialog from backend
      postMessage({
        type: 'workflow:browse-file',
        data: {
          filters: [
            { name: 'Markdown', extensions: ['md', 'markdown'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        },
      });

      // Timeout after 60 seconds (user might take a while to select)
      setTimeout(() => {
        if (browseFileResolverRef.current === resolve) {
          browseFileResolverRef.current = null;
          resolve(undefined);
        }
      }, 60000);
    });
  }, []);

  // ================================================================
  // Message listener
  // ================================================================

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>): void => {
      const message = event.data as BackendMessage | null;

      if (typeof message !== 'object' || message === null) {
        return;
      }

      // Get store state inside handler to avoid dependency issues
      const state = useWorkflowStore.getState();

      switch (message.type) {
        case 'workflow:saved':
          if (process.env.NODE_ENV === 'development')
            console.warn('[WorkflowSync] Received workflow:saved confirmation');
          state.markSaved();
          // Check if there was a pending save while we were saving
          if (pendingSaveRef.current) {
            scheduleSave();
          }
          break;

        case 'workflow:loaded':
        case 'workflow:imported': {
          if (process.env.NODE_ENV === 'development')
            console.warn(
              '[WorkflowSync] Received',
              message.type,
              '- raw payload:',
              message.payload
            );

          // Backend sends workflow in payload - normalize it to frontend format
          const payload = message.payload as BackendWorkflowPayload | undefined;
          if (payload !== undefined && 'id' in payload) {
            const { workflow, cards, connections } = normalizeWorkflow(payload);

            if (process.env.NODE_ENV === 'development')
              console.warn('[WorkflowSync] Normalized workflow data:', {
                workflowId: workflow.id,
                workflowName: workflow.name,
                cardIds: workflow.cardIds,
                loadedCards: cards.map((c) => ({ id: c.id, name: c.name })),
                cardIdCount: workflow.cardIds.length,
                loadedCardCount: cards.length,
                connectionCount: connections.length,
              });

            state.loadWorkflow(workflow, cards, connections);
          }
          state.setSyncStatus('idle');
          break;
        }

        case 'workflow:created': {
          // Backend sends workflow in payload - normalize it to frontend format
          const payload = message.payload as BackendWorkflowPayload | undefined;
          if (payload !== undefined && 'id' in payload) {
            const { workflow, cards, connections } = normalizeWorkflow(payload);
            state.loadWorkflow(workflow, cards, connections);

            // Update sidebar list with new workflow so it appears instantly
            const newMetadata: WorkflowMetadata = {
              id: workflow.id,
              name: workflow.name,
              tags: workflow.tags,
              cardCount: cards.length,
              connectionCount: connections.length,
              snapshotCount: 0,
              createdAt: workflow.createdAt,
              updatedAt: workflow.updatedAt,
              ...(workflow.description !== undefined && { description: workflow.description }),
            };
            const currentList = useWorkflowStore.getState().workflowList;
            state.setWorkflowList([newMetadata, ...currentList]);
          }
          state.setSyncStatus('idle');
          break;
        }

        case 'workflow:deleted': {
          // If the deleted workflow was active, clear it
          const payload = message.payload as BackendPayload | undefined;
          if (state.activeWorkflow?.id === payload?.workflowId) {
            state.clearWorkflow();
          }
          // Also remove from the workflow list
          if (payload?.workflowId !== undefined) {
            state.removeWorkflowFromList(payload.workflowId);
          }
          break;
        }

        case 'workflow:list': {
          const workflows = message.payload as WorkflowMetadata[] | undefined;
          if (Array.isArray(workflows)) {
            state.setWorkflowList(workflows);
          }
          break;
        }

        case 'workflow:last-opened': {
          // Receive the last opened workflow ID from backend
          const payload = message.payload as { workflowId: string | null } | undefined;
          if (payload?.workflowId !== undefined && payload.workflowId !== null) {
            // Auto-load the last opened workflow
            loadWorkflow(payload.workflowId);
          }
          break;
        }

        case 'workflow:list-error': {
          const errorPayload = message.payload as BackendPayload | undefined;
          state.setWorkflowListError(errorPayload?.message ?? 'Failed to load workflows');
          break;
        }

        case 'workflow:snapshot-created': {
          const snapshot = message.payload as WorkflowSnapshot | undefined;
          if (snapshot !== undefined && 'id' in snapshot) {
            // Update the workflow with the new snapshot
            const currentWorkflow = state.activeWorkflow;
            if (currentWorkflow !== null) {
              state.updateWorkflow({
                snapshots: [...currentWorkflow.snapshots, snapshot],
                currentSnapshotId: snapshot.id,
              });
            }
          }
          break;
        }

        case 'workflow:snapshot-restored':
          // Workflow data will be reloaded via workflow:loaded
          state.setSyncStatus('idle');
          break;

        case 'workflow:snapshot-deleted':
          // Update local state to remove the snapshot
          break;

        case 'workflow:exported': {
          // Handle exported data (e.g., trigger download)
          const exportPayload = message.payload as BackendPayload | undefined;
          if (exportPayload?.content !== undefined) {
            const blob = new Blob([exportPayload.content], {
              type: exportPayload.format === 'markdown' ? 'text/markdown' : 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workflow-${String(Date.now())}.${exportPayload.format === 'markdown' ? 'md' : 'json'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
          break;
        }

        case 'workflow:error': {
          const errorPayload = message.payload as BackendPayload | undefined;
          state.setSyncError(errorPayload?.message ?? 'Unknown error');
          break;
        }

        // Shared Card Library
        case 'workflow:shared-cards-list': {
          const cards = message.payload as SharedCardMetadata[] | undefined;
          if (Array.isArray(cards)) {
            state.setSharedCards(cards);
          }
          break;
        }

        case 'workflow:shared-card-copied': {
          const copiedCard = message.payload as MarkdownCard | undefined;
          if (copiedCard !== undefined && 'id' in copiedCard) {
            // Add the copied card to the current workflow
            state.addCard(copiedCard);
          }
          break;
        }

        case 'workflow:card-promoted': {
          // Refresh the shared cards list after promoting
          postMessage({ type: 'workflow:list-shared-cards' });
          break;
        }

        case 'workflow:shared-cards-search-result': {
          const cards = message.payload as SharedCardMetadata[] | undefined;
          if (Array.isArray(cards)) {
            state.setSharedCards(cards);
          }
          break;
        }

        // File Sync Messages
        case 'workflow:file-linked': {
          const payload = message.payload as
            | {
                cardId: string;
                filePath: string;
                syncMode: FileSyncMode;
                content?: string;
              }
            | undefined;
          if (payload?.cardId !== undefined) {
            // Build update object - clear conflict by setting to fresh card state
            const update: Partial<MarkdownCard> = {
              filePath: payload.filePath,
              fileSync: payload.syncMode,
              lastFileSyncAt: Date.now(),
            };
            // If backend sent file content, update the card content
            if (payload.content !== undefined) {
              update.content = payload.content;
            }
            state.updateCard(payload.cardId, update);
            // Clear any conflict by removing the property via a second update
            state.clearCardFileConflict(payload.cardId);
          }
          break;
        }

        case 'workflow:file-unlinked': {
          const payload = message.payload as { cardId: string } | undefined;
          if (payload?.cardId !== undefined) {
            // Reset file sync state
            state.updateCard(payload.cardId, {
              fileSync: 'none',
            });
            // Clear file path and conflict
            state.clearCardFileLink(payload.cardId);
          }
          break;
        }

        case 'workflow:file-synced': {
          const payload = message.payload as
            | {
                cardId: string;
                content?: string;
                direction: 'from-file' | 'to-file';
              }
            | undefined;
          if (payload?.cardId !== undefined) {
            const update: Partial<MarkdownCard> = {
              lastFileSyncAt: Date.now(),
            };
            // If synced from file, update card content
            if (payload.direction === 'from-file' && payload.content !== undefined) {
              update.content = payload.content;
            }
            state.updateCard(payload.cardId, update);
            state.clearCardFileConflict(payload.cardId);
          }
          break;
        }

        case 'workflow:file-changed': {
          // Backend detected external file change
          const payload = message.payload as
            | {
                cardId: string;
                diskContent: string;
              }
            | undefined;
          if (payload?.cardId !== undefined) {
            const card = state.cards[payload.cardId];
            if (card !== undefined) {
              // Check if card content differs from disk content
              if (card.content !== payload.diskContent) {
                // Set conflict state
                const conflict: FileConflict = {
                  diskContent: payload.diskContent,
                  detectedAt: Date.now(),
                };
                state.updateCard(payload.cardId, { fileConflict: conflict });
              } else {
                // Content is same, just update sync time
                state.updateCard(payload.cardId, { lastFileSyncAt: Date.now() });
              }
            }
          }
          break;
        }

        case 'workflow:conflict-resolved': {
          const payload = message.payload as
            | {
                cardId: string;
                content: string;
              }
            | undefined;
          if (payload?.cardId !== undefined) {
            state.updateCard(payload.cardId, {
              content: payload.content,
              lastFileSyncAt: Date.now(),
            });
            state.clearCardFileConflict(payload.cardId);
          }
          break;
        }

        case 'workflow:file-selected': {
          // Response from file browser dialog
          const payload = message.payload as { filePath?: string } | undefined;
          if (browseFileResolverRef.current !== null) {
            browseFileResolverRef.current(payload?.filePath);
            browseFileResolverRef.current = null;
          }
          break;
        }

        default:
          // Unknown message type, ignore
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [scheduleSave, loadWorkflow]);

  // Request last opened workflow on initialization
  useEffect(() => {
    // Request the last opened workflow ID from backend
    getLastOpenedWorkflowId();
  }, [getLastOpenedWorkflowId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveWorkflow,
    loadWorkflow,
    createWorkflow,
    deleteWorkflow,
    listWorkflows,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    exportWorkflow,
    importWorkflow,
    listSharedCards,
    promoteCardToLibrary,
    copySharedCardToWorkflow,
    searchSharedCards,
    linkFile,
    unlinkFile,
    syncFile,
    resolveConflict,
    browseFile,
  };
}
