/**
 * AgentCardNode
 * ReactFlow node component for agent cards in missions mode
 */

import { Handle, Position } from '@xyflow/react';
import React, { useCallback, useState } from 'react';

import { getAgentModelConfig, getAgentStatusColor, getAgentStatusLabel } from '../types';

import type { AgentCardNodeData, AgentStatus } from '../types';
import type { Node, NodeProps } from '@xyflow/react';

import './AgentCardNode.css';

// ============================================================================
// Icons
// ============================================================================

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function StopIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" />
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
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function StatusDot({ status }: { status: AgentStatus }): React.JSX.Element {
  const color = getAgentStatusColor(status);
  const isAnimating = status === 'running' || status === 'streaming';

  return (
    <span
      className={`agent-card-status-dot ${isAnimating ? 'agent-card-status-dot--animating' : ''}`}
      style={{ backgroundColor: color }}
      title={getAgentStatusLabel(status)}
    />
  );
}

// ============================================================================
// Component
// ============================================================================

export function AgentCardNode({
  data,
  selected,
}: NodeProps<Node<AgentCardNodeData>>): React.JSX.Element {
  const { agent, onUpdate, onExecute, onStop, onConfigure, onDelete } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [promptValue, setPromptValue] = useState(agent.prompt);

  const status = agent.execution.status;
  const isRunning = status === 'running' || status === 'streaming';
  const hasOutput = agent.execution.currentOutput.length > 0;
  const modelConfig = getAgentModelConfig(agent.config.model);
  // Execution is only available when both callbacks are wired
  const canExecute = onExecute !== undefined && onStop !== undefined;

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptValue(e.target.value);
  }, []);

  const handlePromptBlur = useCallback(() => {
    setIsEditing(false);
    if (promptValue !== agent.prompt) {
      onUpdate?.(agent.id, { prompt: promptValue });
    }
  }, [agent.id, agent.prompt, onUpdate, promptValue]);

  const handlePromptKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault();
        handlePromptBlur();
        if (onExecute !== undefined) {
          onExecute(agent.id);
        }
      } else if (e.key === 'Escape') {
        setPromptValue(agent.prompt);
        setIsEditing(false);
      }
    },
    [agent.id, agent.prompt, handlePromptBlur, onExecute]
  );

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

  return (
    <div
      className={`agent-card-node ${selected ? 'agent-card-node--selected' : ''}`}
      data-status={status}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="agent-card-handle agent-card-handle--input"
      />

      {/* Header */}
      <div className="agent-card-header">
        <div className="agent-card-header-left">
          <StatusDot status={status} />
          <span className="agent-card-name">{agent.name}</span>
        </div>
        <div className="agent-card-header-right">
          <span className="agent-card-model-badge">{modelConfig.label}</span>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="agent-card-prompt-section">
        <label className="agent-card-label">Prompt</label>
        {isEditing ? (
          <textarea
            className="agent-card-prompt-input"
            value={promptValue}
            onChange={handlePromptChange}
            onBlur={handlePromptBlur}
            onKeyDown={handlePromptKeyDown}
            placeholder="Enter your prompt..."
            autoFocus
            rows={3}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label={agent.prompt.length > 0 ? 'Edit prompt' : 'Add prompt'}
            className="agent-card-prompt-display"
            onClick={() => {
              setIsEditing(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsEditing(true);
              }
            }}
          >
            {agent.prompt.length > 0 ? agent.prompt : 'Click to add prompt...'}
          </div>
        )}
      </div>

      {/* Output Section */}
      {hasOutput ? (
        <div className="agent-card-output-section">
          <label className="agent-card-label">Output</label>
          <div className="agent-card-output">
            {agent.execution.currentOutput}
            {status === 'streaming' && <span className="agent-card-cursor">|</span>}
          </div>
        </div>
      ) : null}

      {/* Error Section */}
      {status === 'error' && agent.execution.errorMessage !== undefined && (
        <div className="agent-card-error-section">
          <span className="agent-card-error-icon">!</span>
          <span className="agent-card-error-message">{agent.execution.errorMessage}</span>
        </div>
      )}

      {/* Actions */}
      <div className="agent-card-actions">
        <button
          className={`agent-card-action-btn agent-card-action-btn--primary ${isRunning ? 'agent-card-action-btn--running' : ''}`}
          onClick={handleRunClick}
          disabled={!canExecute}
          aria-disabled={!canExecute}
          title={canExecute ? (isRunning ? 'Stop' : 'Run') : 'Execution not available yet'}
        >
          {isRunning ? <StopIcon /> : <PlayIcon />}
          <span>{isRunning ? 'Stop' : 'Run'}</span>
        </button>
        <button className="agent-card-action-btn" onClick={handleConfigureClick} title="Configure">
          <SettingsIcon />
        </button>
        <button
          className="agent-card-action-btn agent-card-action-btn--delete"
          onClick={handleDeleteClick}
          title="Delete"
          aria-label="Delete agent"
        >
          &times;
        </button>
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
