/**
 * Workflow Store
 * Zustand store for workflow state management with backend sync
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  createMarkdownCard,
  createWorkflow,
  createWorkflowConnection,
} from '../types/workflowTypes';

import type {
  CardType,
  LineRange,
  MarkdownCard,
  SharedCardMetadata,
  Workflow,
  WorkflowConnection,
  WorkflowMetadata,
  WorkflowSnapshot,
} from '../types/workflowTypes';

// ============================================================================
// Sync State Types
// ============================================================================

type SyncStatus = 'idle' | 'saving' | 'loading' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSaveTime: number | null;
  lastError: string | null;
  isDirty: boolean;
}

// ============================================================================
// State Types
// ============================================================================

interface WorkflowUIPreferences {
  showMinimap: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  defaultCardType: CardType;
}

interface WorkflowState {
  // Active workflow
  activeWorkflow: Workflow | null;

  // Cards and connections (keyed by ID for fast lookup)
  cards: Record<string, MarkdownCard>;
  connections: Record<string, WorkflowConnection>;

  // Workflow list (for sidebar)
  workflowList: WorkflowMetadata[];
  workflowListLoading: boolean;
  workflowListError: string | null;

  // Shared card library
  sharedCards: SharedCardMetadata[];
  sharedCardsLoading: boolean;

  // Selection state
  selectedCardIds: string[];
  selectedConnectionIds: string[];
  focusedCardId: string | null;
  lineSelections: Record<string, LineRange[]>;

  // UI state
  aiPromptOpen: boolean;
  expandedCardId: string | null;
  propertiesPanelConnectionId: string | null;

  // UI preferences
  preferences: WorkflowUIPreferences;

  // Sync state
  sync: SyncState;
}

interface WorkflowActions {
  // Workflow actions
  createNewWorkflow: (name: string, userId: string) => void;
  loadWorkflow: (
    workflow: Workflow,
    cards: MarkdownCard[],
    connections: WorkflowConnection[]
  ) => void;
  updateWorkflow: (updates: Partial<Workflow>) => void;
  clearWorkflow: () => void;

  // Card actions
  addCard: (card: Partial<MarkdownCard> & { id: string; createdBy: string }) => MarkdownCard;
  updateCard: (cardId: string, updates: Partial<MarkdownCard>) => void;
  deleteCard: (cardId: string) => void;
  duplicateCard: (cardId: string) => MarkdownCard | null;

  // Connection actions
  addConnection: (
    connection: Partial<WorkflowConnection> & {
      id: string;
      sourceCardId: string;
      targetCardId: string;
      createdBy: string;
    }
  ) => WorkflowConnection;
  updateConnection: (connectionId: string, updates: Partial<WorkflowConnection>) => void;
  deleteConnection: (connectionId: string) => void;

  // Selection actions
  setSelectedCards: (cardIds: string[]) => void;
  toggleCardSelection: (cardId: string) => void;
  clearSelection: () => void;
  setFocusedCard: (cardId: string | null) => void;
  setLineSelections: (cardId: string, ranges: LineRange[]) => void;
  clearLineSelections: (cardId: string) => void;

  // UI actions
  setAiPromptOpen: (open: boolean) => void;
  setExpandedCard: (cardId: string | null) => void;
  setPropertiesPanelConnection: (connectionId: string | null) => void;

  // Preferences actions
  updatePreferences: (updates: Partial<WorkflowUIPreferences>) => void;

  // Snapshot actions
  createSnapshot: (name: string, userId: string) => WorkflowSnapshot | null;
  restoreSnapshot: (snapshotId: string) => boolean;
  deleteSnapshot: (snapshotId: string) => void;

  // Bulk actions
  getCardsArray: () => MarkdownCard[];
  getConnectionsArray: () => WorkflowConnection[];
  getSelectedCards: () => MarkdownCard[];
  getConnectedCards: (cardId: string) => MarkdownCard[];

  // Sync actions
  setSyncStatus: (status: SyncStatus) => void;
  setSyncError: (error: string | null) => void;
  markSaved: () => void;
  markDirty: () => void;

  // Workflow list actions
  setWorkflowList: (workflows: WorkflowMetadata[]) => void;
  setWorkflowListLoading: (loading: boolean) => void;
  setWorkflowListError: (error: string | null) => void;
  removeWorkflowFromList: (workflowId: string) => void;

  // Shared card library actions
  setSharedCards: (cards: SharedCardMetadata[]) => void;
  setSharedCardsLoading: (loading: boolean) => void;

  // File sync helper actions
  clearCardFileConflict: (cardId: string) => void;
  clearCardFileLink: (cardId: string) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialPreferences: WorkflowUIPreferences = {
  showMinimap: true,
  showGrid: true,
  snapToGrid: true,
  gridSize: 16,
  defaultCardType: 'prompt',
};

const initialSyncState: SyncState = {
  status: 'idle',
  lastSaveTime: null,
  lastError: null,
  isDirty: false,
};

const initialState: WorkflowState = {
  activeWorkflow: null,
  cards: {},
  connections: {},
  workflowList: [],
  workflowListLoading: false,
  workflowListError: null,
  sharedCards: [],
  sharedCardsLoading: false,
  selectedCardIds: [],
  selectedConnectionIds: [],
  focusedCardId: null,
  lineSelections: {},
  aiPromptOpen: false,
  expandedCardId: null,
  propertiesPanelConnectionId: null,
  preferences: initialPreferences,
  sync: initialSyncState,
};

// ============================================================================
// Store
// ============================================================================

export const useWorkflowStore = create<WorkflowState & WorkflowActions>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ================================================================
    // Workflow Actions
    // ================================================================

    createNewWorkflow: (name: string, userId: string): void => {
      const workflow = createWorkflow({
        id: `workflow-${String(Date.now())}`,
        name,
        owner: userId,
      });
      set({
        activeWorkflow: workflow,
        cards: {},
        connections: {},
        selectedCardIds: [],
        selectedConnectionIds: [],
        focusedCardId: null,
        lineSelections: {},
        sync: { ...get().sync, isDirty: true },
      });
    },

    loadWorkflow: (
      workflow: Workflow,
      cards: MarkdownCard[],
      connections: WorkflowConnection[]
    ): void => {
      if (process.env.NODE_ENV === 'development')
        console.warn('[WorkflowStore] loadWorkflow:', {
          workflowId: workflow.id,
          workflowName: workflow.name,
          cardIdsInWorkflow: workflow.cardIds,
          cardsToLoad: cards.map((c) => ({ id: c.id, name: c.name })),
          cardIdCount: workflow.cardIds.length,
          actualCardCount: cards.length,
          connectionsToLoad: connections.length,
        });

      const cardsMap: Record<string, MarkdownCard> = {};
      for (const card of cards) {
        cardsMap[card.id] = card;
      }

      const connectionsMap: Record<string, WorkflowConnection> = {};
      for (const connection of connections) {
        connectionsMap[connection.id] = connection;
      }

      set({
        activeWorkflow: workflow,
        cards: cardsMap,
        connections: connectionsMap,
        selectedCardIds: [],
        selectedConnectionIds: [],
        focusedCardId: null,
        lineSelections: {},
        sync: { ...initialSyncState, status: 'idle' },
      });

      if (process.env.NODE_ENV === 'development')
        console.warn(
          '[WorkflowStore] loadWorkflow complete - cards in store:',
          Object.keys(cardsMap)
        );
    },

    updateWorkflow: (updates: Partial<Workflow>): void => {
      const { activeWorkflow, sync } = get();
      if (activeWorkflow === null) return;

      set({
        activeWorkflow: {
          ...activeWorkflow,
          ...updates,
          updatedAt: Date.now(),
        },
        sync: { ...sync, isDirty: true },
      });
    },

    clearWorkflow: (): void => {
      set({
        activeWorkflow: null,
        cards: {},
        connections: {},
        selectedCardIds: [],
        selectedConnectionIds: [],
        focusedCardId: null,
        lineSelections: {},
        sync: initialSyncState,
      });
    },

    // ================================================================
    // Card Actions
    // ================================================================

    addCard: (cardData): MarkdownCard => {
      const card = createMarkdownCard(cardData);
      const { activeWorkflow, sync } = get();

      if (process.env.NODE_ENV === 'development')
        console.warn('[WorkflowStore] addCard:', {
          cardId: card.id,
          cardName: card.name,
          activeWorkflowId: activeWorkflow?.id,
          currentCardIds: activeWorkflow?.cardIds,
          currentCardsInStore: Object.keys(get().cards),
        });

      set((state) => ({
        cards: { ...state.cards, [card.id]: card },
        activeWorkflow:
          activeWorkflow !== null
            ? {
                ...activeWorkflow,
                cardIds: [...activeWorkflow.cardIds, card.id],
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      }));

      if (process.env.NODE_ENV === 'development')
        console.warn('[WorkflowStore] addCard complete:', {
          newCardIds: get().activeWorkflow?.cardIds,
          newCardsInStore: Object.keys(get().cards),
        });

      return card;
    },

    updateCard: (cardId: string, updates: Partial<MarkdownCard>): void => {
      const { cards, sync } = get();
      const card = cards[cardId];
      if (card === undefined) return;

      set((state) => ({
        cards: {
          ...state.cards,
          [cardId]: {
            ...card,
            ...updates,
            updatedAt: Date.now(),
          },
        },
        sync: { ...sync, isDirty: true },
      }));
    },

    deleteCard: (cardId: string): void => {
      const { cards, connections, activeWorkflow, selectedCardIds, sync } = get();

      // Remove card using filter
      const newCards = Object.fromEntries(Object.entries(cards).filter(([id]) => id !== cardId));

      // Remove connections involving this card
      const removedConnectionIds: string[] = [];
      const newConnections = Object.fromEntries(
        Object.entries(connections).filter(([connId, conn]) => {
          const shouldRemove = conn.sourceCardId === cardId || conn.targetCardId === cardId;
          if (shouldRemove) {
            removedConnectionIds.push(connId);
          }
          return !shouldRemove;
        })
      );

      set({
        cards: newCards,
        connections: newConnections,
        selectedCardIds: selectedCardIds.filter((id) => id !== cardId),
        activeWorkflow:
          activeWorkflow !== null
            ? {
                ...activeWorkflow,
                cardIds: activeWorkflow.cardIds.filter((id) => id !== cardId),
                connectionIds: activeWorkflow.connectionIds.filter(
                  (id) => !removedConnectionIds.includes(id)
                ),
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      });
    },

    duplicateCard: (cardId: string): MarkdownCard | null => {
      const { cards } = get();
      const original = cards[cardId];
      if (original === undefined) return null;

      const newCard = get().addCard({
        id: `${cardId}-copy-${String(Date.now())}`,
        createdBy: original.createdBy,
        name: `${original.name} (Copy)`,
        content: original.content,
        type: original.type,
        tags: [...original.tags],
        position: {
          x: original.position.x + 50,
          y: original.position.y + 50,
        },
      });

      return newCard;
    },

    // ================================================================
    // Connection Actions
    // ================================================================

    addConnection: (connectionData): WorkflowConnection => {
      const connection = createWorkflowConnection(connectionData);
      const { activeWorkflow, sync } = get();

      set((state) => ({
        connections: { ...state.connections, [connection.id]: connection },
        activeWorkflow:
          activeWorkflow !== null
            ? {
                ...activeWorkflow,
                connectionIds: [...activeWorkflow.connectionIds, connection.id],
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      }));

      return connection;
    },

    updateConnection: (connectionId: string, updates: Partial<WorkflowConnection>): void => {
      const { connections, sync } = get();
      const connection = connections[connectionId];
      if (connection === undefined) return;

      set((state) => ({
        connections: {
          ...state.connections,
          [connectionId]: {
            ...connection,
            ...updates,
          },
        },
        sync: { ...sync, isDirty: true },
      }));
    },

    deleteConnection: (connectionId: string): void => {
      const { connections, activeWorkflow, selectedConnectionIds, sync } = get();

      // Remove connection using filter
      const newConnections = Object.fromEntries(
        Object.entries(connections).filter(([id]) => id !== connectionId)
      );

      set({
        connections: newConnections,
        selectedConnectionIds: selectedConnectionIds.filter((id) => id !== connectionId),
        propertiesPanelConnectionId:
          get().propertiesPanelConnectionId === connectionId
            ? null
            : get().propertiesPanelConnectionId,
        activeWorkflow:
          activeWorkflow !== null
            ? {
                ...activeWorkflow,
                connectionIds: activeWorkflow.connectionIds.filter((id) => id !== connectionId),
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      });
    },

    // ================================================================
    // Selection Actions
    // ================================================================

    setSelectedCards: (cardIds: string[]): void => {
      set({ selectedCardIds: cardIds });
    },

    toggleCardSelection: (cardId: string): void => {
      const { selectedCardIds } = get();
      if (selectedCardIds.includes(cardId)) {
        set({ selectedCardIds: selectedCardIds.filter((id) => id !== cardId) });
      } else {
        set({ selectedCardIds: [...selectedCardIds, cardId] });
      }
    },

    clearSelection: (): void => {
      set({
        selectedCardIds: [],
        selectedConnectionIds: [],
        focusedCardId: null,
      });
    },

    setFocusedCard: (cardId: string | null): void => {
      set({ focusedCardId: cardId });
    },

    setLineSelections: (cardId: string, ranges: LineRange[]): void => {
      set((state) => ({
        lineSelections: {
          ...state.lineSelections,
          [cardId]: ranges,
        },
      }));
    },

    clearLineSelections: (cardId: string): void => {
      set((state) => ({
        lineSelections: Object.fromEntries(
          Object.entries(state.lineSelections).filter(([id]) => id !== cardId)
        ),
      }));
    },

    // ================================================================
    // UI Actions
    // ================================================================

    setAiPromptOpen: (open: boolean): void => {
      set({ aiPromptOpen: open });
    },

    setExpandedCard: (cardId: string | null): void => {
      set({ expandedCardId: cardId });
    },

    setPropertiesPanelConnection: (connectionId: string | null): void => {
      set({ propertiesPanelConnectionId: connectionId });
    },

    // ================================================================
    // Preferences Actions
    // ================================================================

    updatePreferences: (updates: Partial<WorkflowUIPreferences>): void => {
      set((state) => ({
        preferences: {
          ...state.preferences,
          ...updates,
        },
      }));
    },

    // ================================================================
    // Snapshot Actions
    // ================================================================

    createSnapshot: (name: string, userId: string): WorkflowSnapshot | null => {
      const { activeWorkflow, cards, connections, sync } = get();
      if (activeWorkflow === null) return null;

      const snapshot: WorkflowSnapshot = {
        id: `snapshot-${String(Date.now())}`,
        name,
        cards: Object.values(cards),
        connections: Object.values(connections),
        createdAt: Date.now(),
        createdBy: userId,
      };

      set({
        activeWorkflow: {
          ...activeWorkflow,
          snapshots: [...activeWorkflow.snapshots, snapshot],
          currentSnapshotId: snapshot.id,
          updatedAt: Date.now(),
        },
        sync: { ...sync, isDirty: true },
      });

      return snapshot;
    },

    restoreSnapshot: (snapshotId: string): boolean => {
      const { activeWorkflow, sync } = get();
      if (activeWorkflow === null) return false;

      const snapshot = activeWorkflow.snapshots.find((s) => s.id === snapshotId);
      if (snapshot === undefined) return false;

      const cardsMap: Record<string, MarkdownCard> = {};
      for (const card of snapshot.cards) {
        cardsMap[card.id] = card;
      }

      const connectionsMap: Record<string, WorkflowConnection> = {};
      for (const connection of snapshot.connections) {
        connectionsMap[connection.id] = connection;
      }

      set({
        cards: cardsMap,
        connections: connectionsMap,
        activeWorkflow: {
          ...activeWorkflow,
          cardIds: snapshot.cards.map((c) => c.id),
          connectionIds: snapshot.connections.map((c) => c.id),
          currentSnapshotId: snapshotId,
          updatedAt: Date.now(),
        },
        selectedCardIds: [],
        selectedConnectionIds: [],
        sync: { ...sync, isDirty: true },
      });

      return true;
    },

    deleteSnapshot: (snapshotId: string): void => {
      const { activeWorkflow, sync } = get();
      if (activeWorkflow === null) return;

      set({
        activeWorkflow: {
          ...activeWorkflow,
          snapshots: activeWorkflow.snapshots.filter((s) => s.id !== snapshotId),
          currentSnapshotId:
            activeWorkflow.currentSnapshotId === snapshotId
              ? null
              : activeWorkflow.currentSnapshotId,
          updatedAt: Date.now(),
        },
        sync: { ...sync, isDirty: true },
      });
    },

    // ================================================================
    // Bulk Accessors
    // ================================================================

    getCardsArray: (): MarkdownCard[] => {
      return Object.values(get().cards);
    },

    getConnectionsArray: (): WorkflowConnection[] => {
      return Object.values(get().connections);
    },

    getSelectedCards: (): MarkdownCard[] => {
      const { cards, selectedCardIds } = get();
      return selectedCardIds
        .map((id) => cards[id])
        .filter((card): card is MarkdownCard => card !== undefined);
    },

    getConnectedCards: (cardId: string): MarkdownCard[] => {
      const { cards, connections } = get();
      const connectedIds = new Set<string>();

      for (const connection of Object.values(connections)) {
        if (connection.sourceCardId === cardId) {
          connectedIds.add(connection.targetCardId);
        } else if (connection.targetCardId === cardId && connection.direction === 'bidirectional') {
          connectedIds.add(connection.sourceCardId);
        }
      }

      return Array.from(connectedIds)
        .map((id) => cards[id])
        .filter((card): card is MarkdownCard => card !== undefined);
    },

    // ================================================================
    // Sync Actions
    // ================================================================

    setSyncStatus: (status: SyncStatus): void => {
      set((state) => ({
        sync: { ...state.sync, status },
      }));
    },

    setSyncError: (error: string | null): void => {
      set((state) => ({
        sync: {
          ...state.sync,
          status: error !== null ? 'error' : state.sync.status,
          lastError: error,
        },
      }));
    },

    markSaved: (): void => {
      set((state) => ({
        sync: {
          ...state.sync,
          status: 'idle',
          isDirty: false,
          lastSaveTime: Date.now(),
          lastError: null,
        },
      }));
    },

    markDirty: (): void => {
      set((state) => ({
        sync: { ...state.sync, isDirty: true },
      }));
    },

    // ================================================================
    // Workflow List Actions
    // ================================================================

    setWorkflowList: (workflows: WorkflowMetadata[]): void => {
      set({
        workflowList: workflows,
        workflowListLoading: false,
        workflowListError: null,
      });
    },

    setWorkflowListLoading: (loading: boolean): void => {
      set({ workflowListLoading: loading });
    },

    setWorkflowListError: (error: string | null): void => {
      set({
        workflowListError: error,
        workflowListLoading: false,
      });
    },

    removeWorkflowFromList: (workflowId: string): void => {
      set((state) => ({
        workflowList: state.workflowList.filter((w) => w.id !== workflowId),
      }));
    },

    // ================================================================
    // Shared Card Library Actions
    // ================================================================

    setSharedCards: (cards: SharedCardMetadata[]): void => {
      set({
        sharedCards: cards,
        sharedCardsLoading: false,
      });
    },

    setSharedCardsLoading: (loading: boolean): void => {
      set({ sharedCardsLoading: loading });
    },

    // File sync helper actions - these delete optional properties to clear them
    // (required due to exactOptionalPropertyTypes TypeScript setting)
    clearCardFileConflict: (cardId: string): void => {
      const state = get();
      const card = state.cards[cardId];
      if (card === undefined) return;

      // Create a new card object without the fileConflict property
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { fileConflict: _removed, ...restCard } = card;
      set({
        cards: { ...state.cards, [cardId]: restCard as MarkdownCard },
        sync: { ...state.sync, isDirty: true },
      });
    },

    clearCardFileLink: (cardId: string): void => {
      const state = get();
      const card = state.cards[cardId];
      if (card === undefined) return;

      // Create a new card object without file-related optional properties
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { filePath: _fp, fileConflict: _fc, lastFileSyncAt: _ls, ...restCard } = card;
      set({
        cards: { ...state.cards, [cardId]: restCard as MarkdownCard },
        sync: { ...state.sync, isDirty: true },
      });
    },
  }))
);

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

export const selectActiveWorkflow = (state: WorkflowState): Workflow | null => state.activeWorkflow;

export const selectCards = (state: WorkflowState): Record<string, MarkdownCard> => state.cards;

export const selectConnections = (state: WorkflowState): Record<string, WorkflowConnection> =>
  state.connections;

export const selectSelectedCardIds = (state: WorkflowState): string[] => state.selectedCardIds;

export const selectPreferences = (state: WorkflowState): WorkflowUIPreferences => state.preferences;

export const selectAiPromptOpen = (state: WorkflowState): boolean => state.aiPromptOpen;

export const selectExpandedCardId = (state: WorkflowState): string | null => state.expandedCardId;

export const selectSyncState = (state: WorkflowState): SyncState => state.sync;

export const selectWorkflowList = (state: WorkflowState): WorkflowMetadata[] => state.workflowList;

export const selectWorkflowListLoading = (state: WorkflowState): boolean =>
  state.workflowListLoading;

export const selectWorkflowListError = (state: WorkflowState): string | null =>
  state.workflowListError;

// Export types for external use
export type { SyncStatus, SyncState };
