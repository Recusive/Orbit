/**
 * ChatMessageList - Premium scrollable container for chat messages
 *
 * Features:
 * - Auto-scroll to bottom on new messages
 * - Beautiful empty state with clickable suggestions
 * - Smooth message animations
 * - Refined typing indicator
 * - Proper scrolling with height constraints
 */

import React, { useRef, useEffect } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../lib/design/designTokens';

import { ChatMessage } from './ChatMessage';
import { ThinkingBubble } from './ThinkingBubble';
import { ToolUseBubble } from './ToolUseBubble';

import type { ChatMessage as ChatMessageType } from '../../hooks/agent/useAgentChat';

export interface ChatMessageListProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
}

// CSS animations
const messageListStyles = `
	@keyframes chat-fade-in {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	.chat-messages-scroll {
		scrollbar-width: thin;
		scrollbar-color: var(--muted-foreground) transparent;
	}
	.chat-messages-scroll::-webkit-scrollbar {
		width: 6px;
	}
	.chat-messages-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.chat-messages-scroll::-webkit-scrollbar-thumb {
		background-color: var(--muted-foreground);
		border-radius: var(--radius-sm);
	}
	.chat-messages-scroll::-webkit-scrollbar-thumb:hover {
		background-color: var(--foreground);
	}
	.chat-suggestion {
		transition: all 0.15s ease;
	}
	.chat-suggestion:hover {
		background-color: var(--accent) !important;
		border-color: var(--border) !important;
		transform: translateY(-1px);
	}
	.chat-suggestion:active {
		transform: translateY(0);
		background-color: var(--muted) !important;
	}
`;

// =============================================================================
// PROGRESS INDICATOR
// =============================================================================

// Spinner icon matching orbit-agent's Loader2
const SpinnerIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ animation: 'spin 1s linear infinite' }}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

function ProgressIndicator(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${String(spacing.md)}px ${String(spacing.lg)}px`,
        fontSize: fontSize.sm,
        color: 'var(--muted-foreground)',
      }}
    >
      <SpinnerIcon />
      <span>Generating...</span>
    </div>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

// Suggestion icons
const LockIcon = (): React.JSX.Element => (
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
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const CardIcon = (): React.JSX.Element => (
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
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const MenuIcon = (): React.JSX.Element => (
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
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const LayoutIcon = (): React.JSX.Element => (
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
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
  </svg>
);

function EmptyState({
  onSuggestionClick,
}: {
  onSuggestionClick?: (suggestion: string) => void;
}): React.JSX.Element {
  const suggestions = [
    { text: 'Create a login form', icon: <LockIcon /> },
    { text: 'Design a pricing card', icon: <CardIcon /> },
    { text: 'Build a navigation bar', icon: <MenuIcon /> },
    { text: 'Make a hero section', icon: <LayoutIcon /> },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: spacing['2xl'],
        height: '100%',
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: fontSize.md,
          fontWeight: fontWeight.semibold,
          color: 'var(--foreground)',
          marginBottom: spacing.sm,
        }}
      >
        What would you like to create?
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: fontSize.sm,
          color: 'var(--muted-foreground)',
          lineHeight: 1.5,
          maxWidth: 240,
          marginBottom: spacing.xl,
        }}
      >
        Describe a component and I'll help you build it.
      </div>

      {/* Suggestions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.sm,
          width: '100%',
          maxWidth: 260,
        }}
      >
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.text}
            className="chat-suggestion"
            onClick={() => onSuggestionClick?.(suggestion.text)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.lg,
              padding: `${String(spacing.md)}px ${String(spacing.lg)}px`,
              fontSize: fontSize.sm,
              color: 'var(--foreground)',
              backgroundColor: 'var(--muted)',
              borderRadius: radii.md,
              border: '1px solid var(--border)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: radii.sm,
                backgroundColor: 'var(--accent)',
                color: 'var(--muted-foreground)',
                flexShrink: 0,
              }}
            >
              {suggestion.icon}
            </span>
            <span>{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MESSAGE RENDERER
// =============================================================================

function renderMessage(message: ChatMessageType): React.JSX.Element {
  if ('type' in message && message.type === 'tool_use') {
    return <ToolUseBubble message={message} />;
  }
  if ('type' in message && message.type === 'thinking') {
    return <ThinkingBubble message={message} />;
  }
  return <ChatMessage message={message} />;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ChatMessageList({
  messages,
  isLoading = false,
  onSuggestionClick,
}: ChatMessageListProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{messageListStyles}</style>
      <div
        ref={containerRef}
        className="chat-messages-scroll"
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: spacing.xl,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {isEmpty && !isLoading ? (
          <EmptyState {...(onSuggestionClick !== undefined && { onSuggestionClick })} />
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={message.id}
                style={{
                  animation: `chat-fade-in ${motion.smooth} ease-out`,
                  animationDelay: `${String(Math.min(index * 0.05, 0.3))}s`,
                  animationFillMode: 'both',
                }}
              >
                {renderMessage(message)}
              </div>
            ))}
            {isLoading ? <ProgressIndicator /> : null}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </>
  );
}
