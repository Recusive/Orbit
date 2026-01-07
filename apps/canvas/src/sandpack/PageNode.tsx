/**
 * PageNode for Design System Canvas
 *
 * A composition container that holds multiple components arranged
 * according to a layout system (flex, grid, or absolute).
 */

import { Handle, Position } from '@xyflow/react';
import React, { useState, useMemo } from 'react';

import { spacing, radii, fontSize, fontWeight, motion, shadows } from '../lib/design/designTokens';

import { VIEWPORT_PRESETS } from './sandpackConfig';

import type { PageNodeData, ComponentSlot } from '../types/pageTypes';
import type { NodeProps } from '@xyflow/react';

export interface PageNodeProps extends NodeProps {
  data: PageNodeData;
}

// SVG Icons
const LayoutIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const ExpandIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 3 21 3 21 9"></polyline>
    <polyline points="9 21 3 21 3 15"></polyline>
    <line x1="21" y1="3" x2="14" y2="10"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  </svg>
);

const GridIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);

const styles = {
  container: {
    backgroundColor: 'var(--card)',
    borderRadius: radii.lg,
    boxShadow: shadows.lg,
    overflow: 'hidden',
    transition: `all ${motion.normal} ${motion.ease}`,
  },
  containerSelected: {
    boxShadow: `${shadows.lg}, 0 0 0 2px var(--primary)`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    backgroundColor: 'var(--background)',
    borderBottom: '1px solid var(--border)',
  },
  headerIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    color: 'var(--primary)',
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  headerBadge: {
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--muted)',
    padding: `${String(spacing.xs)}px ${String(spacing.sm)}px`,
    borderRadius: radii.sm,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radii.sm,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  canvas: {
    position: 'relative' as const,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 200,
    color: '#6b7280',
    textAlign: 'center' as const,
    padding: spacing['2xl'],
  },
  emptyIcon: {
    marginBottom: spacing.md,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  emptyHint: {
    fontSize: fontSize.xs,
    opacity: 0.7,
  },
  slotContainer: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
  },
  slot: {
    position: 'relative' as const,
    backgroundColor: 'var(--muted)',
    border: '1px dashed var(--border)',
    borderRadius: radii.sm,
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  slotHover: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--primary)',
  },
  slotLabel: {
    fontSize: fontSize.xs,
    color: '#6b7280',
  },
  viewportBadge: {
    position: 'absolute' as const,
    bottom: spacing.sm,
    right: spacing.sm,
    fontSize: fontSize.xs,
    color: 'var(--foreground)',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: `${String(spacing.xs)}px ${String(spacing.sm)}px`,
    borderRadius: radii.sm,
  },
  handle: {
    width: 8,
    height: 8,
    backgroundColor: 'var(--primary)',
    border: '2px solid var(--background)',
  },
};

/**
 * Generate layout styles from PageLayout config
 */
function getLayoutStyles(layout: PageNodeData['layout']): React.CSSProperties {
  const baseStyles: React.CSSProperties = {
    padding: layout.padding ?? '0',
    gap: layout.gap ?? '0',
  };

  switch (layout.type) {
    case 'flex':
      return {
        ...baseStyles,
        display: 'flex',
        flexDirection: layout.direction ?? 'column',
        flexWrap: layout.wrap ? 'wrap' : 'nowrap',
        alignItems: layout.alignItems ?? 'stretch',
        justifyContent: layout.justifyContent ?? 'flex-start',
      };

    case 'stack':
      return {
        ...baseStyles,
        display: 'flex',
        flexDirection: 'column',
        flexWrap: layout.wrap ? 'wrap' : 'nowrap',
        alignItems: layout.alignItems ?? 'stretch',
        justifyContent: layout.justifyContent ?? 'flex-start',
      };

    case 'grid': {
      // Convert areas to CSS string if it's an array
      const areas = layout.gridTemplate?.areas;
      const gridAreas = Array.isArray(areas) ? areas.map((row) => `"${row}"`).join(' ') : areas;
      return {
        ...baseStyles,
        display: 'grid',
        gridTemplateColumns: layout.gridTemplate?.columns ?? '1fr',
        gridTemplateRows: layout.gridTemplate?.rows ?? 'auto',
        gridTemplateAreas: gridAreas,
      };
    }

    case 'absolute':
      return {
        ...baseStyles,
        position: 'relative',
      };
  }
}

/**
 * Generate slot styles from SlotPosition config
 */
function getSlotStyles(position: ComponentSlot['position'], zIndex: number): React.CSSProperties {
  if (position.mode === 'absolute') {
    return {
      position: 'absolute',
      left: position.x,
      top: position.y,
      width: position.width,
      height: position.height,
      zIndex,
    };
  }

  // Flow mode
  return {
    gridArea: position.gridArea,
    flexGrow: position.flexGrow,
    flexShrink: position.flexShrink,
    flexBasis: position.flexBasis,
    alignSelf: position.alignSelf,
    justifySelf: position.justifySelf,
    order: position.order,
    zIndex,
  };
}

/**
 * PageNode Component
 */
export function PageNode({ data, selected }: PageNodeProps): React.JSX.Element {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const viewport = VIEWPORT_PRESETS[data.viewport];

  const containerStyle = useMemo(
    () => ({
      ...styles.container,
      ...(selected ? styles.containerSelected : {}),
      width: data.customSize?.width ?? viewport.width,
    }),
    [selected, data.customSize?.width, viewport.width]
  );

  const canvasStyle = useMemo(
    () => ({
      ...styles.canvas,
      height: data.customSize?.height ?? Math.min(viewport.height, 600),
      backgroundColor: data.background?.color,
      backgroundImage: data.background?.gradient ?? data.background?.image,
      backgroundSize: data.background?.size,
      backgroundPosition: data.background?.position,
    }),
    [data.customSize?.height, viewport.height, data.background]
  );

  const layoutStyles = useMemo(() => getLayoutStyles(data.layout), [data.layout]);

  const visibleSlots = useMemo(
    () => data.slots.filter((slot) => slot.visible).sort((a, b) => a.zIndex - b.zIndex),
    [data.slots]
  );

  const layoutTypeLabel =
    data.layout.type === 'flex'
      ? `Flex (${data.layout.direction ?? 'column'})`
      : data.layout.type === 'grid'
        ? 'Grid'
        : 'Absolute';

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <LayoutIcon />
        </div>
        <span style={styles.headerTitle}>{data.name}</span>
        <span style={styles.headerBadge}>{layoutTypeLabel}</span>
        <div style={styles.headerActions}>
          <button
            style={{
              ...styles.actionButton,
              ...(isHovered ? { color: 'var(--foreground)' } : {}),
            }}
            title="Layout settings"
          >
            <GridIcon />
          </button>
          <button
            style={{
              ...styles.actionButton,
              ...(isHovered ? { color: 'var(--foreground)' } : {}),
            }}
            title="Expand preview"
          >
            <ExpandIcon />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={canvasStyle}>
        {visibleSlots.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <GridIcon />
            </div>
            <p style={styles.emptyText}>No components yet</p>
            <p style={styles.emptyHint}>Drag components here or use the AI agent</p>
          </div>
        ) : (
          <div style={{ ...styles.slotContainer, ...layoutStyles }}>
            {visibleSlots.map((slot) => (
              <div
                key={slot.id}
                data-slot-id={slot.id}
                data-component-id={slot.componentId}
                data-layer-id={slot.layerId}
                style={{
                  ...styles.slot,
                  ...getSlotStyles(slot.position, slot.zIndex),
                  ...(hoveredSlot === slot.id ? styles.slotHover : {}),
                }}
                onMouseEnter={() => {
                  setHoveredSlot(slot.id);
                }}
                onMouseLeave={() => {
                  setHoveredSlot(null);
                }}
              >
                <span style={styles.slotLabel}>{slot.componentId}</span>
              </div>
            ))}
          </div>
        )}

        {/* Viewport badge */}
        <div style={styles.viewportBadge}>
          {viewport.label} ({viewport.width}x{viewport.height})
        </div>
      </div>

      {/* Connection Handles */}
      <Handle type="target" position={Position.Left} style={styles.handle} />
      <Handle type="source" position={Position.Right} style={styles.handle} />
    </div>
  );
}

/**
 * Default page node data factory
 */
export function getDefaultPageNodeData(): PageNodeData {
  return {
    name: 'New Page',
    layout: {
      type: 'flex',
      direction: 'column',
      gap: '16px',
      padding: '24px',
      alignItems: 'stretch',
    },
    viewport: 'desktop',
    slots: [],
  };
}
