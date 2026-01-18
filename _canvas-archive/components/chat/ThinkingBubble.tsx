/**
 * ThinkingBubble - Displays AI thinking content in expandable section
 *
 * Features:
 * - Collapsible thinking indicator
 * - Expandable content with smooth animation
 * - Refined visual treatment with warm amber tones
 */

import React, { useState } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../lib/design/designTokens';

export interface ThinkingMessage {
  id: string;
  type: 'thinking';
  content: string;
  timestamp: Date;
}

export interface ThinkingBubbleProps {
  message: ThinkingMessage;
}

// CSS animations
const thinkingStyles = `
	@keyframes thinking-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}
	.thinking-bubble-header:hover {
		background-color: var(--muted);
	}
`;

// =============================================================================
// ICONS
// =============================================================================

const BrainIcon = (): React.JSX.Element => (
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
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v.5a2 2 0 0 1 0 4v.5a2 2 0 0 1 0 4v.5a2 2 0 0 1 0 4v.5a2.5 2.5 0 0 1-2.5 2.5" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v.5a2 2 0 0 0 0 4v.5a2 2 0 0 0 0 4v.5a2 2 0 0 0 0 4v.5a2.5 2.5 0 0 0 2.5 2.5" />
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

// =============================================================================
// COMPONENT
// =============================================================================

export function ThinkingBubble({ message }: ThinkingBubbleProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const content = message.content;
  const previewLength = 100;
  const hasMore = content.length > previewLength;
  const preview = hasMore ? content.slice(0, previewLength) + '...' : content;

  return (
    <>
      <style>{thinkingStyles}</style>
      <div
        style={{
          marginBottom: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: 'var(--muted)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {/* Header - always visible */}
        <div
          className="thinking-bubble-header"
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
          <span
            style={{
              color: 'var(--warning)',
              animation: 'thinking-pulse 2s ease-in-out infinite',
            }}
          >
            <BrainIcon />
          </span>
          <span
            style={{
              flex: 1,
              fontSize: fontSize.sm,
              fontWeight: fontWeight.medium,
              color: 'var(--foreground)',
            }}
          >
            Thinking
          </span>
          {!expanded && hasMore ? (
            <span
              style={{
                fontSize: fontSize.xs,
                color: 'var(--muted-foreground)',
                padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
                backgroundColor: 'var(--accent)',
                borderRadius: radii.sm,
              }}
            >
              Click to expand
            </span>
          ) : null}
        </div>

        {/* Content - preview or full */}
        <div
          style={{
            padding: `0 ${String(spacing.lg)}px ${String(spacing.lg)}px calc(${String(spacing.lg)}px + 28px)`,
            fontSize: fontSize.sm,
            lineHeight: 1.6,
            color: 'var(--muted-foreground)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: expanded ? 400 : 60,
            overflow: expanded ? 'auto' : 'hidden',
            transition: `max-height ${motion.smooth} ${motion.ease}`,
          }}
        >
          {expanded ? content : preview}
        </div>
      </div>
    </>
  );
}
