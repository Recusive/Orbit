import { X, Terminal } from 'lucide-react';
import React from 'react';

import type { TerminalSession } from './terminal-panel';
import type { FC } from 'react';

export interface TerminalSessionItemProps {
  session: TerminalSession;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  className?: string;
}

export const TerminalSessionItem: FC<TerminalSessionItemProps> = ({
  session,
  isActive,
  onSelect,
  onClose,
  className = '',
}) => {
  const handleClose = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center justify-between p-2 cursor-pointer
        hover:bg-muted transition-colors group
        ${isActive ? 'bg-muted border-l-2 border-l-primary' : ''}
        ${className}
      `}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Terminal className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-medium truncate">{session.name}</span>
          <span className="text-xs text-muted-foreground">
            {session.createdAt.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
      <button
        onClick={handleClose}
        className="p-0.5 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Close session"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
};
