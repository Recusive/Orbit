/**
 * OrchestratorProgress - Visual progress indicator for multi-agent orchestration
 *
 * Shows:
 * - Current stage and overall progress
 * - Per-stage progress bars
 * - Active agent indicators
 * - Task completion stats
 */

import React from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../lib/design/designTokens';

import { SubAgentStatusBadge } from './SubAgentStatusBadge';

import type { OrchestratorState, TaskStageProgress } from './types';

export interface OrchestratorProgressProps {
  state: OrchestratorState;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  /** Compact mode for minimal display */
  compact?: boolean;
}

// Stage status colors
const stageColors: Record<string, { bg: string; fill: string; text: string }> = {
  pending: {
    bg: 'var(--muted)',
    fill: 'var(--muted-foreground)',
    text: 'var(--muted-foreground)',
  },
  active: {
    bg: 'var(--accent)',
    fill: 'var(--primary)',
    text: 'var(--primary)',
  },
  completed: {
    bg: 'rgba(34, 197, 94, 0.15)',
    fill: '#22c55e',
    text: '#22c55e',
  },
  failed: {
    bg: 'rgba(239, 68, 68, 0.15)',
    fill: '#ef4444',
    text: '#ef4444',
  },
};

// CSS animations
const progressStyles = `
	@keyframes orchestrator-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}
	@keyframes orchestrator-progress {
		0% { background-position: 0% 50%; }
		100% { background-position: 100% 50%; }
	}
`;

export function OrchestratorProgress({
  state,
  onPause,
  onResume,
  onCancel,
  compact = false,
}: OrchestratorProgressProps): React.ReactElement | null {
  const isActive =
    state.status === 'analyzing' || state.status === 'executing' || state.status === 'resolving';
  const isPaused =
    state.status === 'idle' && state.totalTasks > 0 && state.completedTasks < state.totalTasks;
  const isComplete =
    state.status === 'completing' ||
    (state.completedTasks === state.totalTasks && state.totalTasks > 0);
  const hasFailed = state.status === 'failed';

  // Don't render if idle with no tasks
  if (state.status === 'idle' && state.totalTasks === 0) {
    return null;
  }

  const overallProgress =
    state.totalTasks > 0 ? Math.round((state.completedTasks / state.totalTasks) * 100) : 0;

  // Compact mode - minimal progress bar
  if (compact) {
    return (
      <>
        <style>{progressStyles}</style>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            padding: `${String(spacing.sm)}px ${String(spacing.lg)}px`,
            backgroundColor: 'var(--card)',
            borderRadius: radii.md,
            border: '1px solid var(--border)',
          }}
        >
          {/* Progress bar */}
          <div
            style={{
              flex: 1,
              height: 4,
              backgroundColor: 'var(--muted)',
              borderRadius: radii.pill,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${String(overallProgress)}%`,
                height: '100%',
                backgroundColor: hasFailed ? '#ef4444' : isComplete ? '#22c55e' : 'var(--primary)',
                borderRadius: radii.pill,
                transition: `width ${motion.smooth} ${motion.ease}`,
              }}
            />
          </div>
          {/* Percentage */}
          <span
            style={{
              fontSize: fontSize.xs,
              fontWeight: fontWeight.medium,
              color: 'var(--muted-foreground)',
              minWidth: 32,
              textAlign: 'right',
            }}
          >
            {overallProgress}%
          </span>
        </div>
      </>
    );
  }

  // Full progress display
  return (
    <>
      <style>{progressStyles}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.lg,
          padding: spacing.xl,
          backgroundColor: 'var(--card)',
          borderRadius: radii.lg,
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            {/* Status indicator */}
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: hasFailed
                  ? '#ef4444'
                  : isComplete
                    ? '#22c55e'
                    : isActive
                      ? 'var(--primary)'
                      : 'var(--muted-foreground)',
                boxShadow: isActive ? '0 0 8px var(--primary)' : undefined,
                animation: isActive ? 'orchestrator-pulse 1.5s ease-in-out infinite' : undefined,
              }}
            />
            <span
              style={{
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
                color: 'var(--foreground)',
              }}
            >
              {state.currentIntent
                ? state.currentIntent.substring(0, 40) +
                  (state.currentIntent.length > 40 ? '...' : '')
                : 'Orchestrating'}
            </span>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: spacing.sm }}>
            {isActive && onPause ? (
              <button
                onClick={onPause}
                style={{
                  padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.medium,
                  color: 'var(--muted-foreground)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: radii.sm,
                  cursor: 'pointer',
                }}
              >
                Pause
              </button>
            ) : null}
            {isPaused && onResume ? (
              <button
                onClick={onResume}
                style={{
                  padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.medium,
                  color: 'var(--primary)',
                  backgroundColor: 'var(--accent)',
                  border: 'none',
                  borderRadius: radii.sm,
                  cursor: 'pointer',
                }}
              >
                Resume
              </button>
            ) : null}
            {(isActive || isPaused) && onCancel ? (
              <button
                onClick={onCancel}
                style={{
                  padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.medium,
                  color: '#ef4444',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: radii.sm,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        {/* Overall progress bar */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: spacing.xs,
            }}
          >
            <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
              Tasks: {state.completedTasks}/{state.totalTasks}
            </span>
            <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
              {overallProgress}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              backgroundColor: 'var(--muted)',
              borderRadius: radii.pill,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${String(overallProgress)}%`,
                height: '100%',
                backgroundColor: hasFailed ? '#ef4444' : isComplete ? '#22c55e' : 'var(--primary)',
                borderRadius: radii.pill,
                transition: `width ${motion.smooth} ${motion.ease}`,
              }}
            />
          </div>
        </div>

        {/* Stages */}
        {state.stages.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {state.stages.map((stage) => (
              <StageProgressRow key={stage.id} stage={stage} />
            ))}
          </div>
        ) : null}

        {/* Active agents */}
        {state.activeAgents.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: spacing.sm,
              paddingTop: spacing.md,
              borderTop: '1px solid var(--border)',
            }}
          >
            {state.activeAgents.map((agent) => (
              <SubAgentStatusBadge key={agent.agentId} agent={agent} />
            ))}
          </div>
        ) : null}

        {/* Errors */}
        {state.errors.length > 0 ? (
          <div
            style={{
              padding: spacing.md,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: radii.md,
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            <span
              style={{
                fontSize: fontSize.xs,
                fontWeight: fontWeight.semibold,
                color: '#ef4444',
              }}
            >
              {state.errors.length} error{state.errors.length > 1 ? 's' : ''}
            </span>
            <p
              style={{
                fontSize: fontSize.xs,
                color: '#ef4444',
                marginTop: spacing.xs,
                opacity: 0.8,
              }}
            >
              {state.errors[state.errors.length - 1]?.message}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Individual stage progress row
 */
function StageProgressRow({ stage }: { stage: TaskStageProgress }): React.ReactElement {
  const defaultColors = {
    bg: 'var(--muted)',
    fill: 'var(--muted-foreground)',
    text: 'var(--muted-foreground)',
  };
  const colors = stageColors[stage.status] ?? defaultColors;
  const isActive = stage.status === 'active';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      {/* Stage name */}
      <span
        style={{
          width: 80,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          color: colors.text,
        }}
      >
        {stage.name}
      </span>

      {/* Progress bar */}
      <div
        style={{
          flex: 1,
          height: 4,
          backgroundColor: colors.bg,
          borderRadius: radii.pill,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${String(stage.progress)}%`,
            height: '100%',
            backgroundColor: colors.fill,
            borderRadius: radii.pill,
            transition: `width ${motion.smooth} ${motion.ease}`,
            animation: isActive ? 'orchestrator-pulse 1.5s ease-in-out infinite' : undefined,
          }}
        />
      </div>

      {/* Status indicator */}
      <span
        style={{
          fontSize: fontSize.xs,
          color: colors.text,
          minWidth: 50,
          textAlign: 'right',
        }}
      >
        {stage.status === 'completed'
          ? '✓'
          : stage.status === 'failed'
            ? '✗'
            : `${String(stage.progress)}%`}
      </span>
    </div>
  );
}
