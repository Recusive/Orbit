/**
 * SubAgentStatusBadge - Status indicator for individual sub-agents
 *
 * Shows the current status of a specialized agent (Layout, Component, Style, Integration)
 * with appropriate visual indicators for each state.
 */

import React from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../lib/design/designTokens';

import type { AgentActivity, AgentType } from './types';

export interface SubAgentStatusBadgeProps {
  agent: AgentActivity;
  /** Show only the compact version */
  compact?: boolean;
}

// Agent type colors and icons
const agentConfig: Record<AgentType, { icon: string; color: string; bgColor: string }> = {
  layout: {
    icon: '⊞',
    color: '#8b5cf6', // purple
    bgColor: 'rgba(139, 92, 246, 0.15)',
  },
  component: {
    icon: '◇',
    color: '#3b82f6', // blue
    bgColor: 'rgba(59, 130, 246, 0.15)',
  },
  style: {
    icon: '✦',
    color: '#ec4899', // pink
    bgColor: 'rgba(236, 72, 153, 0.15)',
  },
  integration: {
    icon: '⚡',
    color: '#f59e0b', // amber
    bgColor: 'rgba(245, 158, 11, 0.15)',
  },
};

// Status colors
const statusConfig: Record<AgentActivity['status'], { suffix: string; animate: boolean }> = {
  idle: { suffix: '', animate: false },
  thinking: { suffix: '...', animate: true },
  executing: { suffix: '...', animate: true },
  waiting: { suffix: '', animate: false },
};

// CSS animations
const badgeStyles = `
	@keyframes sub-agent-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}
	@keyframes sub-agent-spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
`;

export function SubAgentStatusBadge({
  agent,
  compact = false,
}: SubAgentStatusBadgeProps): React.ReactElement {
  const config = agentConfig[agent.type];
  const status = statusConfig[agent.status];
  const isActive = agent.status === 'thinking' || agent.status === 'executing';

  // Compact mode - just icon and status dot
  if (compact) {
    return (
      <>
        <style>{badgeStyles}</style>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: radii.md,
            backgroundColor: config.bgColor,
            position: 'relative',
          }}
          title={`${agent.name}: ${agent.status}`}
        >
          <span style={{ fontSize: fontSize.sm }}>{config.icon}</span>
          {/* Status indicator dot */}
          <span
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isActive ? config.color : 'var(--muted-foreground)',
              border: '2px solid var(--card)',
              animation: isActive ? 'sub-agent-pulse 1.5s ease-in-out infinite' : undefined,
            }}
          />
        </span>
      </>
    );
  }

  // Full badge
  return (
    <>
      <style>{badgeStyles}</style>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.sm,
          padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
          borderRadius: radii.md,
          backgroundColor: config.bgColor,
          animation: status.animate ? 'sub-agent-pulse 1.5s ease-in-out infinite' : undefined,
          transition: `all ${motion.smooth} ${motion.ease}`,
        }}
      >
        {/* Icon with spinner for active states */}
        <span
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
          }}
        >
          {isActive ? (
            <span
              style={{
                position: 'absolute',
                inset: -2,
                borderRadius: '50%',
                border: `1.5px solid ${config.color}`,
                borderTopColor: 'transparent',
                animation: 'sub-agent-spin 1s linear infinite',
              }}
            />
          ) : null}
          <span
            style={{
              fontSize: fontSize.sm,
              color: config.color,
            }}
          >
            {config.icon}
          </span>
        </span>

        {/* Agent name and status */}
        <span
          style={{
            fontSize: fontSize.xs,
            fontWeight: fontWeight.medium,
            color: config.color,
          }}
        >
          {agent.name}
          <span style={{ opacity: 0.7 }}>{status.suffix}</span>
        </span>

        {/* Token usage if available */}
        {agent.tokenUsage !== undefined && agent.tokenUsage > 0 ? (
          <span
            style={{
              fontSize: fontSize.xs,
              color: config.color,
              opacity: 0.6,
              marginLeft: spacing.xs,
            }}
          >
            {formatTokens(agent.tokenUsage)}
          </span>
        ) : null}
      </span>
    </>
  );
}

/**
 * Format token count for display
 */
function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

/**
 * SubAgentStatusList - Horizontal list of agent badges
 */
export interface SubAgentStatusListProps {
  agents: AgentActivity[];
  compact?: boolean;
}

export function SubAgentStatusList({
  agents,
  compact = false,
}: SubAgentStatusListProps): React.ReactElement | null {
  if (agents.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.sm,
      }}
    >
      {agents.map((agent) => (
        <SubAgentStatusBadge key={agent.agentId} agent={agent} compact={compact} />
      ))}
    </div>
  );
}
