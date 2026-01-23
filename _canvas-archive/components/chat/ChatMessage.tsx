/**
 * ChatMessage - Clean message display matching orbit-agent style
 *
 * Features:
 * - Simple, clean design
 * - User messages have muted background
 * - Assistant messages have no background
 * - Status indicators for sending state
 */

import React from 'react';

import { spacing, radii, fontSize } from '../../lib/design/designTokens';

export interface Message {
  id: string;
  type?: 'message';
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}

export interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === 'user';

  return (
    <div style={{ marginBottom: spacing.lg }}>
      <div
        style={{
          padding: spacing.lg,
          borderRadius: radii.lg,
          backgroundColor: isUser ? 'var(--muted)' : 'transparent',
        }}
      >
        <p
          style={{
            fontSize: fontSize.base,
            lineHeight: 1.6,
            color: 'var(--foreground)',
            whiteSpace: 'pre-wrap',
            margin: 0,
          }}
        >
          {message.content}
        </p>
      </div>

      {/* Status indicator */}
      {message.status === 'sending' && (
        <span
          style={{
            fontSize: fontSize.xs,
            color: 'var(--muted-foreground)',
            marginTop: spacing.sm,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              backgroundColor: 'var(--muted-foreground)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          Sending...
        </span>
      )}
      {message.status === 'error' && (
        <span
          style={{
            fontSize: fontSize.xs,
            color: 'var(--destructive)',
            marginTop: spacing.sm,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          Failed to send
        </span>
      )}
    </div>
  );
}
