/**
 * AgentStatusBadge - Refined status indicator
 *
 * Features:
 * - Minimal, elegant badge showing agent state
 * - Smooth pulse animations for active states
 * - Compact mode for minimized panel
 */

import React from 'react';

import { spacing, radii, fontSize, fontWeight, letterSpacing, motion } from '../lib/designTokens';

export type AgentStatus = 'ready' | 'thinking' | 'error' | 'disconnected';

export interface AgentStatusBadgeProps {
  status: AgentStatus;
  /** Compact mode shows only the dot */
  compact?: boolean;
}

const statusConfig: Record<
  AgentStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    glow?: string;
    dotOnly?: boolean;
  }
> = {
  ready: {
    label: 'Ready',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.15)',
    glow: '0 0 8px rgba(34, 197, 94, 0.6)',
  },
  thinking: {
    label: 'Thinking',
    color: 'var(--warning)',
    bgColor: 'var(--accent)',
    glow: '0 0 8px rgba(245, 158, 11, 0.4)',
  },
  error: {
    label: 'Error',
    color: 'var(--destructive)',
    bgColor: 'var(--accent)',
    glow: '0 0 8px rgba(239, 68, 68, 0.3)',
  },
  disconnected: {
    label: 'Offline',
    color: 'var(--muted-foreground)',
    bgColor: 'var(--border)',
    dotOnly: true,
  },
};

// CSS for animations
const badgeStyles = `
	@keyframes agent-status-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}
	@keyframes agent-dot-pulse {
		0%, 100% { transform: scale(1); box-shadow: var(--glow); }
		50% { transform: scale(1.15); box-shadow: var(--glow-strong); }
	}
	@keyframes agent-dot-spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
`;

export function AgentStatusBadge({
  status,
  compact = false,
}: AgentStatusBadgeProps): React.ReactElement {
  const config = statusConfig[status];
  const isThinking = status === 'thinking';
  const isReady = status === 'ready';

  // Compact mode - just the dot
  if (compact) {
    return (
      <>
        <style>{badgeStyles}</style>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: radii.md,
            backgroundColor: config.bgColor,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: config.color,
              boxShadow: config.glow,
              animation: isThinking
                ? 'agent-dot-pulse 1.5s ease-in-out infinite'
                : isReady
                  ? 'agent-dot-pulse 3s ease-in-out infinite'
                  : undefined,
              ['--glow' as string]: config.glow ?? 'none',
              ['--glow-strong' as string]: config.glow?.replace('8px', '12px') ?? 'none',
            }}
          />
        </span>
      </>
    );
  }

  // Full badge with label
  return (
    <>
      <style>{badgeStyles}</style>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.md,
          padding: `${String(spacing.sm)}px ${String(spacing.lg)}px`,
          borderRadius: radii.md,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.semibold,
          letterSpacing: letterSpacing.wide,
          color: config.color,
          backgroundColor: config.bgColor,
          animation: isThinking ? 'agent-status-pulse 2s ease-in-out infinite' : undefined,
          transition: `all ${motion.smooth} ${motion.ease}`,
        }}
      >
        {/* Status dot */}
        <span
          style={{
            position: 'relative',
            width: 8,
            height: 8,
          }}
        >
          {/* Glow ring for thinking state */}
          {isThinking ? (
            <span
              style={{
                position: 'absolute',
                inset: -2,
                borderRadius: '50%',
                border: `1.5px solid ${config.color}`,
                borderTopColor: 'transparent',
                animation: 'agent-dot-spin 1s linear infinite',
              }}
            />
          ) : null}
          {/* Core dot */}
          <span
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: config.color,
              boxShadow: config.glow,
              animation: isReady ? 'agent-dot-pulse 3s ease-in-out infinite' : undefined,
              ['--glow' as string]: config.glow ?? 'none',
              ['--glow-strong' as string]: config.glow?.replace('8px', '12px') ?? 'none',
            }}
          />
        </span>
        {config.label}
      </span>
    </>
  );
}
