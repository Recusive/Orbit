/**
 * AgentExpandedView
 * Full-screen expanded view for an agent node in missions mode.
 * Uses the actual agent app components (ChatArea, ActionsBar) for identical UI.
 *
 * This renders the same UI as the main agent page, minus the primary sidebar and headers.
 */

import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentCard } from '../types';

// Import actual agent components - these work because canvas is embedded in agent app
import { ActionsBar } from '@/components/layout/actions-bar';
import { ChatArea } from '@/components/layout/chat-area';
import { useUIStore } from '@/stores/ui/ui-store';

import './AgentExpandedView.css';

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
          {/*
           * TODO: ChatArea currently shows the main app's conversation, NOT this agent's data.
           * To properly integrate agent-specific chat:
           * 1. Create an agent session context provider that sets the active session ID
           * 2. Pass agent.sessionId (need to add to AgentCard type) to switch conversations
           * 3. Or implement a separate AgentChat component that takes agent context
           *
           * For now, this expanded view shows the main conversation as a placeholder.
           */}
          <ChatArea />

          {/* ActionsBar - Activity Panel tab switcher (only when panel is open) */}
          {rightSidebarOpen ? <ActionsBar /> : null}
        </div>
      </div>
    </div>
  );
}
