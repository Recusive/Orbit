/**
 * BottomPanel - Terminal and Problems panel with VS Code-style tabs
 *
 * Uses TerminalInstanceManager for xterm lifecycle management.
 * Terminals persist across tab switches - only destroyed on explicit close.
 */

import { Plus, X, Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import type { Diagnostic } from '@/lib/api';
import type { FC } from 'react';

import { DiagnosticsPanel } from '@/components/panels';
import { Button } from '@/components/ui/button';
import { useDiagnostics } from '@/hooks/lsp/use-diagnostics';
import { useTerminalInstanceManager } from '@/hooks/terminal/use-terminal-instance-manager';
import { readFile } from '@/lib/api';
import { HEIGHTS } from '@/lib/utils/constants';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useTerminalStore } from '@/stores/terminal/terminal-store';
import { useBottomPanelTab, useUIStore } from '@/stores/ui/ui-store';

interface BottomPanelProps {
  readonly height: number;
}

export const BottomPanel: FC<BottomPanelProps> = ({ height }) => {
  const { toggleBottomPanel, setBottomPanelTab } = useUIStore();
  const activeTab = useBottomPanelTab();
  const { sessions, activeSessionId, createSession, setActiveSession, closeSession } =
    useTerminalStore();
  const { totalErrors, totalWarnings } = useDiagnostics();
  const gotoPosition = useFileViewerStore((state) => state.gotoPosition);
  const openTabs = useFileViewerStore((state) => state.openTabs);

  // Get the terminal instance manager (singleton)
  const manager = useTerminalInstanceManager();

  // Handle diagnostic click - open file at the diagnostic location
  const handleDiagnosticClick = useCallback(
    async (path: string, diagnostic: Diagnostic): Promise<void> => {
      try {
        // Check if file is already open to avoid unnecessary read
        const existingTab = openTabs.find((tab) => tab.path === path);
        const content = existingTab?.content ?? (await readFile(path));

        // Navigate to the diagnostic location (0-indexed)
        gotoPosition(path, diagnostic.range.start.line, diagnostic.range.start.column, content);
      } catch (err) {
        console.error('[BottomPanel] Failed to open file for diagnostic:', err);
      }
    },
    [gotoPosition, openTabs]
  );

  // Track container refs for each session
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Create a default terminal session on mount if none exists
  useEffect(() => {
    if (sessions.length === 0) {
      createSession('Terminal');
    }
  }, [sessions.length, createSession]);

  // Create terminal instances for new sessions
  useEffect(() => {
    if (!manager.isInitialized()) return;

    for (const session of sessions) {
      // Create instance if it doesn't exist
      if (!manager.getInstance(session.id)) {
        manager.createInstance(session.id, session.name);
      }
    }
  }, [sessions, manager]);

  // Attach instances to containers and manage visibility
  useEffect(() => {
    if (!manager.isInitialized()) return;

    for (const session of sessions) {
      const instance = manager.getInstance(session.id);
      const container = containerRefs.current.get(session.id);

      if (instance && container) {
        // Attach to container (no-op if already attached)
        instance.attachToElement(container);
        // Set visibility based on whether this is the active session
        instance.setVisible(session.id === activeSessionId);
      }
    }
  }, [sessions, activeSessionId, manager]);

  // Handle creating a new terminal
  const handleNewTerminal = useCallback((): void => {
    const id = createSession(`Terminal ${String(sessions.length + 1)}`);
    setActiveSession(id);
  }, [createSession, sessions.length, setActiveSession]);

  // Handle closing a terminal - NOW properly destroys the PTY
  const handleCloseTerminal = useCallback(
    (sessionId: string): void => {
      // Destroy the terminal instance (sends terminal:close to backend)
      manager.destroyInstance(sessionId);
      // Remove from store (also handles activeSession switching)
      closeSession(sessionId);
    },
    [manager, closeSession]
  );

  // Set container ref callback
  const setContainerRef = useCallback((sessionId: string, el: HTMLDivElement | null): void => {
    if (el) {
      containerRefs.current.set(sessionId, el);
    } else {
      containerRefs.current.delete(sessionId);
    }
  }, []);

  return (
    <div className="w-full border-t border-border bg-card/30 flex flex-col" style={{ height }}>
      <header
        className="flex items-center justify-between px-2 border-b border-border shrink-0"
        style={{ height: HEIGHTS.panelHeader }}
      >
        <div className="flex items-center gap-4">
          {/* Main panel tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={(): void => {
                setBottomPanelTab('problems');
              }}
              className={`px-2 py-0.5 text-xs flex items-center gap-1.5 ${
                activeTab === 'problems'
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Problems
              {(totalErrors > 0 || totalWarnings > 0) && (
                <span
                  className={`text-xs px-1 rounded ${totalErrors > 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}
                >
                  {totalErrors + totalWarnings}
                </span>
              )}
            </button>
            <button
              onClick={(): void => {
                setBottomPanelTab('terminal');
              }}
              className={`px-2 py-0.5 text-xs ${
                activeTab === 'terminal'
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Terminal
            </button>
          </div>

          {/* Terminal session tabs (only visible when terminal tab is active) */}
          {activeTab === 'terminal' && (
            <div className="flex items-center gap-1 border-l border-border pl-2">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center">
                  <button
                    onClick={(): void => {
                      setActiveSession(session.id);
                    }}
                    className={`px-2 py-0.5 text-xs rounded-l ${
                      session.id === activeSessionId
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50'
                    }`}
                  >
                    {session.name}
                  </button>
                  {sessions.length > 1 && (
                    <button
                      onClick={(e): void => {
                        e.stopPropagation();
                        handleCloseTerminal(session.id);
                      }}
                      className={`px-1 py-0.5 text-xs rounded-r hover:bg-destructive/20 ${
                        session.id === activeSessionId
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground'
                      }`}
                      title="Close terminal"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeTab === 'terminal' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleNewTerminal}
              title="New Terminal"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-5 w-5">
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={toggleBottomPanel}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        {/* Problems panel */}
        {activeTab === 'problems' && (
          <DiagnosticsPanel className="h-full" onDiagnosticClick={handleDiagnosticClick} />
        )}

        {/* Terminal panel */}
        {activeTab === 'terminal' && (
          <>
            {/*
              All containers are ALWAYS rendered - xterm instances attach to them.
              Visibility is controlled by the manager via setVisible(), not React.
              This prevents PTY destruction on tab switch!
            */}
            {sessions.map((session) => (
              <div
                key={session.id}
                ref={(el): void => {
                  setContainerRef(session.id, el);
                }}
                className="absolute inset-0"
                onClick={(): void => {
                  // Focus terminal when clicking container
                  const instance = manager.getInstance(session.id);
                  instance?.focus();
                }}
              />
            ))}
            {sessions.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No terminal session
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
