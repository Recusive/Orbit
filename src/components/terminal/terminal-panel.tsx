import { useState, useCallback } from 'react';

import { TerminalInstance } from './terminal-instance';
import { TerminalSessions } from './terminal-sessions';

import type { FC } from 'react';

export interface TerminalSession {
  id: string;
  name: string;
  createdAt: Date;
  isActive: boolean;
}

export interface TerminalPanelProps {
  className?: string;
  defaultHeight?: number;
}

export const TerminalPanel: FC<TerminalPanelProps> = ({
  className = '',
  defaultHeight = 300,
}) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([
    {
      id: '1',
      name: 'zsh',
      createdAt: new Date(),
      isActive: true,
    },
  ]);

  const [activeSessionId, setActiveSessionId] = useState<string>('1');

  const handleSessionSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setSessions((prev) =>
      prev.map((session) => ({
        ...session,
        isActive: session.id === sessionId,
      }))
    );
  }, []);

  const handleNewSession = useCallback(() => {
    const newSession: TerminalSession = {
      id: Date.now().toString(),
      name: 'zsh',
      createdAt: new Date(),
      isActive: false,
    };
    setSessions((prev) => [...prev, newSession]);
  }, []);

  const handleCloseSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      if (filtered.length === 0) {
        // Create a new default session if closing the last one
        return [
          {
            id: Date.now().toString(),
            name: 'zsh',
            createdAt: new Date(),
            isActive: true,
          },
        ];
      }
      return filtered;
    });
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div
      className={`flex border-t border-border bg-background ${className}`}
      style={{ height: defaultHeight }}
    >
      <div className="flex-1 min-w-0">
        {activeSession ? <TerminalInstance
            key={activeSession.id}
            sessionId={activeSession.id}
            sessionName={activeSession.name}
          /> : null}
      </div>
      <TerminalSessions
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
        onCloseSession={handleCloseSession}
      />
    </div>
  );
};
