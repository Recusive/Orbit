import { Plus } from 'lucide-react';

import { TerminalSessionItem } from './terminal-session-item';

import type { TerminalSession } from './terminal-panel';
import type { FC } from 'react';

export interface TerminalSessionsProps {
  sessions: TerminalSession[];
  activeSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onCloseSession: (sessionId: string) => void;
  className?: string;
}

export const TerminalSessions: FC<TerminalSessionsProps> = ({
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewSession,
  onCloseSession,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col w-48 border-l border-border bg-muted/30 ${className}`}
    >
      <div className="flex items-center justify-between p-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase">
          Sessions
        </span>
        <button
          onClick={onNewSession}
          className="p-1 hover:bg-muted rounded transition-colors"
          title="New session"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => (
          <TerminalSessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={() => { onSessionSelect(session.id); }}
            onClose={() => { onCloseSession(session.id); }}
          />
        ))}
      </div>
    </div>
  );
};
