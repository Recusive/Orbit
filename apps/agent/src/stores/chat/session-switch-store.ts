import { create } from 'zustand';

import { useChatStore } from './chat-store';

import type { ChatSessionData, PendingMessage } from './chat-store';

export type PendingLoadStrategy = 'none' | 'query' | 'slow';
export type SessionSwitchStatus = 'idle' | 'hidden-priming' | 'visible-verifying';
export type ReadyInstancePhase = 'hidden' | 'visible';
export type PendingCreateStatus =
  | 'awaiting-created'
  | 'awaiting-first-send'
  | 'awaiting-system-init';

export interface PendingSessionSwitch {
  sessionId: string;
  title: string | null;
  sourceSessionId: string | null;
  loadStrategy: PendingLoadStrategy;
  conversationGeneration: number;
  workspaceEpoch: number;
}

export interface ReadyInstanceRecord {
  phase: ReadyInstancePhase;
  signature: string;
  settledSignature: string;
  tailProofVersion: number;
  instanceGeneration: number;
  requestId: number;
}

export interface PendingCreateState {
  createRequestId: string;
  draftSessionId: string | null;
  effectiveSessionId: string | null;
  title: string;
  payload: PendingMessage | null;
  status: PendingCreateStatus;
}

export interface SessionSwitchState {
  status: SessionSwitchStatus;
  requestId: number;
  pending: PendingSessionSwitch | null;
  readyInstances: Record<string, ReadyInstanceRecord>;
  preMountSessionId: string | null;
  pendingCreate: PendingCreateState | null;
  createRegistry: Record<string, PendingCreateState>;
  createSessionIndex: Record<string, string>;
  initialRestoreCompleted: boolean;
  initialRestorePendingRequestId: number | null;
  lastInitialRestoreAttemptKey: string | null;
  beginSessionSwitch: (
    sessionId: string,
    title: string | null,
    sourceSessionId: string | null,
    conversationGeneration: number,
    workspaceEpoch: number
  ) => number;
  promotePendingToVisibleVerification: (requestId: number) => boolean;
  setPendingConversationTitle: (title: string | null, requestId?: number) => void;
  setPendingLoadStrategy: (strategy: PendingLoadStrategy, requestId?: number) => void;
  retargetPendingSession: (
    currentSessionId: string,
    nextSessionId: string,
    conversationGeneration: number,
    workspaceEpoch: number,
    title?: string | null,
    requestId?: number
  ) => boolean;
  clearPendingSwitch: (requestId?: number) => void;
  setReadyInstance: (sessionId: string, record: ReadyInstanceRecord) => void;
  adoptVisibleReadyInstance: (
    sessionId: string,
    signature: string,
    settledSignature: string,
    tailProofVersion: number,
    requestId: number
  ) => boolean;
  clearReadyInstance: (sessionId: string, instanceGeneration?: number) => void;
  clearReadyInstances: (sessionIds: string[]) => void;
  requestPreMount: (sessionId: string) => boolean;
  clearPreMount: (sessionId?: string) => void;
  beginPendingCreate: (
    createRequestId: string,
    title: string,
    payload: PendingMessage | null
  ) => PendingCreateState;
  resolvePendingCreateDraft: (
    createRequestId: string,
    draftSessionId: string,
    title: string
  ) => PendingCreateState | null;
  markPendingCreateAwaitingSystemInit: (createRequestId: string) => PendingCreateState | null;
  remapPendingCreateSession: (
    currentSessionId: string,
    nextSessionId: string
  ) => PendingCreateState | null;
  finishPendingCreate: (createRequestId: string) => void;
  abortPendingCreate: (createRequestId?: string) => void;
  getCreateRequestIdBySessionId: (sessionId: string) => string | null;
  getCreateRecord: (createRequestId: string) => PendingCreateState | null;
  shouldAttemptInitialRestore: (attemptKey: string) => boolean;
  markInitialRestorePending: (requestId: number) => void;
  resetInitialRestorePending: (requestId?: number) => void;
  completeInitialRestore: () => void;
}

function cloneCreateSessionIndex(
  current: Record<string, string>,
  entries: [string, string][]
): Record<string, string> {
  const next = { ...current };
  for (const [sessionId, createRequestId] of entries) {
    next[sessionId] = createRequestId;
  }
  return next;
}

function removeCreateSessionIndex(
  current: Record<string, string>,
  sessionIds: (string | null)[]
): Record<string, string> {
  const next = { ...current };
  for (const sessionId of sessionIds) {
    if (!sessionId) {
      continue;
    }
    Reflect.deleteProperty(next, sessionId);
  }
  return next;
}

export function buildSessionReadinessSignature(
  session: ChatSessionData | undefined
): string | null {
  if (!session) {
    return null;
  }

  return [
    String(session.layoutVersion),
    String(session.messages.length),
    session.messages.at(-1)?.id ?? '',
  ].join(':');
}

export function buildSessionSettledSignature(session: ChatSessionData | undefined): string | null {
  const readinessSignature = buildSessionReadinessSignature(session);
  if (!readinessSignature) {
    return null;
  }

  return [readinessSignature, String(session?.layoutSettledVersion ?? 0)].join(':');
}

export const useSessionSwitchStore = create<SessionSwitchState>((set, get) => ({
  status: 'idle',
  requestId: 0,
  pending: null,
  readyInstances: {},
  preMountSessionId: null,
  pendingCreate: null,
  createRegistry: {},
  createSessionIndex: {},
  initialRestoreCompleted: false,
  initialRestorePendingRequestId: null,
  lastInitialRestoreAttemptKey: null,

  beginSessionSwitch: (
    sessionId,
    title,
    sourceSessionId,
    conversationGeneration,
    workspaceEpoch
  ): number => {
    let nextRequestId = 0;
    set((state) => {
      nextRequestId = state.requestId + 1;
      return {
        requestId: nextRequestId,
        status: 'hidden-priming',
        preMountSessionId: null,
        pending: {
          sessionId,
          title,
          sourceSessionId,
          loadStrategy: 'none',
          conversationGeneration,
          workspaceEpoch,
        },
      };
    });
    return nextRequestId;
  },

  promotePendingToVisibleVerification: (requestId): boolean => {
    let promoted = false;
    set((state) => {
      if (state.requestId !== requestId || state.pending === null) {
        return state;
      }

      promoted = true;
      return {
        status: 'visible-verifying',
      };
    });
    return promoted;
  },

  setPendingConversationTitle: (title, requestId): void => {
    set((state) => {
      if (state.pending === null || (requestId !== undefined && requestId !== state.requestId)) {
        return state;
      }

      return {
        pending: {
          ...state.pending,
          title,
        },
      };
    });
  },

  setPendingLoadStrategy: (strategy, requestId): void => {
    set((state) => {
      if (state.pending === null || (requestId !== undefined && requestId !== state.requestId)) {
        return state;
      }

      return {
        pending: {
          ...state.pending,
          loadStrategy: strategy,
        },
      };
    });
  },

  retargetPendingSession: (
    currentSessionId,
    nextSessionId,
    conversationGeneration,
    workspaceEpoch,
    title,
    requestId
  ): boolean => {
    let retargeted = false;
    set((state) => {
      if (
        state.pending?.sessionId !== currentSessionId ||
        (requestId !== undefined && requestId !== state.requestId)
      ) {
        return state;
      }

      retargeted = true;
      return {
        pending: {
          ...state.pending,
          sessionId: nextSessionId,
          conversationGeneration,
          workspaceEpoch,
          ...(title !== undefined ? { title } : {}),
        },
      };
    });
    return retargeted;
  },

  clearPendingSwitch: (requestId): void => {
    set((state) => {
      if (requestId !== undefined && requestId !== state.requestId) {
        return state;
      }

      return {
        status: 'idle',
        pending: null,
      };
    });
  },

  setReadyInstance: (sessionId, record): void => {
    set((state) => ({
      readyInstances: {
        ...state.readyInstances,
        [sessionId]: record,
      },
    }));
  },

  adoptVisibleReadyInstance: (
    sessionId,
    signature,
    settledSignature,
    tailProofVersion,
    requestId
  ): boolean => {
    let adopted = false;
    set((state) => {
      const current = state.readyInstances[sessionId];
      if (
        current?.phase !== 'visible' ||
        current.signature !== signature ||
        current.settledSignature !== settledSignature ||
        current.tailProofVersion !== tailProofVersion
      ) {
        return state;
      }

      adopted = true;
      return {
        readyInstances: {
          ...state.readyInstances,
          [sessionId]: {
            ...current,
            requestId,
          },
        },
      };
    });
    return adopted;
  },

  clearReadyInstance: (sessionId, instanceGeneration): void => {
    set((state) => {
      const existing = state.readyInstances[sessionId];
      if (!existing) {
        return state;
      }
      if (instanceGeneration !== undefined && existing.instanceGeneration !== instanceGeneration) {
        return state;
      }

      const next = { ...state.readyInstances };
      Reflect.deleteProperty(next, sessionId);
      return { readyInstances: next };
    });
  },

  clearReadyInstances: (sessionIds): void => {
    set((state) => {
      let changed = false;
      const next = { ...state.readyInstances };
      for (const sessionId of sessionIds) {
        if (sessionId in next) {
          Reflect.deleteProperty(next, sessionId);
          changed = true;
        }
      }
      return changed ? { readyInstances: next } : state;
    });
  },

  requestPreMount: (sessionId): boolean => {
    const activeSessionId = useChatStore.getState().activeSessionId;
    const session = useChatStore.getState().sessions[sessionId];
    if (
      sessionId === '' ||
      session?.hydrationState !== 'hydrated' ||
      activeSessionId === sessionId
    ) {
      return false;
    }

    let requested = false;
    set((state) => {
      if (state.pending !== null) {
        return state;
      }

      if (state.preMountSessionId === sessionId) {
        requested = true;
        return state;
      }

      requested = true;
      return {
        preMountSessionId: sessionId,
      };
    });

    return requested;
  },

  clearPreMount: (sessionId): void => {
    set((state) => {
      if (state.preMountSessionId === null) {
        return state;
      }
      if (sessionId !== undefined && state.preMountSessionId !== sessionId) {
        return state;
      }

      return {
        preMountSessionId: null,
      };
    });
  },

  beginPendingCreate: (createRequestId, title, payload): PendingCreateState => {
    const nextRecord: PendingCreateState = {
      createRequestId,
      draftSessionId: null,
      effectiveSessionId: null,
      title,
      payload,
      status: 'awaiting-created',
    };

    set((state) => ({
      pendingCreate: nextRecord,
      createRegistry: {
        ...state.createRegistry,
        [createRequestId]: nextRecord,
      },
    }));

    return nextRecord;
  },

  resolvePendingCreateDraft: (
    createRequestId,
    draftSessionId,
    title
  ): PendingCreateState | null => {
    let resolved: PendingCreateState | null = null;
    set((state) => {
      const existing = state.createRegistry[createRequestId];
      if (!existing) {
        return state;
      }

      const updated: PendingCreateState = {
        ...existing,
        draftSessionId,
        effectiveSessionId: existing.effectiveSessionId ?? draftSessionId,
        title,
        status: 'awaiting-first-send',
      };

      const createRegistry = {
        ...state.createRegistry,
        [createRequestId]: updated,
      };
      const createSessionIndex = cloneCreateSessionIndex(state.createSessionIndex, [
        [draftSessionId, createRequestId],
      ]);
      const isCurrent = state.pendingCreate?.createRequestId === createRequestId;
      if (isCurrent) {
        resolved = updated;
      }

      return {
        createRegistry,
        createSessionIndex,
        ...(isCurrent ? { pendingCreate: updated } : {}),
      };
    });
    return resolved;
  },

  markPendingCreateAwaitingSystemInit: (createRequestId): PendingCreateState | null => {
    let resolved: PendingCreateState | null = null;
    set((state) => {
      const existing = state.createRegistry[createRequestId];
      if (!existing) {
        return state;
      }

      const updated: PendingCreateState = {
        ...existing,
        status: 'awaiting-system-init',
      };
      const isCurrent = state.pendingCreate?.createRequestId === createRequestId;
      if (isCurrent) {
        resolved = updated;
      }

      return {
        createRegistry: {
          ...state.createRegistry,
          [createRequestId]: updated,
        },
        ...(isCurrent ? { pendingCreate: updated } : {}),
      };
    });
    return resolved;
  },

  remapPendingCreateSession: (currentSessionId, nextSessionId): PendingCreateState | null => {
    let resolved: PendingCreateState | null = null;
    set((state) => {
      const createRequestId = state.createSessionIndex[currentSessionId];
      if (!createRequestId) {
        return state;
      }

      const existing = state.createRegistry[createRequestId];
      if (!existing) {
        return state;
      }

      const updated: PendingCreateState = {
        ...existing,
        effectiveSessionId: nextSessionId,
      };
      const isCurrent = state.pendingCreate?.createRequestId === createRequestId;
      if (isCurrent) {
        resolved = updated;
      }

      return {
        createRegistry: {
          ...state.createRegistry,
          [createRequestId]: updated,
        },
        createSessionIndex: cloneCreateSessionIndex(state.createSessionIndex, [
          [nextSessionId, createRequestId],
        ]),
        ...(isCurrent ? { pendingCreate: updated } : {}),
      };
    });
    return resolved;
  },

  finishPendingCreate: (createRequestId): void => {
    set((state) => {
      const existing = state.createRegistry[createRequestId];
      if (!existing) {
        return state;
      }

      const createRegistry = { ...state.createRegistry };
      Reflect.deleteProperty(createRegistry, createRequestId);

      return {
        createRegistry,
        createSessionIndex: removeCreateSessionIndex(state.createSessionIndex, [
          existing.draftSessionId,
          existing.effectiveSessionId,
        ]),
        ...(state.pendingCreate?.createRequestId === createRequestId
          ? { pendingCreate: null }
          : {}),
      };
    });
  },

  abortPendingCreate: (createRequestId): void => {
    const activeRequestId = createRequestId ?? get().pendingCreate?.createRequestId;
    if (!activeRequestId) {
      return;
    }
    get().finishPendingCreate(activeRequestId);
  },

  getCreateRequestIdBySessionId: (sessionId): string | null => {
    return get().createSessionIndex[sessionId] ?? null;
  },

  getCreateRecord: (createRequestId): PendingCreateState | null => {
    return get().createRegistry[createRequestId] ?? null;
  },

  shouldAttemptInitialRestore: (attemptKey): boolean => {
    const state = get();
    if (
      state.initialRestoreCompleted ||
      (state.initialRestorePendingRequestId !== null &&
        state.lastInitialRestoreAttemptKey === attemptKey)
    ) {
      return false;
    }
    set({
      lastInitialRestoreAttemptKey: attemptKey,
      initialRestorePendingRequestId: 0,
    });
    return true;
  },

  markInitialRestorePending: (requestId): void => {
    set({ initialRestorePendingRequestId: requestId });
  },

  resetInitialRestorePending: (requestId): void => {
    const state = get();
    if (
      requestId !== undefined &&
      state.initialRestorePendingRequestId !== null &&
      state.initialRestorePendingRequestId !== requestId
    ) {
      return;
    }

    if (state.initialRestoreCompleted && requestId === undefined) {
      return;
    }

    set({ initialRestorePendingRequestId: null });
  },

  completeInitialRestore: (): void => {
    if (get().initialRestoreCompleted) {
      return;
    }
    set({ initialRestoreCompleted: true, initialRestorePendingRequestId: null });
  },
}));

export function usePendingSessionId(): string | null {
  return useSessionSwitchStore((state) => state.pending?.sessionId ?? null);
}

export function usePendingConversationTitle(): string | null {
  return useSessionSwitchStore((state) => state.pending?.title ?? null);
}

export function useSessionSwitchRequestId(): number {
  return useSessionSwitchStore((state) => state.requestId);
}

export function usePendingSessionPhase(): SessionSwitchStatus {
  return useSessionSwitchStore((state) => state.status);
}

export function usePreMountSessionId(): string | null {
  return useSessionSwitchStore((state) => state.preMountSessionId);
}
