/**
 * AgentExpandedView
 * Full-screen expanded view for an agent node in missions mode.
 * Uses the actual agent app components (ChatArea, ActionsBar) for identical UI.
 *
 * This renders the same UI as the main agent page, minus the primary sidebar and headers.
 *
 * Each agent node has its own persistent conversation:
 * - First expand → Creates new conversation (appears in Agent sidebar as "Mission: {agent.name}")
 * - Re-expand same node → Loads existing conversation
 * - Multiple nodes = Multiple separate conversations, all visible in the Agent sidebar
 */

import { createLogger } from '@orbit/common/lib';
import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useAgentConversation } from '../hooks';

import type { AgentCard } from '../types';

// Import actual agent components - these work because canvas is embedded in agent app
import { ActionsBar } from '@/components/layout/actions-bar';
import { ChatArea } from '@/components/layout/chat-area';
import { useUIStore } from '@/stores/ui/ui-store';

import './AgentExpandedView.css';

const logger = createLogger('AgentExpandedView');

// ============================================================================
// Types
// ============================================================================

interface AgentExpandedViewProps {
  /** The agent card to display - currently used for header info only */
  readonly agent: AgentCard;
  readonly onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function AgentExpandedView({ agent, onClose }: AgentExpandedViewProps): React.JSX.Element {
  const [isClosing, setIsClosing] = useState(false);
  const rightSidebarOpen = useUIStore((state) => state.rightSidebarOpen);
  const setChatAreaDetached = useUIStore((state) => state.setChatAreaDetached);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Initialize or load this agent's conversation.
  // - If agent.sessionId exists: loads that conversation
  // - If not: creates a new conversation and saves sessionId to agent
  // This ensures each agent node has its own persistent chat history.
  //
  // Returns sessionId locally tracked so it updates immediately when created,
  // unlike agent.sessionId prop which updates after parent re-renders.
  const { isInitializing, sessionId } = useAgentConversation({
    agent,
    onReady: (readySessionId) => {
      // Conversation is ready - ChatArea will automatically display it
      // since the conversation:created/loaded handlers update the global session state
      logger.debug('Conversation ready', { sessionId: readySessionId });
    },
  });

  // Detach the ChatArea in RootLayout while this expanded view is open.
  // This prevents duplicate listeners, backend requests, and localStorage races.
  useEffect(() => {
    setChatAreaDetached(true);
    return () => {
      setChatAreaDetached(false);
    };
  }, [setChatAreaDetached]);

  const handleClose = useCallback((): void => {
    setIsClosing(true);
    // Wait for animation to complete before calling onClose
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  // Handle keyboard shortcuts and cleanup timeout on unmount
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Only close on Escape if not typing in an input
      const target = e.target as HTMLElement;
      const isInputElement =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'Escape' && !isInputElement) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Clean up any pending close timeout to prevent memory leak
      if (closeTimeoutRef.current !== undefined) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [handleClose]);

  return (
    <div className={`agent-expanded-overlay ${isClosing ? 'agent-expanded-overlay--closing' : ''}`}>
      <div
        className={`agent-expanded-container ${isClosing ? 'agent-expanded-container--closing' : ''}`}
      >
        {/* Minimal Header - Just agent info and close button */}
        <div className="agent-expanded-header">
          <div className="agent-expanded-header-left">
            <div className="agent-expanded-status" data-status={agent.execution.status} />
            <span className="agent-expanded-name">{agent.name}</span>
            <span className="agent-expanded-model">{agent.config.model}</span>
          </div>
          <div className="agent-expanded-header-right">
            <button
              className="agent-expanded-header-btn agent-expanded-header-btn--close"
              onClick={handleClose}
              title="Close (Esc)"
              aria-label="Close agent view"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Main Content - Actual Agent UI */}
        <div className="agent-expanded-content">
          {/* Show loading indicator while conversation is being created/loaded */}
          {isInitializing ? (
            <div className="agent-expanded-loading">
              <span>Loading conversation...</span>
            </div>
          ) : (
            // KEY PROP: Forces ChatArea to completely remount when sessionId changes.
            // This is critical because ChatArea's internal useChatMessages hook has
            // its own message state that reads from localStorage on mount.
            // Without the key, switching sessions wouldn't reset the internal state.
            <ChatArea key={sessionId} />
          )}

          {/* ActionsBar - Activity Panel tab switcher (only when panel is open) */}
          {rightSidebarOpen ? <ActionsBar /> : null}
        </div>
      </div>
    </div>
  );
}
