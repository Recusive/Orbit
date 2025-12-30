import { useCallback, useEffect } from 'react';

import { useTerminalStore } from '../stores/terminal-store';
import { generateUUID } from '../types/protocol';

import { useTauri } from './use-tauri';

import type { TerminalSession, TerminalOutput } from '../stores/terminal-store';
import type {
  TerminalCreate,
  TerminalClose,
  TerminalCommand,
  TerminalClear,
} from '../types/protocol';

export interface UseTerminalReturn {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  activeSession: TerminalSession | undefined;
  createSession: (name?: string, cwd?: string) => string;
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  sendCommand: (command: string, sessionId?: string) => void;
  clearTerminal: (sessionId?: string) => void;
  getSessionOutput: (sessionId: string) => TerminalOutput[];
}

/**
 * Hook for terminal operations
 * Manages terminal sessions and command execution
 */
export function useTerminal(defaultSessionId?: string): UseTerminalReturn {
  const { postMessage } = useTauri();

  const sessions = useTerminalStore((state) => state.sessions);
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const createSessionStore = useTerminalStore((state) => state.createSession);
  const closeSessionStore = useTerminalStore((state) => state.closeSession);
  const setActiveSessionStore = useTerminalStore((state) => state.setActiveSession);
  const addOutput = useTerminalStore((state) => state.addOutput);
  const clearOutput = useTerminalStore((state) => state.clearOutput);

  // Set default active session on mount
  useEffect(() => {
    if (defaultSessionId) {
      const sessionExists = sessions.some((s) => s.id === defaultSessionId);
      if (sessionExists) {
        setActiveSessionStore(defaultSessionId);
      }
    }
  }, [defaultSessionId, sessions, setActiveSessionStore]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const createSession = useCallback(
    (name?: string, cwd?: string): string => {
      const sessionId = createSessionStore(name, cwd);

      // Notify VS Code
      postMessage({
        type: 'terminal:create',
        uuid: generateUUID(),
        session_id: sessionId,
        name,
        cwd,
      } satisfies TerminalCreate);

      return sessionId;
    },
    [postMessage, createSessionStore]
  );

  const closeSession = useCallback(
    (sessionId: string) => {
      // Find the session to get the terminalId
      const session = sessions.find((s) => s.id === sessionId);
      const terminalId = session?.terminalId;

      // Notify VS Code (only if we have a terminal ID)
      if (terminalId) {
        postMessage({
          type: 'terminal:close',
          uuid: generateUUID(),
          session_id: sessionId,
          terminal_id: terminalId,
        } satisfies TerminalClose);
      }

      closeSessionStore(sessionId);
    },
    [postMessage, closeSessionStore, sessions]
  );

  const setActiveSession = useCallback(
    (sessionId: string | null) => {
      setActiveSessionStore(sessionId);
    },
    [setActiveSessionStore]
  );

  const sendCommand = useCallback(
    (command: string, sessionId?: string) => {
      const targetSessionId = sessionId ?? activeSessionId;

      if (!targetSessionId) {
        console.warn('No active terminal session');
        return;
      }

      const sessionExists = sessions.some((s) => s.id === targetSessionId);
      if (!sessionExists) {
        console.warn(`Terminal session not found: ${targetSessionId}`);
        return;
      }

      // Add command to output
      addOutput(targetSessionId, {
        type: 'stdin',
        content: `$ ${command}`,
      });

      // Send to VS Code
      postMessage({
        type: 'terminal:command',
        uuid: generateUUID(),
        session_id: targetSessionId,
        command,
      } satisfies TerminalCommand);
    },
    [postMessage, activeSessionId, sessions, addOutput]
  );

  const clearTerminal = useCallback(
    (sessionId?: string) => {
      const targetSessionId = sessionId ?? activeSessionId;

      if (!targetSessionId) {
        console.warn('No active terminal session to clear');
        return;
      }

      clearOutput(targetSessionId);

      // Notify VS Code
      postMessage({
        type: 'terminal:clear',
        uuid: generateUUID(),
        session_id: targetSessionId,
      } satisfies TerminalClear);
    },
    [clearOutput, activeSessionId, postMessage]
  );

  const getSessionOutput = useCallback(
    (sessionId: string): TerminalOutput[] => {
      const session = sessions.find((s) => s.id === sessionId);
      return session?.output ?? [];
    },
    [sessions]
  );

  return {
    sessions,
    activeSessionId,
    activeSession,
    createSession,
    closeSession,
    setActiveSession,
    sendCommand,
    clearTerminal,
    getSessionOutput,
  };
}
