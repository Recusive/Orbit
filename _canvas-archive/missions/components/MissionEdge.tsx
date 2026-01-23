/**
 * MissionEdge
 * Custom edge component for connections between agent cards
 */

import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import React, { useCallback } from 'react';

import type { MissionEdgeData } from '../types';
import type { Edge, EdgeProps } from '@xyflow/react';

import './MissionEdge.css';

// ============================================================================
// Component
// ============================================================================

export function MissionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<Edge<MissionEdgeData>>): React.JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const connection = data?.connection;
  const isActive = data?.isActive ?? false;
  const onDelete = data?.onDelete;
  const onEditLabel = data?.onEditLabel;

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (connection !== undefined && onDelete !== undefined) {
        onDelete(connection.id);
      }
    },
    [connection, onDelete]
  );

  const handleLabelClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (connection !== undefined && onEditLabel !== undefined) {
        onEditLabel(connection.id);
      }
    },
    [connection, onEditLabel]
  );

  // Determine edge color based on context flow type
  const getEdgeColor = (): string => {
    if (connection === undefined) return 'var(--border)';
    switch (connection.contextFlow) {
      case 'full':
        return 'var(--green-500)';
      case 'summary':
        return 'var(--yellow-500)';
      case 'filtered':
        return 'var(--blue-500)';
      case 'none':
        return 'var(--muted-foreground)';
      default:
        return 'var(--border)';
    }
  };

  const edgeColor = getEdgeColor();
  const strokeWidth = selected === true ? 3 : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth,
          strokeDasharray: connection?.contextFlow === 'none' ? '5,5' : undefined,
        }}
        className={`mission-edge ${isActive ? 'mission-edge--active' : ''}`}
      />
      <EdgeLabelRenderer>
        <div
          className={`mission-edge-label ${selected === true ? 'mission-edge-label--selected' : ''}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${String(labelX)}px, ${String(labelY)}px)`,
            pointerEvents: 'all',
          }}
        >
          {connection?.label !== undefined && connection.label.length > 0 ? (
            <button className="mission-edge-label-text" onClick={handleLabelClick} type="button">
              {connection.label}
            </button>
          ) : (
            <button
              className="mission-edge-label-add"
              onClick={handleLabelClick}
              type="button"
              title="Add label"
            >
              +
            </button>
          )}
          {selected === true && (
            <button
              className="mission-edge-delete-btn"
              onClick={handleDeleteClick}
              type="button"
              title="Delete connection"
            >
              &times;
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
