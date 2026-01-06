/**
 * AgentChatPanel - Premium floating chat panel for agent interaction
 *
 * Design philosophy:
 * - Starts minimized as a sleek pill button with grip indicator
 * - Expands into full chat with smooth animation
 * - Glass morphism aesthetic with refined depth
 * - Clear drag affordance with grip dots
 * - Polished transitions between states
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

import { useAgentChat } from '../../hooks/agent/useAgentChat';
import {
  spacing,
  radii,
  fontSize,
  fontWeight,
  letterSpacing,
  shadows,
  motion,
  components,
  zIndex,
} from '../../lib/design/designTokens';
import { OrchestratorProgress } from '../../orchestrator/OrchestratorProgress';
import { useOrchestratorStatus } from '../../orchestrator/useOrchestratorStatus';
import { ChatInput } from '../chat/ChatInput';
import { ChatMessageList } from '../chat/ChatMessageList';

import { AgentStatusBadge } from './AgentStatusBadge';

export type PanelState = 'minimized' | 'open';

interface Position {
  x: number;
  y: number;
}

export interface AgentChatPanelProps {
  initialState?: PanelState;
  hideWhenMinimized?: boolean;
}

// =============================================================================
// ICONS
// =============================================================================

const ExpandIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="7 17 17 7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
);

const MinimizeIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="17 7 7 17" />
    <polyline points="17 17 7 17 7 7" />
  </svg>
);

// Grip dots for drag indicator
const GripDotsIcon = (): React.JSX.Element => (
  <svg width="8" height="16" viewBox="0 0 8 16" fill="currentColor">
    <circle cx="2" cy="2" r="1.5" opacity="0.5" />
    <circle cx="6" cy="2" r="1.5" opacity="0.5" />
    <circle cx="2" cy="8" r="1.5" opacity="0.5" />
    <circle cx="6" cy="8" r="1.5" opacity="0.5" />
    <circle cx="2" cy="14" r="1.5" opacity="0.5" />
    <circle cx="6" cy="14" r="1.5" opacity="0.5" />
  </svg>
);

// =============================================================================
// STYLES
// =============================================================================

const pillStyles = `
	@keyframes agent-fade-scale-in {
		from { opacity: 0; transform: scale(0.9); }
		to { opacity: 1; transform: scale(1); }
	}
	.agent-pill {
		transition: box-shadow 0.2s ease, transform 0.15s ease;
	}
	.agent-pill:hover {
		box-shadow: 0 4px 24px rgba(34, 197, 94, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2) !important;
	}
	.agent-pill-expand:hover {
		background-color: var(--accent) !important;
		color: var(--foreground) !important;
	}
	.agent-pill-expand:active {
		transform: scale(0.92);
	}
	.agent-pill.dragging {
		box-shadow: 0 8px 32px rgba(34, 197, 94, 0.25), 0 4px 16px rgba(0, 0, 0, 0.3) !important;
		transform: scale(1.02);
	}
`;

const panelStyles = `
	@keyframes agent-slide-up {
		from { opacity: 0; transform: translateY(20px) scale(0.98); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}
	.agent-panel {
		transition: box-shadow 0.2s ease;
	}
	.agent-panel.dragging {
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.2) !important;
	}
	.agent-panel-btn {
		transition: all 0.15s ease;
	}
	.agent-panel-btn:hover {
		background-color: var(--accent) !important;
		color: var(--foreground) !important;
	}
	.agent-panel-btn:active {
		background-color: var(--muted) !important;
		transform: scale(0.92);
	}
	.agent-panel-drag-area {
		cursor: grab;
	}
	.agent-panel-drag-area:active {
		cursor: grabbing;
	}
	.agent-panel.dragging .agent-panel-drag-area {
		cursor: grabbing;
	}
`;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AgentChatPanel({
  initialState = 'minimized',
  hideWhenMinimized = false,
}: AgentChatPanelProps): React.JSX.Element | null {
  const [panelState, setPanelState] = useState<PanelState>(initialState);
  const [isAnimating, setIsAnimating] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const { messages, status, sendMessage, isLoading } = useAgentChat();
  const panelRef = useRef<HTMLDivElement>(null);

  // Orchestrator state for multi-agent progress display
  const {
    state: orchestratorState,
    isActive: orchestratorActive,
    pause: pauseOrchestrator,
    resume: resumeOrchestrator,
    cancel: cancelOrchestrator,
  } = useOrchestratorStatus();

  const isOpen = panelState === 'open';

  // Handle state transitions with animation
  const handleToggle = useCallback(() => {
    setIsAnimating(true);
    const newState = panelState === 'minimized' ? 'open' : 'minimized';

    // When expanding, constrain position to keep panel in bounds
    if (newState === 'open') {
      const parentEl = panelRef.current?.parentElement;
      const parentWidth = parentEl?.clientWidth ?? window.innerWidth;
      const parentHeight = parentEl?.clientHeight ?? window.innerHeight;

      const expandedWidth = components.chatPanel.widthOpen;
      const expandedHeight = components.chatPanel.heightOpen;

      const maxX = Math.max(0, parentWidth - expandedWidth - 24);
      const maxY = Math.max(0, parentHeight - expandedHeight - 24);

      setPosition((prev) => ({
        x: Math.max(24, Math.min(prev.x, maxX)),
        y: Math.max(24, Math.min(prev.y, maxY)),
      }));
    }

    setPanelState(newState);
  }, [panelState]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();

    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: rect.bottom - e.clientY,
    };

    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const panel = panelRef.current;
      if (!panel) return;

      const parentRect = panel.parentElement?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };

      const panelWidth = isOpen ? components.chatPanel.widthOpen : 200;
      const panelHeight = isOpen ? components.chatPanel.heightOpen : 48;

      const newX = e.clientX - parentRect.left - dragOffsetRef.current.x;
      const newY = parentRect.bottom - e.clientY - dragOffsetRef.current.y;

      const maxX = parentRect.right - parentRect.left - panelWidth - 12;
      const maxY = parentRect.bottom - parentRect.top - panelHeight - 12;

      setPosition({
        x: Math.max(12, Math.min(newX, maxX)),
        y: Math.max(12, Math.min(newY, maxY)),
      });
    },
    [isDragging, isOpen]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Attach drag listeners to window
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
    return undefined;
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Reset animation state after transition
  useEffect(() => {
    if (isAnimating) {
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 300);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [isAnimating]);

  // Listen for agent skill activation events from LayerAgentToolbar
  useEffect(() => {
    const handleSkillEvent = (
      event: CustomEvent<{
        skillId: string;
        prompt: string;
        nodeId: string;
        nodeLabel: string;
      }>
    ): void => {
      const { prompt, nodeId } = event.detail;

      // Auto-expand the panel if minimized
      if (panelState === 'minimized') {
        setPanelState('open');
      }

      // Send the skill prompt to the agent with nodeId for targeted code updates
      sendMessage(prompt, nodeId);
    };

    window.addEventListener('orbit:agent-skill', handleSkillEvent as EventListener);
    return () => {
      window.removeEventListener('orbit:agent-skill', handleSkillEvent as EventListener);
    };
  }, [panelState, sendMessage]);

  // Listen for simple open event (e.g., from toolbar button)
  useEffect(() => {
    const handleOpenEvent = (): void => {
      if (panelState === 'minimized') {
        setPanelState('open');
      }
    };

    window.addEventListener('orbit:agent-open', handleOpenEvent);
    return () => {
      window.removeEventListener('orbit:agent-open', handleOpenEvent);
    };
  }, [panelState]);

  // =========================================================================
  // MINIMIZED STATE - Compact floating bar
  // =========================================================================
  if (!isOpen) {
    // In workflow mode, hide the pill completely when minimized
    if (hideWhenMinimized) {
      return null;
    }
    return (
      <>
        <style>{pillStyles}</style>
        <div
          ref={panelRef}
          className={`agent-pill ${isDragging ? 'dragging' : ''}`}
          style={{
            position: 'absolute',
            bottom: `${String(position.y)}px`,
            left: `${String(position.x)}px`,
            display: 'flex',
            alignItems: 'center',
            height: 40,
            backgroundColor: 'var(--card)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--border)',
            borderRadius: radii.lg,
            zIndex: zIndex.chatPanel,
            boxShadow: shadows.md,
            animation: isDragging ? 'none' : `agent-fade-scale-in ${motion.smooth} ease-out`,
            userSelect: 'none',
            overflow: 'hidden',
          }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={handleDragStart}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
              padding: `0 ${String(spacing.md)}px 0 ${String(spacing.lg)}px`,
              height: '100%',
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
          >
            {/* Grip dots */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--muted-foreground)',
                opacity: isDragging ? 1 : 0.5,
                transition: `opacity ${motion.fast} ${motion.ease}`,
              }}
            >
              <GripDotsIcon />
            </div>

            {/* Text */}
            <span
              style={{
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
                color: 'var(--foreground)',
              }}
            >
              Orbit Canvas
            </span>

            {/* Status dot */}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: status === 'ready' ? '#22c55e' : 'var(--muted-foreground)',
                boxShadow: status === 'ready' ? '0 0 6px rgba(34, 197, 94, 0.6)' : 'none',
              }}
            />
          </div>

          {/* Expand button */}
          <button
            className="agent-pill-expand"
            onClick={handleToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              marginRight: spacing.sm,
              border: 'none',
              borderRadius: radii.md,
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              transition: `all ${motion.fast} ${motion.ease}`,
            }}
            title="Expand chat (⌘+Shift+O)"
          >
            <ExpandIcon />
          </button>
        </div>
      </>
    );
  }

  // =========================================================================
  // OPEN STATE - Full chat panel with refined header
  // =========================================================================
  return (
    <>
      <style>{panelStyles}</style>
      <div
        ref={panelRef}
        className={`agent-panel ${isDragging ? 'dragging' : ''}`}
        style={{
          position: 'absolute',
          bottom: `${String(position.y)}px`,
          left: `${String(position.x)}px`,
          width: components.chatPanel.widthOpen,
          height: components.chatPanel.heightOpen,
          backgroundColor: 'var(--canvas-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          borderRadius: radii['2xl'],
          boxShadow: `${shadows.xl}, 0 0 0 1px var(--border) inset`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: zIndex.chatPanel,
          overflow: 'hidden',
          animation: isDragging ? 'none' : `agent-slide-up ${motion.slow} ${motion.ease}`,
          userSelect: isDragging ? 'none' : 'auto',
        }}
      >
        {/* Header - drag handle */}
        <div
          className="agent-panel-drag-area"
          onMouseDown={handleDragStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${String(spacing.lg)}px ${String(spacing.xl)}px`,
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            minHeight: 64,
            background: isDragging ? 'var(--muted)' : 'transparent',
            transition: `background ${motion.fast} ${motion.ease}`,
          }}
        >
          {/* Left side - grip, icon, title */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.lg,
            }}
          >
            {/* Grip indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--muted-foreground)',
                opacity: isDragging ? 1 : 0.5,
                transition: `opacity ${motion.fast} ${motion.ease}`,
              }}
            >
              <GripDotsIcon />
            </div>

            {/* Title */}
            <div>
              <div
                style={{
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.semibold,
                  color: 'var(--foreground)',
                  letterSpacing: letterSpacing.tight,
                  lineHeight: 1.2,
                }}
              >
                Orbit Canvas
              </div>
              <div
                style={{
                  fontSize: fontSize.sm,
                  color: 'var(--muted-foreground)',
                  marginTop: 2,
                }}
              >
                Your design assistant
              </div>
            </div>
          </div>

          {/* Right side - status, minimize */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
            }}
          >
            <AgentStatusBadge status={status} />
            <button
              className="agent-panel-btn"
              onClick={handleToggle}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              title="Minimize"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                border: 'none',
                borderRadius: radii.lg,
                backgroundColor: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >
              <MinimizeIcon />
            </button>
          </div>
        </div>

        {/* Orchestrator Progress - shown when multi-agent orchestration is active */}
        {orchestratorActive ? (
          <div style={{ padding: spacing.md, borderBottom: '1px solid var(--border)' }}>
            <OrchestratorProgress
              state={orchestratorState}
              onPause={pauseOrchestrator}
              onResume={resumeOrchestrator}
              onCancel={cancelOrchestrator}
              compact={false}
            />
          </div>
        ) : null}

        {/* Messages - scrollable area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            onSuggestionClick={sendMessage}
          />
        </div>

        {/* Input */}
        <div
          style={{
            flexShrink: 0,
          }}
        >
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading}
            disabled={status === 'disconnected'}
          />
        </div>
      </div>
    </>
  );
}
