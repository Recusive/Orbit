/**
 * PropertyHeader
 *
 * Header row for the properties panel showing:
 * - Node type selector/badge
 * - Editable node name
 * - Quick action buttons
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../lib/designTokens';

import type { DesignNodeType } from '../../types/designNodeTypes';

export interface PropertyHeaderProps {
  nodeType: DesignNodeType;
  nodeName: string;
  onNameChange: (name: string) => void;
  onQuickAction?: (action: 'duplicate' | 'delete' | 'lock') => void;
}

// Node type icons
const LayerIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const FrameIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const RectangleIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" />
  </svg>
);

const EllipseIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="12" rx="9" ry="9" />
  </svg>
);

const TextIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const ComponentIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const InstanceIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 9h6v6H9z" fill="currentColor" />
  </svg>
);

const MoreIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
    <circle cx="5" cy="12" r="1" fill="currentColor" />
  </svg>
);

const nodeTypeConfig: Record<
  DesignNodeType,
  { icon: React.JSX.Element; label: string; color: string }
> = {
  layer: { icon: <LayerIcon />, label: 'Layer', color: 'var(--accent-foreground)' },
  frame: { icon: <FrameIcon />, label: 'Frame', color: 'var(--primary)' },
  rectangle: { icon: <RectangleIcon />, label: 'Rectangle', color: 'var(--foreground)' },
  ellipse: { icon: <EllipseIcon />, label: 'Ellipse', color: 'var(--foreground)' },
  text: { icon: <TextIcon />, label: 'Text', color: 'var(--foreground)' },
  component: { icon: <ComponentIcon />, label: 'Component', color: 'var(--success)' },
  instance: { icon: <InstanceIcon />, label: 'Instance', color: 'var(--warning)' },
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${String(spacing.lg)}px ${String(spacing.xl)}px`,
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
  },
  typeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    borderRadius: radii.sm,
    backgroundColor: 'var(--muted)',
    border: '1px solid var(--border)',
    cursor: 'default',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  typeBadgeHover: {
    backgroundColor: 'var(--accent)',
  },
  typeIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
  },
  nameInput: {
    flex: 1,
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    border: '1px solid transparent',
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    outline: 'none',
    transition: `all ${motion.fast} ${motion.ease}`,
    minWidth: 0,
  },
  nameInputFocused: {
    backgroundColor: 'var(--input)',
    borderColor: 'var(--border)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    padding: 0,
    border: 'none',
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  actionButtonHover: {
    backgroundColor: 'var(--accent)',
    color: 'var(--foreground)',
  },
};

export function PropertyHeader({
  nodeType,
  nodeName,
  onNameChange,
}: PropertyHeaderProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(nodeName);
  const [typeBadgeHovered, setTypeBadgeHovered] = useState(false);
  const [moreButtonHovered, setMoreButtonHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const config = nodeTypeConfig[nodeType];

  // Update edit value when node changes
  useEffect(() => {
    setEditValue(nodeName);
  }, [nodeName]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleNameDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  }, []);

  const handleNameBlur = useCallback(() => {
    setIsEditing(false);
    if (editValue.trim() && editValue !== nodeName) {
      onNameChange(editValue.trim());
    } else {
      setEditValue(nodeName);
    }
  }, [editValue, nodeName, onNameChange]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNameBlur();
      } else if (e.key === 'Escape') {
        setEditValue(nodeName);
        setIsEditing(false);
      }
    },
    [handleNameBlur, nodeName]
  );

  return (
    <div style={styles.container}>
      {/* Type badge */}
      <div
        style={{
          ...styles.typeBadge,
          ...(typeBadgeHovered ? styles.typeBadgeHover : {}),
        }}
        onMouseEnter={() => {
          setTypeBadgeHovered(true);
        }}
        onMouseLeave={() => {
          setTypeBadgeHovered(false);
        }}
        title={config.label}
      >
        <span style={{ ...styles.typeIcon, color: config.color }}>{config.icon}</span>
        <span style={styles.typeLabel}>{config.label}</span>
      </div>

      {/* Editable name */}
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={handleNameChange}
        onBlur={handleNameBlur}
        onKeyDown={handleNameKeyDown}
        onDoubleClick={handleNameDoubleClick}
        style={{
          ...styles.nameInput,
          ...(isEditing ? styles.nameInputFocused : {}),
        }}
        readOnly={!isEditing}
      />

      {/* Quick actions */}
      <div style={styles.actions}>
        <button
          type="button"
          style={{
            ...styles.actionButton,
            ...(moreButtonHovered ? styles.actionButtonHover : {}),
          }}
          onMouseEnter={() => {
            setMoreButtonHovered(true);
          }}
          onMouseLeave={() => {
            setMoreButtonHovered(false);
          }}
          title="More options"
        >
          <MoreIcon />
        </button>
      </div>
    </div>
  );
}

export default PropertyHeader;
