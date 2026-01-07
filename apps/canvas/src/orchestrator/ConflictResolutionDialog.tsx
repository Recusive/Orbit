/**
 * ConflictResolutionDialog - UI for resolving conflicts between agent outputs
 *
 * When multiple agents modify the same property with different values,
 * this dialog presents options for the user to choose a resolution.
 */

import React from 'react';

import { spacing, radii, fontSize, fontWeight, shadows, motion } from '../lib/design/designTokens';

import type { Conflict, Resolution, ConflictStrategy } from './types';

export interface ResolutionOption {
  strategy: ConflictStrategy;
  label: string;
  description: string;
  value: unknown;
  confidence?: number;
}

export interface ConflictResolutionDialogProps {
  conflict: Conflict;
  options: ResolutionOption[];
  onResolve: (resolution: Resolution) => void;
  onDismiss?: () => void;
}

// Severity colors
const severityColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#ef4444',
    icon: '!',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#f59e0b',
    icon: '*',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#3b82f6',
    icon: 'ℹ',
  },
};

// Conflict type labels
const conflictTypeLabels: Record<string, string> = {
  position: 'Position Conflict',
  style: 'Style Conflict',
  code: 'Code Conflict',
  hierarchy: 'Structure Conflict',
};

export function ConflictResolutionDialog({
  conflict,
  options,
  onResolve,
  onDismiss,
}: ConflictResolutionDialogProps): React.ReactElement {
  const [selectedOption, setSelectedOption] = React.useState<ResolutionOption | null>(null);
  const [customReasoning, setCustomReasoning] = React.useState('');

  const defaultColors = {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#3b82f6',
    icon: 'ℹ',
  };
  const colors = severityColors[conflict.severity] ?? defaultColors;

  const handleResolve = (): void => {
    if (!selectedOption) return;

    const resolution: Resolution = {
      conflictId: conflict.id,
      strategy: selectedOption.strategy,
      resolvedValue: selectedOption.value,
      ...(customReasoning ? { reasoning: customReasoning } : {}),
    };

    onResolve(resolution);
  };

  // Find the recommended option (highest confidence)
  const recommendedOption = options.reduce<ResolutionOption | null>((best, opt) => {
    if (
      best === null ||
      (opt.confidence !== undefined &&
        opt.confidence > 0 &&
        (best.confidence === undefined ||
          best.confidence === 0 ||
          opt.confidence > best.confidence))
    ) {
      return opt;
    }
    return best;
  }, null);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          width: 480,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
          backgroundColor: 'var(--card)',
          borderRadius: radii.xl,
          border: '1px solid var(--border)',
          boxShadow: shadows.xl,
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: spacing.xl,
            borderBottom: '1px solid var(--border)',
            backgroundColor: colors.bg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <span
              style={{
                fontSize: fontSize.lg,
                color: colors.text,
              }}
            >
              {colors.icon}
            </span>
            <div>
              <h3
                style={{
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.semibold,
                  color: 'var(--foreground)',
                  margin: 0,
                }}
              >
                {conflictTypeLabels[conflict.type] ?? 'Conflict Detected'}
              </h3>
              <p
                style={{
                  fontSize: fontSize.xs,
                  color: 'var(--muted-foreground)',
                  margin: `${String(spacing.xs)}px 0 0 0`,
                }}
              >
                Multiple agents modified{' '}
                <code
                  style={{
                    backgroundColor: 'var(--muted)',
                    padding: `${String(spacing.xs)}px ${String(spacing.sm)}px`,
                    borderRadius: radii.sm,
                    fontSize: fontSize.xs,
                  }}
                >
                  {conflict.property}
                </code>{' '}
                on node{' '}
                <code
                  style={{
                    backgroundColor: 'var(--muted)',
                    padding: `${String(spacing.xs)}px ${String(spacing.sm)}px`,
                    borderRadius: radii.sm,
                    fontSize: fontSize.xs,
                  }}
                >
                  {conflict.nodeId}
                </code>
              </p>
            </div>
          </div>
        </div>

        {/* Conflict details */}
        <div style={{ padding: spacing.xl }}>
          <div style={{ marginBottom: spacing.xl }}>
            <h4
              style={{
                fontSize: fontSize.xs,
                fontWeight: fontWeight.semibold,
                color: 'var(--muted-foreground)',
                marginBottom: spacing.md,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Conflicting Values
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {conflict.agents.map((agent, index) => (
                <div
                  key={agent}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: spacing.md,
                    padding: spacing.md,
                    backgroundColor: 'var(--muted)',
                    borderRadius: radii.md,
                  }}
                >
                  <span
                    style={{
                      fontSize: fontSize.xs,
                      fontWeight: fontWeight.semibold,
                      color: 'var(--primary)',
                      minWidth: 80,
                    }}
                  >
                    {agent}
                  </span>
                  <code
                    style={{
                      flex: 1,
                      fontSize: fontSize.xs,
                      color: 'var(--foreground)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {formatValue(conflict.values[index])}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* Resolution options */}
          <div style={{ marginBottom: spacing.xl }}>
            <h4
              style={{
                fontSize: fontSize.xs,
                fontWeight: fontWeight.semibold,
                color: 'var(--muted-foreground)',
                marginBottom: spacing.md,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Choose Resolution
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {options.map((option, index) => {
                const isSelected = selectedOption === option;
                const isRecommended = option === recommendedOption;

                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedOption(option);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: spacing.md,
                      padding: spacing.lg,
                      backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: radii.md,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: `all ${motion.fast} ${motion.ease}`,
                    }}
                  >
                    {/* Radio indicator */}
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: isSelected ? '5px solid var(--primary)' : '2px solid var(--border)',
                        backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <span
                          style={{
                            fontSize: fontSize.sm,
                            fontWeight: fontWeight.medium,
                            color: 'var(--foreground)',
                          }}
                        >
                          {option.label}
                        </span>
                        {isRecommended ? (
                          <span
                            style={{
                              fontSize: fontSize.xs,
                              color: '#22c55e',
                              backgroundColor: 'rgba(34, 197, 94, 0.15)',
                              padding: `${String(spacing.xs)}px ${String(spacing.sm)}px`,
                              borderRadius: radii.sm,
                            }}
                          >
                            Recommended
                          </span>
                        ) : null}
                      </div>
                      <p
                        style={{
                          fontSize: fontSize.xs,
                          color: 'var(--muted-foreground)',
                          marginTop: spacing.xs,
                        }}
                      >
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional reasoning */}
          <div style={{ marginBottom: spacing.xl }}>
            <label
              style={{
                display: 'block',
                fontSize: fontSize.xs,
                fontWeight: fontWeight.medium,
                color: 'var(--muted-foreground)',
                marginBottom: spacing.sm,
              }}
            >
              Add note (optional)
            </label>
            <input
              type="text"
              value={customReasoning}
              onChange={(e) => {
                setCustomReasoning(e.target.value);
              }}
              placeholder="Why did you choose this resolution?"
              style={{
                width: '100%',
                padding: spacing.md,
                fontSize: fontSize.sm,
                color: 'var(--foreground)',
                backgroundColor: 'var(--input)',
                border: '1px solid var(--border)',
                borderRadius: radii.md,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: spacing.md,
            padding: spacing.xl,
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--muted)',
          }}
        >
          {onDismiss ? (
            <button
              onClick={onDismiss}
              style={{
                padding: `${String(spacing.md)}px ${String(spacing.xl)}px`,
                fontSize: fontSize.sm,
                fontWeight: fontWeight.medium,
                color: 'var(--muted-foreground)',
                backgroundColor: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: radii.md,
                cursor: 'pointer',
              }}
            >
              Skip
            </button>
          ) : null}
          <button
            onClick={handleResolve}
            disabled={!selectedOption}
            style={{
              padding: `${String(spacing.md)}px ${String(spacing.xl)}px`,
              fontSize: fontSize.sm,
              fontWeight: fontWeight.medium,
              color: selectedOption ? 'white' : 'var(--muted-foreground)',
              backgroundColor: selectedOption ? 'var(--primary)' : 'var(--muted)',
              border: 'none',
              borderRadius: radii.md,
              cursor: selectedOption ? 'pointer' : 'not-allowed',
              opacity: selectedOption ? 1 : 0.5,
            }}
          >
            Apply Resolution
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value.length > 100 ? value.substring(0, 97) + '...' : value;
  }

  if (typeof value === 'object') {
    const str = JSON.stringify(value, null, 2);
    return str.length > 200 ? str.substring(0, 197) + '...' : str;
  }

  // At this point, value is number, boolean, bigint, symbol, or function
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  return `[${typeof value}]`;
}
