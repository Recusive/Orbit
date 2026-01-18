/**
 * AddAgentDialog
 * Dialog for selecting agent type when adding a new agent to the canvas.
 *
 * Features:
 * - Agent type selection (Full, Review, Plan)
 * - Review scope selection for Review agent type
 * - Dynamic form fields based on review scope
 */

import { Code, Info, ListTodo, Search } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import {
  AGENT_TYPE_CONFIGS,
  createAgentTypeConfig,
  REVIEW_SCOPE_CONFIGS,
} from '../types/agent-types';

import type { AgentType, AgentTypeConfig, ReviewScope } from '../types/agent-types';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import './AddAgentDialog.css';

// ============================================================================
// Icons
// ============================================================================

const AGENT_TYPE_ICONS: Record<AgentType, React.FC<{ className?: string }>> = {
  full: Code,
  review: Search,
  plan: ListTodo,
};

// ============================================================================
// Types
// ============================================================================

interface AddAgentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAddAgent: (config: AgentTypeConfig, name: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function AddAgentDialog({
  open,
  onOpenChange,
  onAddAgent,
}: AddAgentDialogProps): React.JSX.Element {
  // State
  const [selectedType, setSelectedType] = useState<AgentType>('full');
  const [agentName, setAgentName] = useState('');
  const [reviewScope, setReviewScope] = useState<ReviewScope>('uncommitted');
  const [baseBranch, setBaseBranch] = useState('main');
  const [prRef, setPrRef] = useState('');
  const [commitSha, setCommitSha] = useState('');

  // Reset form when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean): void => {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form state when closing
        setSelectedType('full');
        setAgentName('');
        setReviewScope('uncommitted');
        setBaseBranch('main');
        setPrRef('');
        setCommitSha('');
      }
    },
    [onOpenChange]
  );

  // Handle form submission
  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault();

      // Generate agent ID and name
      const id = `agent-${String(Date.now())}`;
      const name = agentName.trim() || AGENT_TYPE_CONFIGS[selectedType].label;

      // Build config based on selected type
      let config: AgentTypeConfig;

      if (selectedType === 'review') {
        // Build review config with conditional optional properties
        // (exactOptionalPropertyTypes requires we don't set undefined)
        const reviewConfig: AgentTypeConfig = {
          id,
          name,
          agentType: 'review',
          reviewScope,
        };

        // Only add optional properties if they have values
        if (reviewScope === 'branch' && baseBranch !== '') {
          (reviewConfig as { baseBranch?: string }).baseBranch = baseBranch;
        }
        if (reviewScope === 'pr' && prRef !== '') {
          (reviewConfig as { prRef?: string }).prRef = prRef;
        }
        if (reviewScope === 'commit' && commitSha !== '') {
          (reviewConfig as { commitSha?: string }).commitSha = commitSha;
        }

        config = reviewConfig;
      } else {
        config = createAgentTypeConfig(selectedType, id, name);
      }

      onAddAgent(config, name);
      handleOpenChange(false);
    },
    [
      selectedType,
      agentName,
      reviewScope,
      baseBranch,
      prRef,
      commitSha,
      onAddAgent,
      handleOpenChange,
    ]
  );

  // Get current review scope config for conditional fields
  const currentScopeConfig = REVIEW_SCOPE_CONFIGS[reviewScope];

  // Validation: Check if required fields are filled for the selected review scope
  const isReviewScopeValid = (): boolean => {
    if (selectedType !== 'review') return true;

    switch (reviewScope) {
      case 'pr':
        return prRef.trim().length > 0;
      case 'commit':
        return commitSha.trim().length > 0;
      case 'branch':
        return baseBranch.trim().length > 0;
      case 'uncommitted':
      case 'staged':
        return true;
      default:
        return true;
    }
  };

  const canSubmit = isReviewScopeValid();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="add-agent-dialog">
        <DialogHeader>
          <DialogTitle>Add Agent</DialogTitle>
          <DialogDescription>Choose an agent type and configure its settings.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="add-agent-form">
          {/* Agent Type Selection */}
          <div className="add-agent-section">
            <label className="add-agent-label">Agent Type</label>
            <div className="add-agent-type-grid">
              {(Object.keys(AGENT_TYPE_CONFIGS) as AgentType[]).map((type) => {
                const typeConfig = AGENT_TYPE_CONFIGS[type];
                const Icon = AGENT_TYPE_ICONS[type];
                const isSelected = selectedType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    className={`add-agent-type-option ${isSelected ? 'add-agent-type-option--selected' : ''}`}
                    onClick={() => {
                      setSelectedType(type);
                    }}
                    style={
                      {
                        '--agent-type-color': typeConfig.color,
                      } as React.CSSProperties
                    }
                  >
                    <div className="add-agent-type-icon">
                      <Icon className="add-agent-type-icon-svg" />
                    </div>
                    <div className="add-agent-type-info">
                      <span className="add-agent-type-label">{typeConfig.label}</span>
                      <span className="add-agent-type-desc">{typeConfig.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent Name */}
          <div className="add-agent-section">
            <label className="add-agent-label" htmlFor="agent-name">
              Agent Name <span className="add-agent-optional">(optional)</span>
            </label>
            <input
              id="agent-name"
              type="text"
              className="add-agent-input"
              placeholder={`e.g., "${AGENT_TYPE_CONFIGS[selectedType].label}"`}
              value={agentName}
              onChange={(e) => {
                setAgentName(e.target.value);
              }}
            />
          </div>

          {/* Review Scope (only for review agents) */}
          {selectedType === 'review' ? (
            <div className="add-agent-section">
              <label className="add-agent-label">Review Scope</label>
              <div className="add-agent-scope-grid">
                {(Object.keys(REVIEW_SCOPE_CONFIGS) as ReviewScope[]).map((scope) => {
                  const scopeConfig = REVIEW_SCOPE_CONFIGS[scope];
                  const isSelected = reviewScope === scope;

                  return (
                    <button
                      key={scope}
                      type="button"
                      className={`add-agent-scope-option ${isSelected ? 'add-agent-scope-option--selected' : ''}`}
                      onClick={() => {
                        setReviewScope(scope);
                      }}
                    >
                      <span className="add-agent-scope-label">{scopeConfig.label}</span>
                      <span className="add-agent-scope-desc">{scopeConfig.description}</span>
                    </button>
                  );
                })}
              </div>

              {/* Scope-specific inputs */}
              {currentScopeConfig.requiresAdditionalInput ? (
                <div className="add-agent-scope-input">
                  <label className="add-agent-label" htmlFor="scope-input">
                    {currentScopeConfig.inputLabel}
                  </label>
                  <input
                    id="scope-input"
                    type="text"
                    className="add-agent-input"
                    placeholder={currentScopeConfig.inputPlaceholder}
                    value={reviewScope === 'pr' ? prRef : reviewScope === 'commit' ? commitSha : ''}
                    onChange={(e) => {
                      if (reviewScope === 'pr') {
                        setPrRef(e.target.value);
                      } else if (reviewScope === 'commit') {
                        setCommitSha(e.target.value);
                      }
                    }}
                  />
                </div>
              ) : reviewScope === 'branch' ? (
                <div className="add-agent-scope-input">
                  <label className="add-agent-label" htmlFor="base-branch">
                    Base Branch
                  </label>
                  <input
                    id="base-branch"
                    type="text"
                    className="add-agent-input"
                    placeholder="main"
                    value={baseBranch}
                    onChange={(e) => {
                      setBaseBranch(e.target.value);
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Plan Mode Info (for plan agents) */}
          {selectedType === 'plan' ? (
            <div className="add-agent-info-box">
              <Info className="add-agent-info-icon" />
              <span className="add-agent-info-text">
                Plan agents start in <strong>Plan Mode</strong>, which restricts the agent to
                read-only tools (Glob, Grep, Read) until it creates an implementation plan.
              </span>
            </div>
          ) : null}

          {/* Actions */}
          <div className="add-agent-actions">
            <button
              type="button"
              className="add-agent-btn add-agent-btn--secondary"
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="add-agent-btn add-agent-btn--primary"
              disabled={!canSubmit}
            >
              Add Agent
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
