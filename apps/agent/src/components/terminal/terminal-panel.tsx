/**
 * TerminalPanel - xterm.js terminal with tabs and search
 *
 * NOTE: Header heights come from @/lib/utils/constants.
 * To change terminal header dimensions, update HEIGHTS in constants.ts.
 */
import {
  ChevronDown,
  ChevronUp,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Plus,
  Search,
  SquareTerminal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SearchOptions } from '@/components/terminal/terminal-search-bar';
import type { FC } from 'react';

import { TerminalContextMenu } from '@/components/terminal/terminal-context-menu';
import { TerminalSearchBar } from '@/components/terminal/terminal-search-bar';
import { ContextMenuTrigger } from '@/components/ui/context-menu';
import { useTerminalInstanceManager } from '@/hooks/terminal/use-terminal-instance-manager';
import { HEIGHTS } from '@/lib/utils/constants';
import { useTerminalStore } from '@/stores/terminal/terminal-store';
import { useUIStore, useTerminalPosition } from '@/stores/ui/ui-store';

// Terminal header uses headerBar height (35px) to match chat header
const TERMINAL_HEADER_HEIGHT = HEIGHTS.headerBar;

export interface TerminalPanelProps {
  /**
   * Whether this is a full-width panel (spans chat + activity) or embedded in activity panel
   */
  readonly variant: 'full-width' | 'embedded';
  /**
   * Whether the panel is collapsed (shows only header)
   */
  readonly collapsed?: boolean;
}

export const TerminalPanel: FC<TerminalPanelProps> = ({ variant, collapsed = false }) => {
  const { toggleBottomPanel, cycleTerminalPosition } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const sessions = useTerminalStore((state) => state.sessions);
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const createSession = useTerminalStore((state) => state.createSession);
  const setActiveSession = useTerminalStore((state) => state.setActiveSession);
  const closeSession = useTerminalStore((state) => state.closeSession);
  const renameSession = useTerminalStore((state) => state.renameSession);

  // State for inline tab renaming
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // State for search bar
  const [showSearch, setShowSearch] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const terminalManager = useTerminalInstanceManager();
  const terminalContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasCreatedInitialSession = useRef(false);

  // Create a default terminal session when panel opens (only once)
  useEffect(() => {
    if (sessions.length === 0 && !hasCreatedInitialSession.current) {
      hasCreatedInitialSession.current = true;
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

    return () => {
      clearTimeout(timeoutId);
    };
  }, [sessions, activeSessionId, terminalManager]);

  // Callback to set container ref
  const setTerminalContainerRef = useCallback(
    (sessionId: string, el: HTMLDivElement | null): void => {
      if (el) {
        terminalContainerRefs.current.set(sessionId, el);
        const instance = terminalManager.getInstance(sessionId);
        if (instance) {
          instance.attachToElement(el);
        }
      } else {
        terminalContainerRefs.current.delete(sessionId);
        // Detach terminal when container is removed (component unmount)
        // This ensures clean re-attachment when switching terminal positions
        const instance = terminalManager.getInstance(sessionId);
        if (instance) {
          instance.detachFromElement();
        }
      }
    },
    [terminalManager]
  );

  // ResizeObserver for terminal containers
  useEffect(() => {
    if (!activeSessionId) return;

    const container = terminalContainerRefs.current.get(activeSessionId);
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const instance = terminalManager.getInstance(activeSessionId);
      if (instance) {
        instance.layout();
      }
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [activeSessionId, terminalManager]);

  // Switch terminal with disableLayout to prevent expensive resize during DOM changes
  const handleSwitchTerminal = useCallback(
    (newSessionId: string): void => {
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
    },
    [sessions, terminalManager, setActiveSession]
  );

  const handleCloseSession = useCallback(
    (sessionId: string): void => {
      closeSession(sessionId);
      // Close panel if this was the last session
      if (sessions.length === 1) {
        toggleBottomPanel();
      }
    },
    [closeSession, sessions.length, toggleBottomPanel]
  );

  const handleNewSession = useCallback((): void => {
    const id = createSession(`Terminal ${String(sessions.length + 1)}`);
    setActiveSession(id);
  }, [createSession, sessions.length, setActiveSession]);

  const handleStartRename = useCallback((sessionId: string, currentName: string): void => {
    setEditingSessionId(sessionId);
    setEditValue(currentName);
  }, []);

  const handleFinishRename = useCallback(
    (sessionId: string): void => {
      renameSession(sessionId, editValue);
      setEditingSessionId(null);
      setEditValue('');
    },
    [renameSession, editValue]
  );

  const handleCancelRename = useCallback((): void => {
    setEditingSessionId(null);
    setEditValue('');
  }, []);

  // Context menu handlers
  const handleCopy = useCallback((): void => {
    if (!activeSessionId) return;
    const instance = terminalManager.getInstance(activeSessionId);
    if (instance) {
      instance.copySelection().catch(() => {
        // Silently fail if clipboard not available
      });
    }
  }, [activeSessionId, terminalManager]);

  const handlePaste = useCallback((): void => {
    if (!activeSessionId) return;
    const instance = terminalManager.getInstance(activeSessionId);
    if (instance) {
      instance.paste().catch(() => {
        // Silently fail if clipboard not available
      });
    }
  }, [activeSessionId, terminalManager]);

  const handleClear = useCallback((): void => {
    if (!activeSessionId) return;
    const instance = terminalManager.getInstance(activeSessionId);
    if (instance) {
      instance.clear();
    }
  }, [activeSessionId, terminalManager]);

  const handleRenameFromMenu = useCallback((): void => {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session) {
      handleStartRename(activeSessionId, session.customName ?? session.name);
    }
  }, [activeSessionId, sessions, handleStartRename]);

  const handleKillFromMenu = useCallback((): void => {
    if (activeSessionId) {
      handleCloseSession(activeSessionId);
    }
  }, [activeSessionId, handleCloseSession]);

  // Track if current terminal has selection (for context menu disabled state)
  const [hasSelection, setHasSelection] = useState(false);

  // Update selection state periodically
  useEffect(() => {
    if (!activeSessionId) return;

    const checkSelection = (): void => {
      const instance = terminalManager.getInstance(activeSessionId);
      if (instance) {
        setHasSelection(instance.hasSelection());
      }
    };

    // Check on interval (selection events are hard to track)
    const interval = setInterval(checkSelection, 200);
    return () => {
      clearInterval(interval);
    };
  }, [activeSessionId, terminalManager]);

  // Keyboard shortcut for search (Cmd+F / Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Check if terminal panel is focused (or its children)
      if (!panelRef.current?.contains(document.activeElement)) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Search handlers
  const handleFindNext = useCallback(
    (query: string, options: SearchOptions): boolean => {
      if (!activeSessionId) return false;
      const instance = terminalManager.getInstance(activeSessionId);
      if (!instance) return false;
      return instance.findNext(query, options);
    },
    [activeSessionId, terminalManager]
  );

  const handleFindPrevious = useCallback(
    (query: string, options: SearchOptions): boolean => {
      if (!activeSessionId) return false;
      const instance = terminalManager.getInstance(activeSessionId);
      if (!instance) return false;
      return instance.findPrevious(query, options);
    },
    [activeSessionId, terminalManager]
  );

  const handleClearSearch = useCallback((): void => {
    if (!activeSessionId) return;
    const instance = terminalManager.getInstance(activeSessionId);
    if (instance) {
      instance.clearSearch();
    }
  }, [activeSessionId, terminalManager]);

  const handleCloseSearch = useCallback((): void => {
    setShowSearch(false);
    // Focus terminal after closing search
    if (activeSessionId) {
      terminalManager.getInstance(activeSessionId)?.focus();
    }
  }, [activeSessionId, terminalManager]);

  const handleOpenSearch = useCallback((): void => {
    setShowSearch(true);
  }, []);

  const isFullWidth = variant === 'full-width';
  const panelBackground = isFullWidth ? 'bg-background' : 'bg-card/30';
  const CycleIcon = terminalPosition === 'activity' ? ChevronsLeftRight : ChevronsRightLeft;
  const cycleTitle =
    terminalPosition === 'activity' ? 'Expand to full width' : 'Collapse to activity panel';
  const ToggleIcon = collapsed ? ChevronUp : ChevronDown;

  return (
    <div
      ref={panelRef}
      className={`${panelBackground} relative z-10 flex flex-col border-l border-border/50 min-h-[35px] ${collapsed ? 'shrink-0' : 'h-full'}`}
      style={collapsed ? { height: TERMINAL_HEADER_HEIGHT } : undefined}
    >
      <header
        className="relative z-10 flex items-center justify-between px-2 shrink-0 border-t border-b border-border bg-sidebar"
        style={{ height: TERMINAL_HEADER_HEIGHT }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 h-full">
          <SquareTerminal className="h-4 w-4 text-muted-foreground shrink-0" />
          {/* Terminal tabs */}
          <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden flex-1 min-w-0 h-full scrollbar-none pr-4">
            {sessions.map((session) => {
              // Priority: custom name > foreground process > default name
              const displayName =
                session.customName ?? session.foregroundProcess?.name ?? session.name;
              const isEditing = editingSessionId === session.id;

              return (
                <div
                  key={session.id}
                  className={`group relative flex items-center px-2 py-0.5 text-xs rounded cursor-pointer shrink-0 ${
                    session.id === activeSessionId
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                  onClick={() => {
                    handleSwitchTerminal(session.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleStartRename(session.id, displayName);
                  }}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      className="bg-transparent border-none outline-none text-xs w-20 min-w-0"
                      value={editValue}
                      onChange={(e) => {
                        setEditValue(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleFinishRename(session.id);
                        } else if (e.key === 'Escape') {
                          handleCancelRename();
                        }
                        e.stopPropagation();
                      }}
                      onBlur={() => {
                        handleFinishRename(session.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      autoFocus
                    />
                  ) : (
                    <span title="Double-click to rename">{displayName}</span>
                  )}
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
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleOpenSearch}
            title="Find (Cmd+F)"
          >
            <Search className="h-4 w-4" />
          </button>
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
            title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
        </div>
      </header>
      {/* Search bar - conditionally rendered */}
      {!collapsed && showSearch ? (
        <TerminalSearchBar
          onFindNext={handleFindNext}
          onFindPrevious={handleFindPrevious}
          onClose={handleCloseSearch}
          onClear={handleClearSearch}
        />
      ) : null}
      {!collapsed ? (
        <TerminalContextMenu
          onCopy={handleCopy}
          onPaste={handlePaste}
          onClear={handleClear}
          onFind={handleOpenSearch}
          onRename={handleRenameFromMenu}
          onKill={handleKillFromMenu}
          hasSelection={hasSelection}
        >
          <ContextMenuTrigger asChild>
            <div className="flex-1 overflow-hidden relative bg-sidebar">
              {/* Render ALL terminal containers - visibility controlled by manager */}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  ref={(el) => {
                    setTerminalContainerRef(session.id, el);
                  }}
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
          </ContextMenuTrigger>
        </TerminalContextMenu>
      ) : null}
    </div>
  );
};
