import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/shallow';

import type { OcSession, OcSessionStatus } from '@/types/opencode';

const MAX_SESSIONS = 30;
const STORAGE_KEY = 'orbit-oc-sessionId';

interface OcSessionState {
  sessions: Record<string, OcSession>;
  activeSessionId: string | null;
  sessionStatuses: Record<string, OcSessionStatus>;
  sessionErrors: Record<string, string>;
  setSessions: (sessions: OcSession[]) => void;
  addSession: (session: OcSession) => void;
  updateSession: (session: OcSession) => void;
  removeSession: (sessionId: string) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setSessionStatus: (sessionId: string, status: OcSessionStatus) => void;
  setSessionError: (sessionId: string, error: string | null) => void;
  clearSessionCaches: (sessionId: string) => void;
  clearAll: () => void;
}

function trimSessions(sessions: Record<string, OcSession>): Record<string, OcSession> {
  const entries = Object.values(sessions)
    .sort((left, right) => right.time.updated - left.time.updated)
    .slice(0, MAX_SESSIONS);

  return Object.fromEntries(entries.map((session) => [session.id, session]));
}

function pruneRecord<T>(record: Record<string, T>, retainedIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => retainedIds.has(id)));
}

export const useOcSessionStore = create<OcSessionState>()(
  persist(
    (set) => ({
      sessions: {},
      activeSessionId: null,
      sessionStatuses: {},
      sessionErrors: {},
      setSessions: (sessions) => {
        set((state) => ({
          ...(() => {
            const trimmedSessions = trimSessions(
              Object.fromEntries(sessions.map((session) => [session.id, session]))
            );
            const retainedIds = new Set(Object.keys(trimmedSessions));

            return {
              sessions: trimmedSessions,
              activeSessionId:
                state.activeSessionId && retainedIds.has(state.activeSessionId)
                  ? state.activeSessionId
                  : null,
              sessionStatuses: pruneRecord(state.sessionStatuses, retainedIds),
              sessionErrors: pruneRecord(state.sessionErrors, retainedIds),
            };
          })(),
        }));
      },
      addSession: (session) => {
        set((state) => {
          const trimmedSessions = trimSessions({
            ...state.sessions,
            [session.id]: session,
          });
          const retainedIds = new Set(Object.keys(trimmedSessions));

          return {
            sessions: trimmedSessions,
            activeSessionId:
              state.activeSessionId && retainedIds.has(state.activeSessionId)
                ? state.activeSessionId
                : state.activeSessionId === null || retainedIds.has(session.id)
                  ? state.activeSessionId
                  : null,
            sessionStatuses: pruneRecord(state.sessionStatuses, retainedIds),
            sessionErrors: pruneRecord(state.sessionErrors, retainedIds),
          };
        });
      },
      updateSession: (session) => {
        set((state) => {
          const trimmedSessions = trimSessions({
            ...state.sessions,
            [session.id]: session,
          });
          const retainedIds = new Set(Object.keys(trimmedSessions));

          return {
            sessions: trimmedSessions,
            activeSessionId:
              state.activeSessionId && retainedIds.has(state.activeSessionId)
                ? state.activeSessionId
                : null,
            sessionStatuses: pruneRecord(state.sessionStatuses, retainedIds),
            sessionErrors: pruneRecord(state.sessionErrors, retainedIds),
          };
        });
      },
      removeSession: (sessionId) => {
        set((state) => {
          return {
            sessions: Object.fromEntries(
              Object.entries(state.sessions).filter(([id]) => id !== sessionId)
            ),
            sessionStatuses: Object.fromEntries(
              Object.entries(state.sessionStatuses).filter(([id]) => id !== sessionId)
            ),
            sessionErrors: Object.fromEntries(
              Object.entries(state.sessionErrors).filter(([id]) => id !== sessionId)
            ),
            activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
          };
        });
      },
      setActiveSessionId: (activeSessionId) => {
        set({ activeSessionId });
      },
      setSessionStatus: (sessionId, status) => {
        set((state) => ({
          sessionStatuses: {
            ...state.sessionStatuses,
            [sessionId]: status,
          },
        }));
      },
      setSessionError: (sessionId, error) => {
        set((state) => {
          if (error === null) {
            return {
              sessionErrors: Object.fromEntries(
                Object.entries(state.sessionErrors).filter(([id]) => id !== sessionId)
              ),
            };
          }

          return {
            sessionErrors: {
              ...state.sessionErrors,
              [sessionId]: error,
            },
          };
        });
      },
      clearSessionCaches: (sessionId) => {
        set((state) => {
          return {
            sessionStatuses: Object.fromEntries(
              Object.entries(state.sessionStatuses).filter(([id]) => id !== sessionId)
            ),
            sessionErrors: Object.fromEntries(
              Object.entries(state.sessionErrors).filter(([id]) => id !== sessionId)
            ),
          };
        });
      },
      clearAll: () => {
        set({
          sessions: {},
          activeSessionId: null,
          sessionStatuses: {},
          sessionErrors: {},
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);

export const useOcActiveSessionId = (): string | null =>
  useOcSessionStore((state) => state.activeSessionId);

export const useOcSessionList = (): OcSession[] =>
  useOcSessionStore(
    useShallow((state) =>
      Object.values(state.sessions).sort((left, right) => right.time.updated - left.time.updated)
    )
  );

export const useOcActiveSession = (): OcSession | null =>
  useOcSessionStore((state) =>
    state.activeSessionId ? (state.sessions[state.activeSessionId] ?? null) : null
  );

export const useOcActiveSessionStatus = (): OcSessionStatus | null =>
  useOcSessionStore((state) =>
    state.activeSessionId ? (state.sessionStatuses[state.activeSessionId] ?? null) : null
  );
