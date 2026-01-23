/**
 * AgentCardNode
 * ReactFlow node component for agent cards in missions mode
 *
 * All state-dependent properties (colors, icons, behaviors) are derived from
 * the centralized agent-states.ts configuration. No inline state logic here.
 *
 * Layout (200px wide):
 * 1. Header: Status icon (colored bg) + Agent name + action buttons
 * 2. Task: Task name in quotes, muted color
 * 3. Progress: Block character bar with percentage
 * 4. Step: Current step with prefix (when stateConfig.showCurrentStep)
 */

import { Handle, Position } from '@xyflow/react';
import { Code, ListTodo, Search, Trash2 } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';

import { getAgentModelConfig, getAgentTypeDisplayConfig } from '../types';

import { formatProgressBar, getStateConfig, isActiveState } from './agent-states';

import type { AgentCardNodeData, AgentType } from '../types';
import type { Node, NodeProps } from '@xyflow/react';

// Icon mapping for agent types
const AGENT_TYPE_ICONS: Record<AgentType, React.ComponentType<{ size: number }>> = {
  full: Code,
  review: Search,
  plan: ListTodo,
};

import './AgentCardNode.css';

// ============================================================================
// Component
// ============================================================================

export function AgentCardNode({
  data,
  selected,
}: NodeProps<Node<AgentCardNodeData>>): React.JSX.Element {
  const { agent, onUpdate, onExecute, onStop, onConfigure, onDelete, onExpand } = data;

  // Local state for inline name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(agent.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Derive all visual/behavioral properties from centralized config
  const status = agent.execution.status;
  const stateConfig = getStateConfig(status);
  const modelConfig = getAgentModelConfig(agent.config.model);
  const isRunning = isActiveState(status);

  // Agent type configuration
  const agentType = agent.agentTypeConfig.agentType;
  const agentTypeConfig = getAgentTypeDisplayConfig(agentType);
  const AgentTypeIcon = AGENT_TYPE_ICONS[agentType];

  // Get current step from activity log (last in-progress entry)
  const currentStep =
    agent.execution.activityLog.find((entry) => entry.status === 'in_progress')?.message ?? null;

  // Task display (from prompt, truncated)
  const taskName = agent.prompt.length > 0 ? agent.prompt.slice(0, 50) : null;

  // Progress: for now, use a mock value based on status
  // In production, this would come from execution state
  const progress =
    status === 'complete' ? 100 : status === 'running' || status === 'streaming' ? 60 : 0;

  // Status icon component
  const StatusIcon = stateConfig.icon;

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

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setNameValue(e.target.value);
  }, []);

  const handleNameBlur = useCallback((): void => {
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

  const handlePrimaryAction = useCallback((): void => {
    switch (stateConfig.actionType) {
      case 'configure':
        onConfigure?.(agent.id);
        break;
      case 'run':
      case 'rerun':
      case 'retry':
      case 'resume':
        onExecute?.(agent.id);
        break;
      case 'pause':
      case 'stop':
        onStop?.(agent.id);
        break;
      case 'view-diff':
      case 'view-error':
        // TODO: Implement view-diff and view-error actions
        break;
    }
  }, [agent.id, stateConfig.actionType, onConfigure, onExecute, onStop]);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onDelete?.(agent.id);
    },
    [agent.id, onDelete]
  );

  // Handle double-click to expand (except on name or buttons)
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (isEditingName) return;
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

  const ActionIcon = stateConfig.actionIcon;

  // Build class names
  const cardClasses = [
    'agent-card-node',
    `agent-card-node--${agentType}`,
    selected ? 'agent-card-node--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClasses}
      data-status={status}
      data-id={agent.id}
      onDoubleClick={handleDoubleClick}
      style={
        {
          // Pass icon background colors to CSS for light-dark() usage
          '--icon-bg-light': stateConfig.iconBackground,
          '--icon-bg-dark': stateConfig.iconBackgroundDark,
          '--icon-color': stateConfig.iconColor,
        } as React.CSSProperties
      }
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="agent-card-handle agent-card-handle--input"
      />

      {/* Header Row: Status Icon + Name + Action Buttons */}
      <div className="agent-card-header">
        <div className="agent-card-header-left">
          {/* Status Icon with colored background */}
          <div className="agent-card-status-icon">
            <StatusIcon size={16} />
          </div>

          <div className="agent-card-name-section">
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
            <div className="agent-card-badges">
              {/* Agent Type Badge */}
              <span
                className="agent-card-type-badge"
                style={
                  {
                    '--type-color': agentTypeConfig.color,
                    '--type-color-dark': agentTypeConfig.colorDark,
                  } as React.CSSProperties
                }
                title={agentTypeConfig.description}
              >
                <AgentTypeIcon size={10} />
                <span>{agentTypeConfig.shortLabel}</span>
              </span>
              {/* Model Badge */}
              <span className="agent-card-model-badge">{modelConfig.label}</span>
            </div>
          </div>
        </div>
        <div className="agent-card-header-right">
          <button
            className="agent-card-action-btn"
            onClick={handlePrimaryAction}
            title={stateConfig.actionLabel}
            aria-label={stateConfig.actionLabel}
            style={{ color: isRunning ? stateConfig.textColor : undefined }}
          >
            <ActionIcon size={14} />
          </button>
          <button
            className="agent-card-action-btn agent-card-action-btn--danger"
            onClick={handleDeleteClick}
            title="Delete"
            aria-label="Delete agent"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Task Name */}
      {taskName !== null && (
        <div className="agent-card-task">
          &ldquo;{taskName}
          {agent.prompt.length > 50 ? '...' : ''}&rdquo;
        </div>
      )}

      {/* Progress Bar (only when running or complete) */}
      {isRunning || status === 'complete' ? (
        <div className="agent-card-progress">
          <span className="agent-card-progress-bar">{formatProgressBar(progress)}</span>
          <span className="agent-card-progress-pct">{progress}%</span>
        </div>
      ) : null}

      {/* Current Step - Always visible with placeholder when no step */}
      <div
        className={`agent-card-step ${stateConfig.isAnimated ? 'agent-card-step--animated' : ''}`}
        style={
          {
            '--step-icon-color': stateConfig.iconColor,
          } as React.CSSProperties
        }
      >
        <span className="agent-card-step-icon">
          <StatusIcon size={12} />
        </span>
        <span className="agent-card-step-text">{currentStep ?? stateConfig.stepPlaceholder}</span>
      </div>

      {/* Error Message */}
      {status === 'error' && agent.execution.errorMessage !== undefined && (
        <div className="agent-card-error">
          <stateConfig.icon size={12} />
          <span>{agent.execution.errorMessage}</span>
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="agent-card-handle agent-card-handle--output"
      />
    </div>
  );
}
