import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  Plus,
  SquareTerminal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import type { FC } from 'react';

import { ResizeHandle } from '@/components/layout/resize-handle';
import { useTerminalInstanceManager } from '@/hooks/use-terminal-instance-manager';
import { HEIGHTS } from '@/lib/constants';
import { useTerminalStore } from '@/stores/terminal-store';
import { useUIStore, useTerminalPosition } from '@/stores/ui-store';

interface TerminalPanelProps {
  /**
   * Whether this is a full-width panel (spans chat + activity) or embedded in activity panel
   */
  readonly variant: 'full-width' | 'embedded';
}

export const TerminalPanel: FC<TerminalPanelProps> = ({ variant }) => {
  const { bottomPanelHeight, toggleBottomPanel, cycleTerminalPosition } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const sessions = useTerminalStore((state) => state.sessions);
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const createSession = useTerminalStore((state) => state.createSession);
  const setActiveSession = useTerminalStore((state) => state.setActiveSession);
  const closeSession = useTerminalStore((state) => state.closeSession);

  const terminalManager = useTerminalInstanceManager();
  const terminalContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Create a default terminal session when panel opens
  useEffect(() => {
    if (sessions.length === 0) {
      createSession('Terminal');
    }
  }, [sessions.length, createSession]);

  // Create terminal instances for sessions
  useEffect(() => {
    if (!terminalManager.isInitialized()) return;

    for (const session of sessions) {
      if (!terminalManager.getInstance(session.id)) {
        terminalManager.createInstance(session.id, session.name);
      }
    }
  }, [sessions, terminalManager]);

  // Attach instances to containers and manage visibility
  useEffect(() => {
    if (!terminalManager.isInitialized()) return;

    const timeoutId = setTimeout(() => {
      for (const session of sessions) {
        const instance = terminalManager.getInstance(session.id);
        const container = terminalContainerRefs.current.get(session.id);

        if (instance && container) {
          instance.attachToElement(container);
          instance.setVisible(session.id === activeSessionId);
        }
      }
    }, 0);

    return () => { clearTimeout(timeoutId); };
  }, [sessions, activeSessionId, terminalManager]);

  // Callback to set container ref
  const setTerminalContainerRef = useCallback((sessionId: string, el: HTMLDivElement | null): void => {
    if (el) {
      terminalContainerRefs.current.set(sessionId, el);
      const instance = terminalManager.getInstance(sessionId);
      if (instance) {
        instance.attachToElement(el);
      }
    } else {
      terminalContainerRefs.current.delete(sessionId);
    }
  }, [terminalManager]);

  // ResizeObserver for terminal containers
  useEffect(() => {
    if (!activeSessionId) return;

    const container = terminalContainerRefs.current.get(activeSessionId);
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const instance = terminalManager.getInstance(activeSessionId);
        if (instance) {
          instance.layout(width, height);
        }
      }
    });

    observer.observe(container);
    return () => { observer.disconnect(); };
  }, [activeSessionId, terminalManager]);

  // Switch terminal with disableLayout to prevent expensive resize during DOM changes
  const handleSwitchTerminal = useCallback((newSessionId: string): void => {
    for (const session of sessions) {
      const instance = terminalManager.getInstance(session.id);
      if (instance) {
        instance.disableLayout = true;
      }
    }

    setActiveSession(newSessionId);

    requestAnimationFrame(() => {
      for (const session of sessions) {
        const instance = terminalManager.getInstance(session.id);
        if (instance) {
          instance.disableLayout = false;
        }
      }
    });
  }, [sessions, terminalManager, setActiveSession]);

  const handleCloseSession = useCallback((sessionId: string): void => {
    closeSession(sessionId);
    // Close panel if this was the last session
    if (sessions.length === 1) {
      toggleBottomPanel();
    }
  }, [closeSession, sessions.length, toggleBottomPanel]);

  const handleNewSession = useCallback((): void => {
    const id = createSession(`Terminal ${String(sessions.length + 1)}`);
    setActiveSession(id);
  }, [createSession, sessions.length, setActiveSession]);

  const isFullWidth = variant === 'full-width';
  const panelBackground = isFullWidth ? 'bg-background' : 'bg-card/30';
  const CycleIcon = terminalPosition === 'activity' ? ChevronsLeftRight : ChevronsRightLeft;
  const cycleTitle = terminalPosition === 'activity' ? 'Expand to full width' : 'Collapse to activity panel';

  return (
    <>
      <ResizeHandle direction="horizontal" target="bottom" />
      <div
        className={`${panelBackground} flex flex-col shrink-0`}
        style={{ height: bottomPanelHeight }}
      >
        <header
          className="flex items-center justify-between px-2 border-b border-border shrink-0"
          style={{ height: HEIGHTS.panelHeader }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <SquareTerminal className="h-4 w-4 text-muted-foreground shrink-0" />
            {/* Terminal tabs */}
            <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden flex-1 min-w-0 scrollbar-none pr-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative flex items-center px-2 py-0.5 text-xs rounded cursor-pointer shrink-0 ${
                    session.id === activeSessionId
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                  onClick={() => { handleSwitchTerminal(session.id); }}
                >
                  <span>{session.name}</span>
                  <button
                    className="ml-1 w-0 overflow-hidden opacity-0 group-hover:w-4 group-hover:opacity-100 transition-all duration-150 ease-out flex items-center justify-center hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseSession(session.id);
                    }}
                    title="Close terminal"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleNewSession}
              title="New Terminal"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onClick={cycleTerminalPosition}
              title={cycleTitle}
            >
              <CycleIcon className="h-4 w-4" />
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onClick={toggleBottomPanel}
              title="Close terminal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-hidden relative bg-sidebar">
          {/* Render ALL terminal containers - visibility controlled by manager */}
          {sessions.map((session) => (
            <div
              key={session.id}
              ref={(el) => { setTerminalContainerRef(session.id, el); }}
              className="absolute inset-0"
              style={{
                pointerEvents: session.id === activeSessionId ? 'auto' : 'none',
              }}
              onClick={() => {
                terminalManager.getInstance(session.id)?.focus();
              }}
            />
          ))}
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No terminal session
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};
