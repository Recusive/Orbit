/**
 * MissionsRightSidebar
 * Right sidebar for missions mode - shows agent config and execution log
 * Floating overlay style matching WorkflowRightSidebar pattern
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { selectActiveRightPanel, useMissionsStore, useMissionsUIStore } from '../stores';
import { AGENT_MODEL_CONFIGS } from '../types';

import type { AgentModel, MissionRightPanelTab } from '../types';

// ============================================================================
// Constants
// ============================================================================

const FLOATING_GAP = 8;
const FLOATING_RADIUS = 16;
const TOOLBAR_CLEARANCE = 48;

const SIDEBAR_ANIMATION = {
  duration: 280,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 500;

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--card)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    overflow: 'hidden',
    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 16px -4px rgba(0, 0, 0, 0.06)',
    backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 60px)',
  },
  resizeHandle: {
    position: 'absolute' as const,
    top: 0,
    left: -4,
    width: 8,
    height: '100%',
    cursor: 'ew-resize',
    backgroundColor: 'transparent',
    zIndex: 10,
    transition: `all 150ms ${EASE_OUT}`,
  },
  resizeHandleActive: {
    backgroundColor: 'var(--primary)',
    opacity: 0.6,
  },
  widthIndicator: {
    position: 'absolute' as const,
    top: 8,
    left: 8,
    padding: '6px 10px',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 8,
    zIndex: 20,
    pointerEvents: 'none' as const,
    fontFamily: 'monospace',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
  },
  tab: {
    flex: 1,
    padding: 12,
    border: 'none',
    background: 'transparent',
    color: 'var(--muted-foreground)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  tabHover: {
    backgroundColor: 'var(--muted)',
  },
  tabActive: {
    color: 'var(--foreground)',
    borderBottom: '2px solid var(--primary)',
    marginBottom: -1,
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
  empty: {
    padding: '32px 16px',
    textAlign: 'center' as const,
    color: 'var(--muted-foreground)',
    fontSize: 13,
  },
  emptyHint: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  config: {
    padding: 16,
  },
  configSection: {
    marginBottom: 20,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--muted-foreground)',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: 13,
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: `border-color 200ms ${EASE_OUT}`,
  },
  inputFocus: {
    borderColor: 'var(--primary)',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: `border-color 200ms ${EASE_OUT}`,
  },
  modelGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  modelBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    padding: '10px 12px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--background)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: `all 200ms ${EASE_OUT}`,
  },
  modelBtnHover: {
    backgroundColor: 'var(--muted)',
  },
  modelBtnActive: {
    borderColor: 'var(--primary)',
    backgroundColor: 'var(--muted)',
  },
  modelName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--foreground)',
  },
  modelDesc: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    marginTop: 2,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--foreground)',
    cursor: 'pointer',
  },
  log: {
    padding: 16,
  },
  logSection: {
    marginBottom: 16,
  },
  logOutput: {
    padding: 12,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--background)',
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--foreground)',
    maxHeight: 300,
    overflow: 'auto',
    whiteSpace: 'pre-wrap' as const,
    wordWrap: 'break-word' as const,
  },
  logEmpty: {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic' as const,
  },
  cursor: {
    color: 'var(--primary)',
    animation: 'cursor-blink 1s step-end infinite',
  },
  logError: {
    padding: '10px 12px',
    borderRadius: 6,
    background: 'var(--destructive)',
    color: 'white',
    fontSize: 12,
    marginBottom: 16,
  },
  logStats: {
    display: 'flex',
    gap: 16,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--muted-foreground)',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--foreground)',
  },
  history: {
    padding: 16,
  },
  historyItem: {
    padding: 12,
    border: '1px solid var(--border)',
    borderRadius: 8,
    marginBottom: 8,
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyNum: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
  },
  historyStatus: {
    fontSize: 11,
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: 4,
    textTransform: 'uppercase' as const,
  },
  historyStatusCompleted: {
    background: 'var(--green-500)',
    color: 'white',
  },
  historyStatusFailed: {
    background: 'var(--destructive)',
    color: 'white',
  },
  historyStatusRunning: {
    background: 'var(--blue-500)',
    color: 'white',
  },
  historyStats: {
    display: 'flex',
    gap: 6,
    fontSize: 12,
    color: 'var(--muted-foreground)',
  },
  historyError: {
    marginTop: 8,
    padding: 8,
    borderRadius: 4,
    background: 'var(--destructive)',
    color: 'white',
    fontSize: 11,
  },
};

// ============================================================================
// Tab Button
// ============================================================================

interface TabButtonProps {
  readonly tab: MissionRightPanelTab;
  readonly activeTab: MissionRightPanelTab;
  readonly label: string;
  readonly onClick: (tab: MissionRightPanelTab) => void;
}

function TabButton({ tab, activeTab, label, onClick }: TabButtonProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const isActive = tab === activeTab;

  return (
    <button
      style={{
        ...styles.tab,
        ...(isHovered && !isActive ? styles.tabHover : {}),
        ...(isActive ? styles.tabActive : {}),
      }}
      onClick={() => {
        onClick(tab);
      }}
      onMouseEnter={(): void => {
        setIsHovered(true);
      }}
      onMouseLeave={(): void => {
        setIsHovered(false);
      }}
    >
      {label}
    </button>
  );
}

// ============================================================================
// Config Panel
// ============================================================================

function ConfigPanel(): React.JSX.Element {
  const focusedAgentId = useMissionsStore((s) => s.focusedAgentId);
  const agents = useMissionsStore((s) => s.agents);
  const updateAgent = useMissionsStore((s) => s.updateAgent);
  const [hoveredModel, setHoveredModel] = useState<AgentModel | null>(null);

  const agent = focusedAgentId !== null ? agents[focusedAgentId] : undefined;

  if (agent === undefined) {
    return (
      <div style={styles.empty}>
        <p>Select an agent to configure</p>
      </div>
    );
  }

  const handleModelChange = (model: AgentModel): void => {
    updateAgent(agent.id, { config: { ...agent.config, model } });
  };

  return (
    <div style={styles.config}>
      <div style={styles.configSection}>
        <label style={styles.label}>Agent Name</label>
        <input
          type="text"
          style={styles.input}
          value={agent.name}
          onChange={(e) => {
            updateAgent(agent.id, { name: e.target.value });
          }}
        />
      </div>

      <div style={styles.configSection}>
        <label style={styles.label}>Model</label>
        <div style={styles.modelGrid}>
          {Object.values(AGENT_MODEL_CONFIGS).map((config) => {
            const isActive = config.model === agent.config.model;
            const isHovered = config.model === hoveredModel;

            return (
              <button
                key={config.model}
                style={{
                  ...styles.modelBtn,
                  ...(isHovered && !isActive ? styles.modelBtnHover : {}),
                  ...(isActive ? styles.modelBtnActive : {}),
                }}
                onClick={() => {
                  handleModelChange(config.model);
                }}
                onMouseEnter={(): void => {
                  setHoveredModel(config.model);
                }}
                onMouseLeave={(): void => {
                  setHoveredModel(null);
                }}
              >
                <span style={styles.modelName}>{config.label}</span>
                <span style={styles.modelDesc}>{config.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.configSection}>
        <label style={styles.label}>System Prompt (Optional)</label>
        <textarea
          style={styles.textarea}
          value={agent.config.systemPrompt ?? ''}
          onChange={(e) => {
            updateAgent(agent.id, {
              config: { ...agent.config, systemPrompt: e.target.value },
            });
          }}
          placeholder="Optional system instructions for this agent..."
          rows={4}
        />
      </div>

      <div style={styles.configSection}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={agent.inheritParentContext}
            onChange={(e) => {
              updateAgent(agent.id, { inheritParentContext: e.target.checked });
            }}
          />
          <span>Inherit context from parent agents</span>
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// Log Panel
// ============================================================================

function LogPanel(): React.JSX.Element {
  const focusedAgentId = useMissionsStore((s) => s.focusedAgentId);
  const agents = useMissionsStore((s) => s.agents);

  const agent = focusedAgentId !== null ? agents[focusedAgentId] : undefined;

  if (agent === undefined) {
    return (
      <div style={styles.empty}>
        <p>Select an agent to view execution log</p>
      </div>
    );
  }

  const { execution } = agent;
  const hasOutput = execution.currentOutput.length > 0;

  return (
    <div style={styles.log}>
      {/* Current Output */}
      <div style={styles.logSection}>
        <label style={styles.label}>Current Output</label>
        <div style={styles.logOutput}>
          {hasOutput ? (
            <>
              {execution.currentOutput}
              {(execution.status === 'streaming' || execution.status === 'running') && (
                <span style={styles.cursor}>|</span>
              )}
            </>
          ) : (
            <span style={styles.logEmpty}>No output yet</span>
          )}
        </div>
      </div>

      {/* Error */}
      {execution.status === 'error' && execution.errorMessage !== undefined && (
        <div style={styles.logError}>
          <strong>Error:</strong> {execution.errorMessage}
        </div>
      )}

      {/* Last Result Stats */}
      {execution.lastResult !== undefined && (
        <div style={styles.logStats}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Tokens</span>
            <span style={styles.statValue}>{execution.lastResult.tokensUsed}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Duration</span>
            <span style={styles.statValue}>{execution.lastResult.durationMs}ms</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// History Panel
// ============================================================================

function HistoryPanel(): React.JSX.Element {
  const activeMission = useMissionsStore((s) => s.activeMission);

  if (activeMission === null) {
    return (
      <div style={styles.empty}>
        <p>No active mission</p>
      </div>
    );
  }

  const { runHistory } = activeMission;

  if (runHistory.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No execution history yet</p>
        <p style={styles.emptyHint}>Run the mission to see results here</p>
      </div>
    );
  }

  return (
    <div style={styles.history}>
      {runHistory.map((run, index) => (
        <div key={run.id} style={styles.historyItem}>
          <div style={styles.historyHeader}>
            <span style={styles.historyNum}>#{String(runHistory.length - index)}</span>
            <span
              style={{
                ...styles.historyStatus,
                ...(run.status === 'completed' ? styles.historyStatusCompleted : {}),
                ...(run.status === 'failed' ? styles.historyStatusFailed : {}),
                ...(run.status === 'running' ? styles.historyStatusRunning : {}),
              }}
            >
              {run.status}
            </span>
          </div>
          <div style={styles.historyStats}>
            <span>{run.totalTokensUsed} tokens</span>
            <span>&bull;</span>
            <span>{run.totalDurationMs}ms</span>
          </div>
          {run.error !== undefined && <div style={styles.historyError}>{run.error}</div>}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MissionsRightSidebar(): React.JSX.Element | null {
  // UI store state
  const activeTab = useMissionsUIStore(selectActiveRightPanel);
  const setActiveTab = useMissionsUIStore((s) => s.setActiveRightPanel);
  const rightSidebarWidth = useMissionsUIStore((s) => s.rightSidebarWidth);
  const isCollapsed = useMissionsUIStore((s) => s.rightSidebarCollapsed);
  const setRightSidebarWidth = useMissionsUIStore((s) => s.setRightSidebarWidth);

  // Local state
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeDoubleClick = useCallback((): void => {
    setRightSidebarWidth(320); // Default width
  }, [setRightSidebarWidth]);

  // Resize effect
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (containerRef.current === null) return;
      const parentRect = containerRef.current.parentElement?.getBoundingClientRect();
      if (parentRect === undefined) return;

      // For right sidebar: width = right edge - mouse position
      const newWidth = parentRect.right - e.clientX;
      const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth));
      setRightSidebarWidth(clampedWidth);
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return (): void => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, setRightSidebarWidth]);

  // Animation settings
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationDuration = prefersReducedMotion ? 0 : SIDEBAR_ANIMATION.duration;

  // Wrapper style - floating overlay (right side)
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    top: TOOLBAR_CLEARANCE,
    right: FLOATING_GAP,
    bottom: FLOATING_GAP,
    width: rightSidebarWidth,
    zIndex: 50,
    transform: isCollapsed
      ? `translateX(${String(rightSidebarWidth + FLOATING_GAP + 10)}px)`
      : 'translateX(0)',
    willChange: 'transform',
    transition: `transform ${String(animationDuration)}ms ${SIDEBAR_ANIMATION.easing}`,
    pointerEvents: isCollapsed ? 'none' : 'auto',
  };

  // Container style
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    position: 'relative',
    width: '100%',
    height: '100%',
  };

  return (
    <div style={wrapperStyle}>
      <div ref={containerRef} style={containerStyle}>
        {/* Resize Handle */}
        <div
          style={{
            ...styles.resizeHandle,
            ...(isResizeHovered || isResizing ? styles.resizeHandleActive : {}),
          }}
          onMouseDown={handleResizeStart}
          onMouseEnter={(): void => {
            setIsResizeHovered(true);
          }}
          onMouseLeave={(): void => {
            setIsResizeHovered(false);
          }}
          onDoubleClick={handleResizeDoubleClick}
          title="Drag to resize (double-click to reset)"
        />
        {isResizing ? (
          <div style={styles.widthIndicator}>{Math.round(rightSidebarWidth)}px</div>
        ) : null}

        {/* Tabs */}
        <div style={styles.tabs}>
          <TabButton tab="config" activeTab={activeTab} label="Config" onClick={setActiveTab} />
          <TabButton tab="log" activeTab={activeTab} label="Log" onClick={setActiveTab} />
          <TabButton tab="history" activeTab={activeTab} label="History" onClick={setActiveTab} />
        </div>

        {/* Panel Content */}
        <div style={styles.content}>
          {activeTab === 'config' && <ConfigPanel />}
          {activeTab === 'log' && <LogPanel />}
          {activeTab === 'history' && <HistoryPanel />}
        </div>
      </div>
    </div>
  );
}
