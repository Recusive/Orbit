import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';

import { buildContextFromSelection, getContextSummary } from '../../lib/ai/aiContextBuilder';
import { radii, fontWeight, shadows, spacing } from '../../lib/design/designTokens';

import type { AIContext } from '../../lib/ai/aiContextBuilder';
import type {
  MarkdownCard,
  WorkflowConnection,
  AgentType,
  LineRange,
} from '../../types/workflowTypes';

// ============================================================================
// Icons
// ============================================================================

const CloseIcon = (): React.JSX.Element => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const SparklesIcon = (): React.JSX.Element => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path>
    <path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z"></path>
    <path d="M19 13l1 2 1-2 2-1-2-1-1-2-1 2-2 1 2 1z"></path>
  </svg>
);

const SendIcon = (): React.JSX.Element => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const ChevronDownIcon = (): React.JSX.Element => (
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
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

// ============================================================================
// Agent Icons
// ============================================================================

const ClaudeIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CodexIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

const GeminiIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    backdropFilter: 'blur(4px)',
  },
  panel: {
    backgroundColor: 'var(--card)',
    borderRadius: radii.xl,
    border: '1px solid var(--border)',
    boxShadow: shadows.xl,
    width: 600,
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${String(spacing.md)}px ${String(spacing.lg)}px`,
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    border: 'none',
    borderRadius: radii.md,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: spacing.sm,
  },
  contextPreview: {
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 13,
    color: 'var(--foreground)',
    maxHeight: 120,
    overflow: 'auto',
  },
  contextEmpty: {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic' as const,
  },
  contextSummary: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    marginTop: spacing.sm,
  },
  agentSelector: {
    display: 'flex',
    gap: spacing.sm,
  },
  agentButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  agentButtonActive: {
    color: 'var(--primary-foreground)',
    backgroundColor: 'var(--primary)',
    borderColor: 'var(--primary)',
  },
  promptContainer: {
    position: 'relative' as const,
  },
  promptTextarea: {
    width: '100%',
    minHeight: 100,
    padding: '12px 14px',
    paddingRight: 50,
    fontSize: 14,
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    outline: 'none',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  sendButton: {
    position: 'absolute' as const,
    right: 10,
    bottom: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    padding: 0,
    border: 'none',
    borderRadius: radii.md,
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  sendButtonDisabled: {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    cursor: 'not-allowed',
  },
  responseSection: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  responseHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
  },
  responseContent: {
    fontSize: 14,
    color: 'var(--foreground)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
  },
  loadingDots: {
    display: 'inline-flex',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: 'var(--muted-foreground)',
    animation: 'bounce 1.4s infinite ease-in-out both',
  },
  expandButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 11,
    color: 'var(--muted-foreground)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  cardChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    marginRight: 4,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: fontWeight.medium,
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    borderRadius: radii.pill,
  },
};

// ============================================================================
// Agent Config
// ============================================================================

const AGENT_CONFIG: Record<AgentType, { label: string; icon: React.FC }> = {
  claude: { label: 'Claude', icon: ClaudeIcon },
  codex: { label: 'Codex', icon: CodexIcon },
  gemini: { label: 'Gemini', icon: GeminiIcon },
};

// Mock AI response for frontend demo
const MOCK_RESPONSE = `Based on your selected context, here are my recommendations:

1. **Authentication Flow**: The JWT implementation looks solid. Consider adding:
   - Token refresh mechanism on the client side
   - Automatic retry logic for 401 responses

2. **Security Considerations**:
   - Add rate limiting on login endpoints
   - Implement account lockout after failed attempts
   - Consider adding CAPTCHA for suspicious activity

3. **Next Steps**:
   - Create API endpoint handlers
   - Set up token validation middleware
   - Add user session management

Would you like me to elaborate on any of these points?`;

// ============================================================================
// Props
// ============================================================================

interface AIPromptPanelProps {
  cards: MarkdownCard[];
  connections: WorkflowConnection[];
  selectedCardIds: string[];
  lineSelections?: Record<string, LineRange[]>;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function AIPromptPanel({
  cards,
  connections,
  selectedCardIds,
  lineSelections = {},
  onClose,
}: AIPromptPanelProps): React.JSX.Element {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('claude');
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [showFullContext, setShowFullContext] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [closeHovered, setCloseHovered] = useState(false);

  // Build context from selection
  const context: AIContext = useMemo(() => {
    return buildContextFromSelection(cards, connections, selectedCardIds, lineSelections);
  }, [cards, connections, selectedCardIds, lineSelections]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Handle prompt change
  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setPrompt(e.target.value);
  }, []);

  // Handle agent selection
  const handleAgentChange = useCallback((agent: AgentType): void => {
    setSelectedAgent(agent);
  }, []);

  // Handle submit (mock AI response)
  const handleSubmit = useCallback((): void => {
    if (prompt.trim().length === 0) return;

    setIsLoading(true);
    setResponse(null);

    // Simulate API delay
    setTimeout(() => {
      setResponse(MOCK_RESPONSE);
      setIsLoading(false);
    }, 1500);
  }, [prompt]);

  // Handle keyboard submit (Cmd+Enter)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Toggle context view
  const handleToggleContext = useCallback((): void => {
    setShowFullContext((prev) => !prev);
  }, []);

  const contextSummary = getContextSummary(context);
  const hasContext = context.selectedCards.length > 0 || context.connectedCards.length > 0;
  const canSubmit = prompt.trim().length > 0 && !isLoading;

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <SparklesIcon />
            <span>AI Assistant</span>
          </div>
          <button
            style={{
              ...styles.closeButton,
              ...(closeHovered
                ? { backgroundColor: 'var(--accent)', color: 'var(--foreground)' }
                : {}),
            }}
            onClick={onClose}
            onMouseEnter={() => {
              setCloseHovered(true);
            }}
            onMouseLeave={() => {
              setCloseHovered(false);
            }}
            title="Close (Escape)"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Context Preview */}
          <div style={styles.section}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={styles.sectionTitle}>Context</span>
              {hasContext ? (
                <button style={styles.expandButton} onClick={handleToggleContext}>
                  <span>{showFullContext ? 'Hide details' : 'Show details'}</span>
                  <ChevronDownIcon />
                </button>
              ) : null}
            </div>
            <div style={styles.contextPreview}>
              {hasContext ? (
                <>
                  <div>
                    {context.selectedCards.map((card) => (
                      <span key={card.cardId} style={styles.cardChip}>
                        {card.cardName}
                      </span>
                    ))}
                  </div>
                  {showFullContext ? (
                    <pre
                      style={{ marginTop: 8, fontSize: 11, whiteSpace: 'pre-wrap', opacity: 0.8 }}
                    >
                      {context.formattedContext.substring(0, 1000)}
                      {context.formattedContext.length > 1000 ? '...' : ''}
                    </pre>
                  ) : null}
                </>
              ) : (
                <span style={styles.contextEmpty}>
                  No cards selected. Select cards to include them in the AI context.
                </span>
              )}
            </div>
            {hasContext ? <div style={styles.contextSummary}>{contextSummary}</div> : null}
          </div>

          {/* Agent Selector */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>AI Agent</div>
            <div style={styles.agentSelector}>
              {(Object.keys(AGENT_CONFIG) as AgentType[]).map((agent) => {
                const config = AGENT_CONFIG[agent];
                const Icon = config.icon;
                return (
                  <button
                    key={agent}
                    style={{
                      ...styles.agentButton,
                      ...(selectedAgent === agent ? styles.agentButtonActive : {}),
                    }}
                    onClick={() => {
                      handleAgentChange(agent);
                    }}
                  >
                    <Icon />
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt Input */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Prompt</div>
            <div style={styles.promptContainer}>
              <textarea
                ref={textareaRef}
                style={styles.promptTextarea}
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your workflow... (Cmd+Enter to send)"
              />
              <button
                style={{
                  ...styles.sendButton,
                  ...(canSubmit ? {} : styles.sendButtonDisabled),
                }}
                onClick={handleSubmit}
                disabled={!canSubmit}
                title="Send (Cmd+Enter)"
              >
                <SendIcon />
              </button>
            </div>
          </div>

          {/* Response */}
          {isLoading || response !== null ? (
            <div style={styles.responseSection}>
              <div style={styles.responseHeader}>
                <SparklesIcon />
                <span>Response from {AGENT_CONFIG[selectedAgent].label}</span>
              </div>
              {isLoading ? (
                <div style={styles.loadingDots}>
                  <span style={{ ...styles.dot, animationDelay: '0s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
                </div>
              ) : (
                <div style={styles.responseContent}>{response}</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
