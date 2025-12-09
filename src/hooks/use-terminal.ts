import { useCallback, useEffect } from 'react';

import { useTerminalStore } from '../stores/terminal-store';

import { useVSCode } from './use-vscode';

import type { TerminalSession, TerminalOutput } from '../stores/terminal-store';

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
  const { sendMessage } = useVSCode();

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
      sendMessage({
        type: 'terminal.createSession',
        sessionId,
        name: name ?? `Terminal`,
        cwd,
        timestamp: Date.now(),
      });

      return sessionId;
    },
    [sendMessage, createSessionStore]
  );

  const closeSession = useCallback(
    (sessionId: string) => {
      // Notify VS Code
      sendMessage({
        type: 'terminal.closeSession',
        sessionId,
        timestamp: Date.now(),
      });

      closeSessionStore(sessionId);
    },
    [sendMessage, closeSessionStore]
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
      sendMessage({
        type: 'terminal.sendCommand',
        sessionId: targetSessionId,
        command,
        timestamp: Date.now(),
      });
    },
    [sendMessage, activeSessionId, sessions, addOutput]
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
      sendMessage({
        type: 'terminal.clear',
        sessionId: targetSessionId,
        timestamp: Date.now(),
      });
    },
    [clearOutput, activeSessionId, sendMessage]
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
