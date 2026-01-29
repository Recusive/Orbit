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
  Terminal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { SearchOptions } from '@/components/terminal/terminal-search-bar';
import type { FC } from 'react';

import { TerminalContextMenu } from '@/components/terminal/terminal-context-menu';
import { TerminalSearchBar } from '@/components/terminal/terminal-search-bar';
import { ContextMenuTrigger } from '@/components/ui/context-menu';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTerminalInstanceManager } from '@/hooks/terminal/use-terminal-instance-manager';
import { cn, getCommandKey, HEIGHTS } from '@/lib/utils';
import { useTerminalStore } from '@/stores/terminal/terminal-store';
import {
  useUIStore,
  useTerminalPosition,
  useWorkspacePath,
  useActiveTab,
} from '@/stores/ui/ui-store';

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
  /**
   * Which mode this terminal panel belongs to. Used to re-attach when switching modes.
   * Defaults to 'agent' for backwards compatibility.
   */
  readonly mode?: 'agent' | 'editor';
}

export const TerminalPanel: FC<TerminalPanelProps> = ({
  variant,
  collapsed = false,
  mode = 'agent',
}) => {
  // Use useShallow to prevent re-renders when unrelated store state changes
  const { toggleBottomPanel, cycleTerminalPosition } = useUIStore(
    useShallow((s) => ({
      toggleBottomPanel: s.toggleBottomPanel,
      cycleTerminalPosition: s.cycleTerminalPosition,
    }))
  );
  const terminalPosition = useTerminalPosition();
  const activeTab = useActiveTab();
  const workspacePath = useWorkspacePath();

  // Use useShallow for terminal store multi-value picks
  const {
    sessions,
    activeSessionId,
    createSession,
    setActiveSession,
    closeSession,
    renameSession,
  } = useTerminalStore(
    useShallow((s) => ({
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      createSession: s.createSession,
      setActiveSession: s.setActiveSession,
      closeSession: s.closeSession,
      renameSession: s.renameSession,
    }))
  );

  // State for inline tab renaming
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // State for search bar
  const [showSearch, setShowSearch] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const terminalManager = useTerminalInstanceManager();
  const terminalContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasCreatedInitialSession = useRef(false);
  const previousWorkspacePath = useRef(workspacePath);

  // Reset hasCreatedInitialSession when workspace changes, so if all terminals are
  // closed, a new one will be created in the new workspace.
  // Existing terminals keep their original cwd - they are not affected.
  useEffect(() => {
    if (previousWorkspacePath.current !== workspacePath) {
      hasCreatedInitialSession.current = false;
      previousWorkspacePath.current = workspacePath;
    }
  }, [workspacePath]);

  // Create a default terminal session when panel opens (only once per workspace)
  // NOTE: If workspace changes after initial session creation, existing sessions
  // keep their original cwd. This is intentional - users expect terminal cwd to persist.
  useEffect(() => {
    if (sessions.length === 0 && !hasCreatedInitialSession.current) {
      hasCreatedInitialSession.current = true;
      createSession('Terminal', workspacePath ?? undefined);
    }
  }, [sessions.length, createSession, workspacePath]);

  // Create terminal instances for sessions
  useEffect(() => {
    if (!terminalManager.isInitialized()) return;

    for (const session of sessions) {
      if (!terminalManager.getInstance(session.id)) {
        terminalManager.createInstance(session.id, session.name, session.cwd);
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

  // Re-attach terminals when this mode becomes active (switching between Agent/Editor)
  // This is needed because React refs don't re-fire for already-mounted components
  // Using requestAnimationFrame for smoother visual transitions vs setTimeout
  const isThisModeActive = activeTab === mode;
  useEffect(() => {
    if (!isThisModeActive || collapsed) return;
    if (!terminalManager.isInitialized()) return;

    // Use RAF to ensure DOM has updated after mode switch
    // cancelAnimationFrame in cleanup prevents redundant attach operations during rapid switches
    const rafId = requestAnimationFrame(() => {
      for (const session of sessions) {
        const instance = terminalManager.getInstance(session.id);
        const container = terminalContainerRefs.current.get(session.id);

        if (instance && container) {
          instance.attachToElement(container);
          instance.setVisible(session.id === activeSessionId);
        }
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isThisModeActive, collapsed, sessions, activeSessionId, terminalManager, mode]);

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

  // ResizeObserver for panel - observe panelRef instead of terminal wrapper
  // This ensures resize events are captured when the Allotment panel changes size,
  // which propagates more reliably than observing the terminal wrapper with height: 100%
  //
  // PERF: Debounced with RAF to avoid calling expensive fitAddon.fit() on every
  // frame during sidebar animation. The terminal only needs final dimensions.
  useEffect(() => {
    if (!activeSessionId || collapsed) return;

    const panel = panelRef.current;
    if (!panel) return;

    let rafId: number | null = null;

    const observer = new ResizeObserver(() => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const instance = terminalManager.getInstance(activeSessionId);
        if (instance) {
          instance.layout();
        }
      });
    });

    observer.observe(panel);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [activeSessionId, terminalManager, collapsed]);

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
    const id = createSession(`Terminal ${String(sessions.length + 1)}`, workspacePath ?? undefined);
    setActiveSession(id);
  }, [createSession, sessions.length, setActiveSession, workspacePath]);

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
  // Uses a ref to store the latest value to avoid re-renders during polling
  const hasSelectionRef = useRef(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isContextMenuHovered, setIsContextMenuHovered] = useState(false);

  // Only poll selection state when context menu is open or being hovered
  // This avoids unnecessary CPU usage when the menu isn't visible
  useEffect(() => {
    if (!activeSessionId || !isContextMenuHovered) return;

    const checkSelection = (): void => {
      const instance = terminalManager.getInstance(activeSessionId);
      if (instance) {
        const newValue = instance.hasSelection();
        if (newValue !== hasSelectionRef.current) {
          hasSelectionRef.current = newValue;
          setHasSelection(newValue);
        }
      }
    };

    // Check immediately when menu opens
    checkSelection();

    // Then poll while menu is open
    const interval = setInterval(checkSelection, 200);
    return () => {
      clearInterval(interval);
    };
  }, [activeSessionId, terminalManager, isContextMenuHovered]);

  // Context menu hover handlers to enable polling
  const handleContextMenuOpenChange = useCallback(
    (open: boolean): void => {
      setIsContextMenuHovered(open);
      // Immediately check selection when opening
      if (open && activeSessionId) {
        const instance = terminalManager.getInstance(activeSessionId);
        if (instance) {
          const newValue = instance.hasSelection();
          hasSelectionRef.current = newValue;
          setHasSelection(newValue);
        }
      }
    },
    [activeSessionId, terminalManager]
  );

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
      className={cn(
        panelBackground,
        'relative z-10 flex flex-col min-h-[35px]',
        isFullWidth ? 'border-l border-border' : 'border-l border-border/50',
        collapsed ? 'shrink-0' : 'h-full'
      )}
      style={collapsed ? { height: TERMINAL_HEADER_HEIGHT } : undefined}
    >
      <header
        className="relative z-10 flex items-center justify-between px-2 shrink-0 border-t border-b border-divider bg-sidebar"
        style={{ height: TERMINAL_HEADER_HEIGHT }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 h-full">
          <Tooltip>
            <TooltipTrigger asChild>
              <Terminal className="h-4 w-4 text-muted-foreground shrink-0 cursor-default" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              <span>Terminal</span>
              <KbdGroup>
                <Kbd className="bg-white/15 text-inherit border-white/20">{getCommandKey()}</Kbd>
                <Kbd className="bg-white/15 text-inherit border-white/20">J</Kbd>
              </KbdGroup>
            </TooltipContent>
          </Tooltip>
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
                  className={`group relative flex items-center px-3 py-1 text-sm rounded cursor-pointer shrink-0 ${
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
                      className="bg-transparent border-none outline-none text-sm w-20 min-w-0"
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
                    className="ml-1 w-0 overflow-hidden opacity-0 group-hover:w-4 group-hover:opacity-100 transition-[width,opacity,color] duration-150 ease-out flex items-center justify-center hover:text-foreground"
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
          onOpenChange={handleContextMenuOpenChange}
        >
          <ContextMenuTrigger asChild>
            {/* VS Code container hierarchy: outer → groups → split-pane → wrapper */}
            <div className="terminal-outer-container flex-1 overflow-hidden">
              <div className="terminal-groups-container">
                {/* Render ALL terminals - use display:none (not pointerEvents) to properly
                    hide inactive terminals. This prevents layout calculations on hidden
                    terminals and improves performance. */}
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="terminal-split-pane"
                    style={{
                      display: session.id === activeSessionId ? 'block' : 'none',
                    }}
                  >
                    <div
                      ref={(el) => {
                        setTerminalContainerRef(session.id, el);
                      }}
                      className={cn('terminal-wrapper', session.id === activeSessionId && 'active')}
                      onClick={() => {
                        terminalManager.getInstance(session.id)?.focus();
                      }}
                    />
                  </div>
                ))}
                {sessions.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No terminal session
                  </div>
                ) : null}
              </div>
            </div>
          </ContextMenuTrigger>
        </TerminalContextMenu>
      ) : null}
    </div>
  );
};
