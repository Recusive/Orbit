/* eslint-disable @typescript-eslint/no-dynamic-delete */

import { create } from 'zustand';

import type { OcMessage, OcPart } from '@/types/opencode';
import type { SessionMessagesResponses } from '@opencode-ai/sdk/v2/client';

interface OcDeltaBuffer {
  readonly field: string;
  readonly delta: string;
}

interface OcSessionMessages {
  messagesById: Record<string, OcMessage>;
  messageOrder: string[];
  partsByMessage: Record<string, OcPart[]>;
  partsById: Record<string, OcPart>;
  deltaBufferByPart: Record<string, OcDeltaBuffer[]>;
}

interface OcMessageState {
  sessions: Record<string, OcSessionMessages>;
  setSessionMessages: (sessionId: string, entries: SessionMessagesResponses[200]) => void;
  upsertMessage: (message: OcMessage) => void;
  removeMessage: (sessionId: string, messageId: string) => void;
  upsertPart: (part: OcPart) => void;
  removePart: (sessionId: string, partId: string) => void;
  appendDelta: (
    sessionId: string,
    messageId: string,
    partId: string,
    field: string,
    delta: string
  ) => void;
  flushDeltaBuffer: (sessionId: string, messageId: string, partId: string) => void;
  clearSession: (sessionId: string) => void;
  clearAll: () => void;
}

function compareMessages(
  left: Pick<OcMessage, 'id' | 'time'>,
  right: Pick<OcMessage, 'id' | 'time'>
): number {
  return left.time.created - right.time.created || left.id.localeCompare(right.id);
}

function getOrCreateSession(
  sessions: Record<string, OcSessionMessages>,
  sessionId: string
): OcSessionMessages {
  const existing = sessions[sessionId];
  if (existing) {
    return existing;
  }

  const created: OcSessionMessages = {
    messagesById: {},
    messageOrder: [],
    partsByMessage: {},
    partsById: {},
    deltaBufferByPart: {},
  };
  sessions[sessionId] = created;
  return created;
}

function orderMessageIds(messagesById: Record<string, OcMessage>): string[] {
  return Object.values(messagesById)
    .sort(compareMessages)
    .map((message) => message.id);
}

function upsertSortedPart(parts: OcPart[], part: OcPart): OcPart[] {
  const existingIndex = parts.findIndex((candidate) => candidate.id === part.id);
  if (existingIndex !== -1) {
    const next = parts.slice();
    next[existingIndex] = part;
    return next;
  }

  const next = parts.slice();
  let index = 0;
  while (index < next.length && (next[index]?.id ?? '').localeCompare(part.id) < 0) {
    index += 1;
  }
  next.splice(index, 0, part);
  return next;
}

export const useOcMessageStore = create<OcMessageState>((set) => ({
  sessions: {},
  setSessionMessages: (sessionId, entries) => {
    set((state) => {
      const session = getOrCreateSession(state.sessions, sessionId);
      session.messagesById = {};
      session.messageOrder = [];
      session.partsByMessage = {};
      session.partsById = {};
      session.deltaBufferByPart = {};

      for (const entry of entries) {
        session.messagesById[entry.info.id] = entry.info;
        session.partsByMessage[entry.info.id] = entry.parts
          .slice()
          .sort((left, right) => left.id.localeCompare(right.id));

        for (const part of entry.parts) {
          session.partsById[part.id] = part;
        }
      }
      session.messageOrder = orderMessageIds(session.messagesById);

      return {
        sessions: {
          ...state.sessions,
        },
      };
    });
  },
  upsertMessage: (message) => {
    set((state) => {
      const session = getOrCreateSession(state.sessions, message.sessionID);
      session.messagesById[message.id] = message;
      session.messageOrder = orderMessageIds(session.messagesById);

      return {
        sessions: {
          ...state.sessions,
        },
      };
    });
  },
  removeMessage: (sessionId, messageId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) {
        return state;
      }

      delete session.messagesById[messageId];
      session.messageOrder = session.messageOrder.filter((id) => id !== messageId);
      const parts = session.partsByMessage[messageId] ?? [];
      delete session.partsByMessage[messageId];

      for (const part of parts) {
        delete session.partsById[part.id];
        delete session.deltaBufferByPart[part.id];
      }

      return {
        sessions: {
          ...state.sessions,
        },
      };
    });
  },
  upsertPart: (part) => {
    set((state) => {
      const session = getOrCreateSession(state.sessions, part.sessionID);
      session.partsById[part.id] = part;
      session.partsByMessage[part.messageID] = upsertSortedPart(
        session.partsByMessage[part.messageID] ?? [],
        part
      );

      return {
        sessions: {
          ...state.sessions,
        },
      };
    });
  },
  removePart: (sessionId, partId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      const part = session?.partsById[partId];
      if (!session || !part) {
        return state;
      }

      delete session.partsById[partId];
      delete session.deltaBufferByPart[partId];
      session.partsByMessage[part.messageID] =
        session.partsByMessage[part.messageID]?.filter((candidate) => candidate.id !== partId) ??
        [];

      return {
        sessions: {
          ...state.sessions,
        },
      };
    });
  },
  appendDelta: (sessionId, messageId, partId, field, delta) => {
    set((state) => {
      const session = getOrCreateSession(state.sessions, sessionId);
      const part = session.partsById[partId];

      if (!part) {
        session.deltaBufferByPart[partId] = [
          ...(session.deltaBufferByPart[partId] ?? []),
          { field, delta },
        ];
        return {
          sessions: {
            ...state.sessions,
          },
        };
      }

      const currentField =
        ((part as unknown as Record<string, unknown>)[field] as string | undefined) ?? '';
      const updatedPart = {
        ...part,
        [field]: currentField + delta,
      } as OcPart;

      session.partsById[partId] = updatedPart;
      session.partsByMessage[messageId] = (session.partsByMessage[messageId] ?? []).map(
        (candidate) => (candidate.id === partId ? updatedPart : candidate)
      );

      return {
        sessions: {
          ...state.sessions,
        },
      };
    });
  },
  flushDeltaBuffer: (sessionId, messageId, partId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) {
        return state;
      }

      const buffered = session.deltaBufferByPart[partId];
      if (!buffered || buffered.length === 0) {
        return state;
      }

      delete session.deltaBufferByPart[partId];
      for (const entry of buffered) {
        const part = session.partsById[partId];
        if (!part) {
          continue;
        }

        const currentField =
          ((part as unknown as Record<string, unknown>)[entry.field] as string | undefined) ?? '';
        const updatedPart = {
          ...part,
          [entry.field]: currentField + entry.delta,
        } as OcPart;
        session.partsById[partId] = updatedPart;
        session.partsByMessage[messageId] = (session.partsByMessage[messageId] ?? []).map(
          (candidate) => (candidate.id === partId ? updatedPart : candidate)
        );
      }

      return {
        sessions: {
          ...state.sessions,
        },
      };
    });
  },
  clearSession: (sessionId) => {
    set((state) => {
      return {
        sessions: Object.fromEntries(
          Object.entries(state.sessions).filter(([id]) => id !== sessionId)
        ),
      };
    });
  },
  clearAll: () => {
    set({ sessions: {} });
  },
}));
