/**
 * ToolUseBubble - Displays tool execution status in chat
 *
 * Features:
 * - Shows tool name with formatted display
 * - Status indicator (running/success/error)
 * - Collapsible input/output details
 * - Refined visual treatment
 */

import React, { useState } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../lib/designTokens';

export interface ToolUseMessage {
  id: string;
  type: 'tool_use';
  toolName: string;
  toolId: string;
  toolInput: unknown;
  status: 'running' | 'success' | 'error';
  timestamp: Date;
}

export interface ToolUseBubbleProps {
  message: ToolUseMessage;
}

// CSS animations
const toolBubbleStyles = `
	@keyframes tool-spin {
		to { transform: rotate(360deg); }
	}
	.tool-bubble-header:hover {
		background-color: var(--muted);
	}
`;

// =============================================================================
// ICONS
// =============================================================================

const ToolIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: `transform ${motion.fast} ${motion.ease}`,
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const SpinnerIcon = (): React.JSX.Element => (
  <span
    style={{
      display: 'inline-block',
      width: 12,
      height: 12,
      border: '2px solid rgba(139, 92, 246, 0.3)',
      borderTopColor: '#8b5cf6',
      borderRadius: '50%',
      animation: 'tool-spin 1s linear infinite',
    }}
  />
);

const CheckIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--success)"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ErrorIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--destructive)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

// =============================================================================
// HELPERS
// =============================================================================

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const statusColors = {
  running: {
    bg: 'var(--muted)',
    border: 'var(--border)',
    icon: 'var(--info)',
  },
  success: {
    bg: 'var(--muted)',
    border: 'var(--border)',
    icon: 'var(--success)',
  },
  error: {
    bg: 'var(--muted)',
    border: 'var(--border)',
    icon: 'var(--destructive)',
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ToolUseBubble({ message }: ToolUseBubbleProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const status = message.status;
  const colorScheme = statusColors[status];
  const toolName = message.toolName;

  return (
    <>
      <style>{toolBubbleStyles}</style>
      <div
        style={{
          marginBottom: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: colorScheme.bg,
          border: `1px solid ${colorScheme.border}`,
          overflow: 'hidden',
        }}
      >
        {/* Header - always visible */}
        <div
          className="tool-bubble-header"
          onClick={() => {
            setExpanded(!expanded);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            padding: `${String(spacing.md)}px ${String(spacing.lg)}px`,
            cursor: 'pointer',
            userSelect: 'none',
            transition: `background-color ${motion.fast} ${motion.ease}`,
          }}
        >
          <span style={{ color: 'var(--muted-foreground)' }}>
            <ChevronIcon expanded={expanded} />
          </span>
          <span style={{ color: colorScheme.icon }}>
            <ToolIcon />
          </span>
          <span
            style={{
              flex: 1,
              fontSize: fontSize.sm,
              fontWeight: fontWeight.medium,
              color: 'var(--foreground)',
            }}
          >
            {formatToolName(toolName)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {status === 'running' && <SpinnerIcon />}
            {status === 'success' && <CheckIcon />}
            {status === 'error' && <ErrorIcon />}
          </span>
        </div>

        {/* Expanded content - tool input */}
        {expanded ? (
          <div
            style={{
              padding: spacing.lg,
              borderTop: `1px solid ${colorScheme.border}`,
              backgroundColor: 'var(--accent)',
            }}
          >
            <div
              style={{
                fontSize: fontSize.xs,
                fontWeight: fontWeight.semibold,
                color: 'var(--muted-foreground)',
                marginBottom: spacing.sm,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Input
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: fontSize.xs,
                fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
                color: 'var(--muted-foreground)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 150,
                overflow: 'auto',
                lineHeight: 1.5,
              }}
            >
              {message.toolInput !== null && message.toolInput !== undefined
                ? JSON.stringify(message.toolInput, null, 2)
                : '(no input)'}
            </pre>
          </div>
        ) : null}
      </div>
    </>
  );
}
