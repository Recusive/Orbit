/**
 * AgentCardNode
 * ReactFlow node component for agent cards in missions mode
 *
 * Design system aligned with:
 * - Rounded corners: 8px (--radius-lg)
 * - Typography: 13px body, 11px secondary, 10px tiny
 * - Shadows: Subtle elevation system
 * - Colors: Semantic status colors from design tokens
 */

import { Handle, Position } from '@xyflow/react';
import React, { useCallback, useRef, useState } from 'react';

import { getAgentModelConfig, getAgentStatusLabel } from '../types';

import type { ActivityLogEntry, AgentCardNodeData, AgentStatus } from '../types';
import type { Node, NodeProps } from '@xyflow/react';

import './AgentCardNode.css';

// ============================================================================
// Icons (16x16, stroke-width 1.5 for consistency)
// ============================================================================

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l15 8-15 8V4z" />
    </svg>
  );
}

function StopIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  );
}

function AlertCircleIcon(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ExpandIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: AgentStatus }): React.JSX.Element {
  const label = getAgentStatusLabel(status);

  return (
    <span className={`agent-card-status-badge agent-card-status-badge--${status}`}>
      <span className="agent-card-status-dot" />
      <span className="agent-card-status-label">{label}</span>
    </span>
  );
}

// ============================================================================
// Activity Log Item
// ============================================================================

function StepItem({ entry }: { entry: ActivityLogEntry }): React.JSX.Element {
  return (
    <div className={`agent-card-step agent-card-step--${entry.status}`}>
      <span className="agent-card-step-bullet" />
      <span className="agent-card-step-text">{entry.message}</span>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function AgentCardNode({
  data,
  selected,
}: NodeProps<Node<AgentCardNodeData>>): React.JSX.Element {
  const { agent, onUpdate, onExecute, onStop, onConfigure, onDelete, onExpand } = data;
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(agent.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const status = agent.execution.status;
  const isRunning = status === 'running' || status === 'streaming';
  const modelConfig = getAgentModelConfig(agent.config.model);
  const canExecute = onExecute !== undefined && onStop !== undefined;

  // Get the last few activity log entries (show max 3)
  const activityLog = agent.execution.activityLog.slice(-3);
  const hasActivity = activityLog.length > 0;

  // ============================================================================
  // Name Editing
  // ============================================================================

  const handleNameDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      setIsEditingName(true);
      setNameValue(agent.name);
      setTimeout(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 0);
    },
    [agent.name]
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNameValue(e.target.value);
  }, []);

  const handleNameBlur = useCallback(() => {
    setIsEditingName(false);
    const trimmedName = nameValue.trim();
    if (trimmedName.length > 0 && trimmedName !== agent.name) {
      onUpdate?.(agent.id, { name: trimmedName });
    } else {
      setNameValue(agent.name);
    }
  }, [agent.id, agent.name, nameValue, onUpdate]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNameBlur();
      } else if (e.key === 'Escape') {
        setNameValue(agent.name);
        setIsEditingName(false);
      }
    },
    [agent.name, handleNameBlur]
  );

  // ============================================================================
  // Actions
  // ============================================================================

  const handleRunClick = useCallback(() => {
    if (isRunning) {
      onStop?.(agent.id);
    } else {
      onExecute?.(agent.id);
    }
  }, [agent.id, isRunning, onExecute, onStop]);

  const handleConfigureClick = useCallback(() => {
    onConfigure?.(agent.id);
  }, [agent.id, onConfigure]);

  const handleDeleteClick = useCallback(() => {
    onDelete?.(agent.id);
  }, [agent.id, onDelete]);

  const handleExpandClick = useCallback(() => {
    onExpand?.(agent.id);
  }, [agent.id, onExpand]);

  // Handle double-click to expand
  // Ignore when: editing name, clicking buttons, or clicking the name (for rename)
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      // Don't expand while editing name - prevents race condition
      if (isEditingName) {
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.closest('button') !== null ||
        target.closest('input') !== null ||
        target.closest('.agent-card-name') !== null
      ) {
        return;
      }
      e.stopPropagation();
      onExpand?.(agent.id);
    },
    [agent.id, isEditingName, onExpand]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      className={`agent-card-node ${selected ? 'agent-card-node--selected' : ''}`}
      data-status={status}
      onDoubleClick={handleDoubleClick}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="agent-card-handle agent-card-handle--input"
      />

      {/* Header */}
      <div className="agent-card-header">
        <div className="agent-card-header-content">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              className="agent-card-name-input"
              value={nameValue}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
            />
          ) : (
            <span
              className="agent-card-name"
              onDoubleClick={handleNameDoubleClick}
              title="Double-click to rename"
            >
              {agent.name}
            </span>
          )}
          <span className="agent-card-model-badge">{modelConfig.label}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Steps Section */}
      <div className="agent-card-body">
        {hasActivity ? (
          <div className="agent-card-steps">
            {activityLog.map((entry) => (
              <StepItem key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="agent-card-idle">
            <span className="agent-card-idle-icon">⏺</span>
            <span className="agent-card-idle-text">
              {agent.prompt.length > 0 ? 'Ready to run' : 'Click to configure'}
            </span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {status === 'error' && agent.execution.errorMessage !== undefined && (
        <div className="agent-card-error">
          <AlertCircleIcon />
          <span>{agent.execution.errorMessage}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="agent-card-actions">
        <button
          className={`agent-card-btn agent-card-btn--primary ${isRunning ? 'agent-card-btn--stop' : ''}`}
          onClick={handleRunClick}
          disabled={!canExecute}
          title={canExecute ? (isRunning ? 'Stop' : 'Run') : 'Not available'}
        >
          {isRunning ? <StopIcon /> : <PlayIcon />}
          <span>{isRunning ? 'Stop' : 'Run'}</span>
        </button>
        <div className="agent-card-actions-secondary">
          <button
            className="agent-card-btn agent-card-btn--icon"
            onClick={handleExpandClick}
            title="Expand"
            aria-label="Expand agent"
          >
            <ExpandIcon />
          </button>
          <button
            className="agent-card-btn agent-card-btn--icon"
            onClick={handleConfigureClick}
            title="Configure"
            aria-label="Configure agent"
          >
            <SettingsIcon />
          </button>
          <button
            className="agent-card-btn agent-card-btn--icon agent-card-btn--danger"
            onClick={handleDeleteClick}
            title="Delete"
            aria-label="Delete agent"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="agent-card-handle agent-card-handle--output"
      />
    </div>
  );
}
