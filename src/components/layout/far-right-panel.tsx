import React from 'react';

// Fixed width terminal sessions panel
const FAR_RIGHT_PANEL_WIDTH = 150;

interface TerminalSession {
  id: string;
  name: string;
  isActive: boolean;
  hasActivity: boolean;
}

const TerminalSessionItem: React.FC<{
  session: TerminalSession;
  onClick: () => void;
}> = ({ session, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full px-3 py-2 text-left hover:bg-accent transition-colors rounded ${
      session.isActive ? 'bg-accent' : ''
    }`}
  >
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs font-medium truncate">{session.name}</span>
      {session.hasActivity ? <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> : null}
    </div>
    <div className="text-xs text-muted-foreground">Session {session.id}</div>
  </button>
);

export const FarRightPanel: React.FC = () => {
  const [sessions, setSessions] = React.useState<TerminalSession[]>([
    { id: '1', name: 'Main Terminal', isActive: true, hasActivity: false },
    { id: '2', name: 'Dev Server', isActive: false, hasActivity: true },
    { id: '3', name: 'Build Process', isActive: false, hasActivity: false },
  ]);

  const handleSessionClick = (sessionId: string): void => {
    setSessions((prev) =>
      prev.map((s) => ({ ...s, isActive: s.id === sessionId }))
    );
  };

  const handleNewSession = (): void => {
    const newId = (sessions.length + 1).toString();
    setSessions((prev) => [
      ...prev.map((s) => ({ ...s, isActive: false })),
      {
        id: newId,
        name: `Terminal ${newId}`,
        isActive: true,
        hasActivity: false,
      },
    ]);
  };

  return (
    <aside
      className="h-full bg-background border-l border-border flex flex-col"
      style={{ width: `${String(FAR_RIGHT_PANEL_WIDTH)}px` }}
    >
      {/* Header */}
      <div className="h-[40px] border-b border-border flex items-center justify-between px-3">
        <h3 className="text-xs font-semibold">Sessions</h3>
        <button
          onClick={handleNewSession}
          className="w-6 h-6 flex items-center justify-center hover:bg-accent rounded transition-colors"
          title="New Terminal Session"
          aria-label="New Terminal Session"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <TerminalSessionItem
            key={session.id}
            session={session}
            onClick={() => { handleSessionClick(session.id); }}
          />
        ))}
      </div>

      {/* Footer info */}
      <div className="border-t border-border px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </div>
      </div>
    </aside>
  );
};
