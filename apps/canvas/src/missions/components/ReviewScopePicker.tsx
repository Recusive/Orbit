/**
 * ReviewScopePicker
 * Shows review scope options when a Review agent is first expanded.
 * User picks what to review, then we send the appropriate slash command.
 */

import { GitBranch, GitPullRequest, FileEdit } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import type { ReviewScope } from '../types/agent-types';

import './ReviewScopePicker.css';

// ============================================================================
// Types
// ============================================================================

interface ReviewOption {
  scope: ReviewScope;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  slashCommand: string;
  requiresInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
}

const REVIEW_OPTIONS: ReviewOption[] = [
  {
    scope: 'uncommitted',
    label: 'Uncommitted Changes',
    description: 'Review all staged and unstaged changes in the working directory',
    icon: FileEdit,
    slashCommand: '/review-uncommitted',
  },
  {
    scope: 'branch',
    label: 'Current Branch',
    description: 'Review all changes on the current branch compared to main',
    icon: GitBranch,
    slashCommand: '/review-branch',
    requiresInput: true,
    inputLabel: 'Base branch (optional)',
    inputPlaceholder: 'main',
  },
  {
    scope: 'pr',
    label: 'Pull Request',
    description: 'Review a specific GitHub pull request by number',
    icon: GitPullRequest,
    slashCommand: '/review-pr',
    requiresInput: true,
    inputLabel: 'PR number',
    inputPlaceholder: '123',
  },
];

interface ReviewScopePickerProps {
  /** Called when user selects a review scope - passes the slash command to send */
  readonly onSelect: (slashCommand: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ReviewScopePicker({ onSelect }: ReviewScopePickerProps): React.JSX.Element {
  const [selectedScope, setSelectedScope] = useState<ReviewScope | null>(null);
  const [inputValue, setInputValue] = useState('');

  const selectedOption = REVIEW_OPTIONS.find((opt) => opt.scope === selectedScope);

  const handleOptionClick = useCallback(
    (option: ReviewOption): void => {
      setSelectedScope(option.scope);
      setInputValue('');

      // If no input required, trigger immediately
      if (!option.requiresInput) {
        onSelect(option.slashCommand);
      }
    },
    [onSelect]
  );

  const handleStartReview = useCallback((): void => {
    if (selectedOption === undefined) return;

    // Build the slash command with argument if provided
    let command = selectedOption.slashCommand;
    if (selectedOption.requiresInput && inputValue.trim() !== '') {
      command = `${selectedOption.slashCommand} ${inputValue.trim()}`;
    } else if (selectedOption.scope === 'branch' && inputValue.trim() === '') {
      // Default to main for branch review
      command = `${selectedOption.slashCommand} main`;
    }

    onSelect(command);
  }, [selectedOption, inputValue, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' && selectedOption !== undefined) {
        handleStartReview();
      }
    },
    [selectedOption, handleStartReview]
  );

  return (
    <div className="review-scope-picker">
      <div className="review-scope-picker-header">
        <h3 className="review-scope-picker-title">What would you like to review?</h3>
        <p className="review-scope-picker-subtitle">Select a review scope to get started</p>
      </div>

      <div className="review-scope-picker-options">
        {REVIEW_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedScope === option.scope;

          return (
            <button
              key={option.scope}
              type="button"
              className={`review-scope-option ${isSelected ? 'review-scope-option--selected' : ''}`}
              onClick={() => {
                handleOptionClick(option);
              }}
            >
              <div className="review-scope-option-icon">
                <Icon className="review-scope-option-icon-svg" />
              </div>
              <div className="review-scope-option-content">
                <span className="review-scope-option-label">{option.label}</span>
                <span className="review-scope-option-desc">{option.description}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Show input field if selected option requires it */}
      {selectedOption?.requiresInput === true ? (
        <div className="review-scope-input-section">
          <label className="review-scope-input-label" htmlFor="review-input">
            {selectedOption.inputLabel}
          </label>
          <div className="review-scope-input-row">
            <input
              id="review-input"
              type="text"
              className="review-scope-input"
              placeholder={selectedOption.inputPlaceholder}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button type="button" className="review-scope-start-btn" onClick={handleStartReview}>
              Start Review
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
