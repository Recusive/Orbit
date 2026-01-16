/**
 * AgentExpandedView
 * Full-screen expanded view for an agent node in missions mode.
 * Uses the actual agent app components (ChatArea, ActionsBar) for identical UI.
 *
 * This renders the same UI as the main agent page, minus the primary sidebar and headers.
 */

import { Minimize2, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import type { AgentCard } from '../types';

// Import actual agent components - these work because canvas is embedded in agent app
import { ActionsBar } from '@/components/layout/actions-bar';
import { ChatArea } from '@/components/layout/chat-area';
import { useReviewPanelOpen } from '@/stores/ui/ui-store';

import './AgentExpandedView.css';

// ============================================================================
// Types
// ============================================================================

interface AgentExpandedViewProps {
  readonly agent: AgentCard;
  readonly onClose: () => void;
  readonly onUpdate?: (agentId: string, updates: Partial<AgentCard>) => void;
}

// ============================================================================
// Component
// ============================================================================

export function AgentExpandedView({ agent, onClose }: AgentExpandedViewProps): React.JSX.Element {
  const [isClosing, setIsClosing] = useState(false);
  const rightSidebarOpen = useReviewPanelOpen();

  const handleClose = useCallback((): void => {
    setIsClosing(true);
    // Wait for animation to complete
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  // Handle keyboard shortcuts
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
              className="agent-expanded-header-btn"
              onClick={handleClose}
              title="Collapse (Esc)"
              aria-label="Collapse agent view"
            >
              <Minimize2 size={16} />
            </button>
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
          {/* ChatArea includes: ChatHeader, ChatContent, ActivityPanel, TerminalPanel */}
          <ChatArea />

          {/* ActionsBar - Activity Panel tab switcher (only when panel is open) */}
          {rightSidebarOpen ? <ActionsBar /> : null}
        </div>
      </div>
    </div>
  );
}
