import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  spacing,
  radii,
  fontSize,
  fontWeight,
  letterSpacing,
  shadows,
  motion,
  zIndex,
} from '../lib/designTokens';

// SVG Icons
const SearchIcon = (): React.JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  category: 'create' | 'edit' | 'view' | 'general';
  keywords?: string[];
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: zIndex.modal - 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  },
  container: {
    position: 'fixed' as const,
    left: '50%',
    top: '20%',
    zIndex: zIndex.modal,
    width: '100%',
    maxWidth: 640,
    transform: 'translateX(-50%)',
    padding: `0 ${String(spacing['2xl'])}px`,
  },
  palette: {
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.xl,
    boxShadow: shadows.xl,
    overflow: 'hidden',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xl,
    padding: `${String(spacing.xl)}px ${String(spacing['2xl'])}px`,
    borderBottom: '1px solid var(--border)',
  },
  searchIcon: {
    color: 'var(--muted-foreground)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: fontSize.lg,
    color: 'var(--foreground)',
  },
  escKey: {
    padding: `${String(spacing.xs)}px ${String(spacing.lg)}px`,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--muted-foreground)',
  },
  list: {
    maxHeight: 384,
    overflowY: 'auto' as const,
    padding: spacing.lg,
  },
  emptyState: {
    padding: spacing['4xl'],
    textAlign: 'center' as const,
    color: 'var(--muted-foreground)',
    fontSize: fontSize.md,
  },
  categoryHeader: {
    padding: `${String(spacing.sm)}px ${String(spacing.lg)}px`,
    marginBottom: spacing.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
    color: 'var(--muted-foreground)',
  },
  categoryGroup: {
    marginBottom: spacing.xl,
  },
  commandButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xl,
    padding: `${String(spacing.lg)}px ${String(spacing.xl)}px`,
    border: 'none',
    borderRadius: radii.md,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  commandButtonSelected: {
    backgroundColor: 'var(--accent)',
  },
  commandIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    color: 'var(--muted-foreground)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandContent: {
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  },
  commandLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  commandDescription: {
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: 2,
  },
  commandShortcut: {
    padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--muted-foreground)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${String(spacing.lg)}px ${String(spacing['2xl'])}px`,
    borderTop: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
  },
  footerHints: {
    display: 'flex',
    gap: spacing['2xl'],
  },
  footerKey: {
    padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
    marginRight: spacing.sm,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
  },
};

export function CommandPalette({
  isOpen,
  onClose,
  commands,
}: CommandPaletteProps): React.JSX.Element | null {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Fuzzy search implementation
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands;

    const searchLower = search.toLowerCase();
    const searchTerms = searchLower.split(' ').filter(Boolean);

    return commands
      .map((command) => {
        const labelLower = command.label.toLowerCase();
        const descLower = command.description?.toLowerCase() ?? '';
        const keywordsLower = command.keywords?.map((k) => k.toLowerCase()) ?? [];
        const allText = [labelLower, descLower, ...keywordsLower].join(' ');

        let score = 0;

        // Exact match
        if (labelLower.includes(searchLower)) {
          score += 100;
        }

        // Starts with search
        if (labelLower.startsWith(searchLower)) {
          score += 50;
        }

        // All search terms match
        const allTermsMatch = searchTerms.every((term) => allText.includes(term));
        if (allTermsMatch) {
          score += searchTerms.length * 20;
        }

        // Acronym match
        const acronym = labelLower
          .split(' ')
          .map((word) => word[0])
          .join('');
        if (acronym.includes(searchLower)) {
          score += 30;
        }

        return { command, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ command }) => command);
  }, [commands, search]);

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length
          );
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            onClose();
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          onClose();
          break;
        }
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {
      create: [],
      edit: [],
      view: [],
      general: [],
    };

    filteredCommands.forEach((command) => {
      const group = groups[command.category];
      if (group) {
        group.push(command);
      }
    });

    return groups;
  }, [filteredCommands]);

  // Early return AFTER all hooks
  if (!isOpen) return null;

  const categoryLabels: Record<string, string> = {
    create: 'Create',
    edit: 'Edit',
    view: 'View',
    general: 'General',
  };

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Command Palette */}
      <div style={styles.container}>
        <div style={styles.palette}>
          {/* Search Input */}
          <div style={styles.searchContainer}>
            <span style={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              style={styles.searchInput}
            />
            <kbd style={styles.escKey}>ESC</kbd>
          </div>

          {/* Command List */}
          <div ref={listRef} style={styles.list}>
            {filteredCommands.length === 0 ? (
              <div style={styles.emptyState}>No commands found</div>
            ) : (
              <>
                {Object.entries(groupedCommands).map(([category, cmds]) => {
                  if (cmds.length === 0) return null;

                  return (
                    <div key={category} style={styles.categoryGroup}>
                      <div style={styles.categoryHeader}>{categoryLabels[category]}</div>
                      {cmds.map((command) => {
                        const globalIndex = filteredCommands.indexOf(command);
                        const isSelected = globalIndex === selectedIndex;

                        return (
                          <button
                            key={command.id}
                            data-selected={isSelected}
                            onClick={() => {
                              command.action();
                              onClose();
                            }}
                            onMouseEnter={() => {
                              setSelectedIndex(globalIndex);
                            }}
                            style={{
                              ...styles.commandButton,
                              ...(isSelected ? styles.commandButtonSelected : {}),
                            }}
                          >
                            {command.icon !== undefined && command.icon !== null ? (
                              <div style={styles.commandIcon}>{command.icon}</div>
                            ) : null}
                            <div style={styles.commandContent}>
                              <div style={styles.commandLabel}>{command.label}</div>
                              {command.description ? (
                                <div style={styles.commandDescription}>{command.description}</div>
                              ) : null}
                            </div>
                            {command.shortcut ? (
                              <kbd style={styles.commandShortcut}>{command.shortcut}</kbd>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <div style={styles.footerHints}>
              <span>
                {/* allow-any-unicode-next-line */}
                <kbd style={styles.footerKey}>↑↓</kbd> Navigate
              </span>
              <span>
                {/* allow-any-unicode-next-line */}
                <kbd style={styles.footerKey}>↵</kbd> Select
              </span>
            </div>
            <span>{filteredCommands.length} commands</span>
          </div>
        </div>
      </div>
    </>
  );
}
