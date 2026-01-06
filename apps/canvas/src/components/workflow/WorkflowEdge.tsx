import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import React, { memo, useCallback, useState, useEffect, useRef } from 'react';

import { radii, fontWeight } from '../../lib/designTokens';

import type { WorkflowEdgeData, ContextFlowType } from '../../types/workflowTypes';
import type { EdgeProps, Edge } from '@xyflow/react';

// ============================================================================
// Direction Icons
// ============================================================================

const ArrowRightIcon = (): React.JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
);

const ArrowBothIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="7 8 3 12 7 16"></polyline>
    <polyline points="17 8 21 12 17 16"></polyline>
    <line x1="3" y1="12" x2="21" y2="12"></line>
  </svg>
);

// ============================================================================
// Context Flow Colors
// ============================================================================

const CONTEXT_FLOW_COLORS: Record<ContextFlowType, { edge: string; label: string; bg: string }> = {
  full: {
    edge: '#22c55e', // green-500
    label: '#16a34a', // green-600
    bg: 'rgba(34, 197, 94, 0.1)',
  },
  summary: {
    edge: '#3b82f6', // blue-500
    label: '#2563eb', // blue-600
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  none: {
    edge: '#6b7280', // gray-500
    label: '#4b5563', // gray-600
    bg: 'rgba(107, 114, 128, 0.1)',
  },
};

// ============================================================================
// Styles
// ============================================================================

const styles = {
  label: {
    position: 'absolute' as const,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'all' as const,
    cursor: 'pointer',
  },
  labelContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    // Clay background - secondary element color from brand
    backgroundColor: '#C4A98B',
    border: 'none',
    borderRadius: '10px',
    fontSize: 10,
    fontWeight: fontWeight.medium,
    // Dark brown text for contrast
    color: '#3D3630',
    boxShadow: '0 1px 4px rgba(92, 79, 61, 0.15)',
    transition: 'background-color 150ms ease, box-shadow 150ms ease',
    whiteSpace: 'nowrap' as const,
  },
  labelContainerHover: {
    // Slightly darker clay on hover
    backgroundColor: '#B89A7A',
    boxShadow: '0 2px 6px rgba(92, 79, 61, 0.25)',
  },
  labelContainerSelected: {
    // Coral for selected state - accent color
    backgroundColor: '#E07A6B',
    color: '#fff',
  },
  directionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  editInput: {
    padding: '4px 8px',
    backgroundColor: 'var(--card)',
    border: '1px solid var(--primary)',
    borderRadius: radii.sm,
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
    outline: 'none',
    minWidth: 100,
  },
  tooltip: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px',
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: 180,
    maxWidth: 260,
    zIndex: 50,
    // Smooth ease-out animation: 150ms, cubic-bezier(0.16, 1, 0.3, 1)
    animation: 'tooltipFadeIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
    willChange: 'transform, opacity',
  },
  tooltipArrow: {
    position: 'absolute' as const,
    top: '-6px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderBottom: '6px solid var(--border)',
  },
  tooltipArrowInner: {
    position: 'absolute' as const,
    top: '-4px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderBottom: '5px solid var(--popover)',
  },
  tooltipHeader: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)',
  },
  tooltipDescription: {
    fontSize: 12,
    color: 'var(--muted-foreground)',
    lineHeight: 1.5,
    marginBottom: '10px',
  },
  tooltipRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    marginBottom: '6px',
  },
  tooltipLabel: {
    color: 'var(--muted-foreground)',
  },
  tooltipValue: {
    color: 'var(--foreground)',
    fontWeight: fontWeight.medium,
  },
  contextFlowBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: 10,
    fontWeight: fontWeight.medium,
  },
};

// ============================================================================
// Tooltip Animation CSS - Following animation best practices
// Duration: 150ms (quick, under 300ms)
// Easing: Smooth ease-out cubic-bezier(0.16, 1, 0.3, 1)
// Properties: Only transform and opacity (GPU accelerated)
// ============================================================================

const tooltipAnimationCSS = `
@keyframes tooltipFadeIn {
	from {
		opacity: 0;
		transform: translateX(-50%) translateY(-8px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: translateX(-50%) translateY(0) scale(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.edge-tooltip {
		animation: none !important;
		opacity: 1 !important;
		transform: translateX(-50%) translateY(0) scale(1) !important;
	}
}
`;

// ============================================================================
// WorkflowEdge Component - Simple curved edge without arrows, with label
// ============================================================================

// Tooltip hover delay in ms (0 for instant)
const TOOLTIP_DELAY = 0;

function WorkflowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style,
  markerEnd,
}: EdgeProps<Edge>): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const tooltipTimerRef = useRef<number | null>(null);

  const edgeData = data as WorkflowEdgeData | undefined;
  const connection = edgeData?.connection;
  const contextFlow = connection?.contextFlow ?? 'full';
  const contextFlowColors = CONTEXT_FLOW_COLORS[contextFlow];

  // Get the bezier path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Clear tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current !== null) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  // Handle mouse enter with delayed tooltip
  const handleMouseEnter = useCallback((): void => {
    setIsHovered(true);
    // Show tooltip after delay
    tooltipTimerRef.current = window.setTimeout(() => {
      setShowTooltip(true);
    }, TOOLTIP_DELAY);
  }, []);

  // Handle mouse leave
  const handleMouseLeave = useCallback((): void => {
    setIsHovered(false);
    setShowTooltip(false);
    if (tooltipTimerRef.current !== null) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  // Edge color based on state - subtle hover, not too bright
  const getEdgeColor = (): string => {
    if (selected === true) return 'var(--primary)';
    if (isHovered) return 'var(--muted-foreground)';
    return 'var(--border)';
  };

  // Handle label double-click to edit
  const handleLabelDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (connection !== undefined) {
        setEditValue(connection.label);
        setIsEditing(true);
      }
    },
    [connection]
  );

  // Handle edit input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setEditValue(e.target.value);
  }, []);

  // Handle edit input blur
  const handleInputBlur = useCallback((): void => {
    setIsEditing(false);
    if (connection !== undefined && edgeData?.onUpdate !== undefined) {
      edgeData.onUpdate(connection.id, { label: editValue });
    }
  }, [connection, edgeData, editValue]);

  // Handle edit input key down
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        handleInputBlur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
      }
    },
    [handleInputBlur]
  );

  // Get label container style based on state
  const getLabelStyle = (): React.CSSProperties => {
    let labelStyle = { ...styles.labelContainer };
    if (selected === true) {
      labelStyle = { ...labelStyle, ...styles.labelContainerSelected };
    } else if (isHovered) {
      labelStyle = { ...labelStyle, ...styles.labelContainerHover };
    }
    return labelStyle;
  };

  return (
    <>
      {/* Inject animation CSS */}
      <style>{tooltipAnimationCSS}</style>

      {/* The edge path with arrow marker */}
      <BaseEdge
        id={id}
        path={edgePath}
        {...(markerEnd !== undefined ? { markerEnd } : {})}
        style={{
          ...(style ?? {}),
          stroke: getEdgeColor(),
          strokeWidth: selected === true ? 2 : 1.5,
          strokeDasharray: 'none',
          transition: 'stroke 0.15s ease-in-out, stroke-width 0.15s ease-in-out',
        }}
      />

      {/* Edge label */}
      <EdgeLabelRenderer>
        <div
          style={{
            ...styles.label,
            left: labelX,
            top: labelY,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleLabelDoubleClick}
        >
          {isEditing ? (
            <input
              style={styles.editInput}
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              autoFocus
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          ) : (
            <div style={getLabelStyle()}>
              {/* Context flow indicator dot */}
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: contextFlowColors.edge,
                  flexShrink: 0,
                }}
                title={`Context: ${contextFlow}`}
              />

              {/* Label text */}
              <span>{connection?.label ?? 'connects to'}</span>

              {/* Direction indicator */}
              <span style={styles.directionIcon}>
                {connection?.direction === 'bidirectional' ? <ArrowBothIcon /> : <ArrowRightIcon />}
              </span>
            </div>
          )}

          {/* Tooltip with connection details */}
          {showTooltip && connection !== undefined ? (
            <div className="edge-tooltip" style={styles.tooltip}>
              {/* Arrow pointer */}
              <div style={styles.tooltipArrow} />
              <div style={styles.tooltipArrowInner} />

              {/* Header */}
              <div style={styles.tooltipHeader}>Connection Details</div>

              {/* Description if available */}
              {connection.description !== undefined && connection.description.length > 0 ? (
                <div style={styles.tooltipDescription}>{connection.description}</div>
              ) : null}

              {/* Context Flow Row */}
              <div style={styles.tooltipRow}>
                <span style={styles.tooltipLabel}>Context</span>
                <span
                  style={{
                    ...styles.contextFlowBadge,
                    backgroundColor: contextFlowColors.bg,
                    color: contextFlowColors.label,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: contextFlowColors.edge,
                    }}
                  />
                  {contextFlow === 'full' ? 'Full' : contextFlow === 'summary' ? 'Summary' : 'None'}
                </span>
              </div>

              {/* Priority Row */}
              <div style={{ ...styles.tooltipRow, marginBottom: 0 }}>
                <span style={styles.tooltipLabel}>Priority</span>
                <span style={styles.tooltipValue}>{connection.priority}</span>
              </div>
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Memoize to prevent unnecessary re-renders
export const WorkflowEdge = memo(WorkflowEdgeComponent);
