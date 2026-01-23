/**
 * VariablePicker
 *
 * Dropdown/modal for selecting design variables to bind to properties.
 * Supports filtering by type and search.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/design/designTokens';
import {
  useVariableStore,
  selectColorVariables,
  selectNumberVariables,
} from '../../../lib/variables/variableStore';

import type { Variable, VariableBinding } from '../../../lib/variables/variableTypes';

export interface VariablePickerProps {
  /** Type of variable to show */
  type: 'color' | 'number' | 'string';
  /** Currently bound variable (if any) */
  currentBinding?: VariableBinding;
  /** Called when a variable is selected */
  onSelect: (binding: VariableBinding) => void;
  /** Called to clear the binding */
  onClear?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Compact trigger button */
  compact?: boolean;
}

// Icons
const VariableIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 12h8" />
    <path d="M12 8v8" opacity="0.5" />
  </svg>
);

const CloseIcon = (): React.JSX.Element => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SearchIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const styles = {
  container: {
    position: 'relative' as const,
    display: 'inline-flex',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${String(spacing.xs)}px ${String(spacing.sm)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.xs,
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  triggerActive: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--primary)',
  },
  boundPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `2px ${String(spacing.sm)}px`,
    backgroundColor: 'var(--accent)',
    borderRadius: radii.pill,
    fontSize: fontSize.xs,
    color: 'var(--primary)',
    fontWeight: fontWeight.medium,
  },
  clearButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: spacing.xs,
    width: 240,
    maxHeight: 320,
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: 1000,
    overflow: 'hidden',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderBottom: '1px solid var(--border)',
  },
  searchInput: {
    flex: 1,
    height: 28,
    padding: `0 ${String(spacing.sm)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
  },
  list: {
    overflowY: 'auto' as const,
    maxHeight: 260,
  },
  collectionHeader: {
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    backgroundColor: 'var(--muted)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    cursor: 'pointer',
    transition: `background-color ${motion.fast} ${motion.ease}`,
  },
  itemHovered: {
    backgroundColor: 'var(--accent)',
  },
  itemSelected: {
    backgroundColor: 'var(--accent)',
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: radii.sm,
    border: '1px solid var(--border)',
    flexShrink: 0,
  },
  numberValue: {
    width: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--muted)',
    borderRadius: radii.sm,
    flexShrink: 0,
  },
  itemName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: 'var(--foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemValue: {
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
  },
  emptyState: {
    padding: spacing.xl,
    textAlign: 'center' as const,
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
  },
};

export function VariablePicker({
  type,
  currentBinding,
  onSelect,
  onClear,
  disabled = false,
  compact = false,
}: VariablePickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get variables from store
  const variables = useVariableStore((state) => {
    if (type === 'color') {
      return selectColorVariables(state);
    } else if (type === 'number') {
      return selectNumberVariables(state);
    }
    return [];
  });

  const collections = useVariableStore((state) => state.collections);
  const resolveColor = useVariableStore((state) => state.resolveColor);
  const resolveNumber = useVariableStore((state) => state.resolveNumber);

  // Get current bound variable
  const boundVariable = useMemo(() => {
    if (!currentBinding) return null;
    return variables.find((v) => v.id === currentBinding.variableId) ?? null;
  }, [currentBinding, variables]);

  // Filter and group variables
  const groupedVariables = useMemo(() => {
    const filtered = searchQuery
      ? variables.filter(
          (v) =>
            v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.id.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : variables;

    // Group by collection
    const groups = new Map<string, Variable[]>();
    for (const variable of filtered) {
      const existing = groups.get(variable.collectionId) ?? [];
      existing.push(variable);
      groups.set(variable.collectionId, existing);
    }

    return groups;
  }, [variables, searchQuery]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Handle variable selection
  const handleSelect = useCallback(
    (variable: Variable) => {
      onSelect({ variableId: variable.id });
      setIsOpen(false);
      setSearchQuery('');
    },
    [onSelect]
  );

  // Handle clear
  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onClear) {
        onClear();
      }
    },
    [onClear]
  );

  // Get display value for a variable
  const getDisplayValue = useCallback(
    (variable: Variable): string => {
      if (variable.type === 'color') {
        return resolveColor(variable.id) ?? '';
      } else if (variable.type === 'number') {
        const val = resolveNumber(variable.id);
        return val !== null ? String(val) : '';
      }
      return '';
    },
    [resolveColor, resolveNumber]
  );

  // Render bound state
  if (currentBinding && boundVariable) {
    return (
      <div style={styles.container} ref={containerRef}>
        <div style={styles.boundPill}>
          <VariableIcon />
          <span>{boundVariable.name}</span>
          {onClear ? (
            <button style={styles.clearButton} onClick={handleClear} disabled={disabled}>
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} ref={containerRef}>
      {/* Trigger button */}
      <button
        style={{
          ...styles.trigger,
          ...(isOpen ? styles.triggerActive : {}),
        }}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        disabled={disabled}
        title="Bind to variable"
      >
        <VariableIcon />
        {!compact ? <span>Variable</span> : null}
      </button>

      {/* Dropdown */}
      {isOpen ? (
        <div style={styles.dropdown}>
          {/* Search */}
          <div style={styles.searchContainer}>
            <SearchIcon />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              placeholder="Search variables..."
              style={styles.searchInput}
            />
          </div>

          {/* Variable list */}
          <div style={styles.list}>
            {groupedVariables.size === 0 ? (
              <div style={styles.emptyState}>No {type} variables found</div>
            ) : (
              Array.from(groupedVariables.entries()).map(([collectionId, vars]) => {
                const collection = collections.get(collectionId);
                return (
                  <div key={collectionId}>
                    <div style={styles.collectionHeader}>{collection?.name ?? collectionId}</div>
                    {vars.map((variable) => {
                      const displayValue = getDisplayValue(variable);
                      const isSelected = currentBinding?.variableId === variable.id;
                      const isHovered = hoveredId === variable.id;

                      return (
                        <div
                          key={variable.id}
                          style={{
                            ...styles.item,
                            ...(isSelected ? styles.itemSelected : {}),
                            ...(isHovered ? styles.itemHovered : {}),
                          }}
                          onClick={() => {
                            handleSelect(variable);
                          }}
                          onMouseEnter={() => {
                            setHoveredId(variable.id);
                          }}
                          onMouseLeave={() => {
                            setHoveredId(null);
                          }}
                        >
                          {variable.type === 'color' ? (
                            <div
                              style={{
                                ...styles.colorSwatch,
                                backgroundColor: displayValue,
                              }}
                            />
                          ) : (
                            <div style={styles.numberValue}>#</div>
                          )}
                          <span style={styles.itemName}>{variable.name}</span>
                          <span style={styles.itemValue}>{displayValue}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default VariablePicker;
