/**
 * Snapshot Panel
 * UI for managing workflow version history
 */

import React, { useState, useCallback } from 'react';

import { radii, fontWeight, shadows, spacing } from '../../lib/designTokens';

import type { WorkflowSnapshot } from '../../types/workflowTypes';

// ============================================================================
// Icons
// ============================================================================

const CloseIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const HistoryIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const RestoreIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
    <path d="M3 3v5h5"></path>
  </svg>
);

const TrashIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const PlusIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const CheckIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

// ============================================================================
// Styles
// ============================================================================

const styles = {
  panel: {
    position: 'fixed' as const,
    top: 60,
    right: 16,
    width: 320,
    maxHeight: 'calc(100vh - 120px)',
    backgroundColor: 'var(--card)',
    borderRadius: radii.lg,
    border: '1px solid var(--border)',
    boxShadow: shadows.lg,
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 100,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    border: 'none',
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: spacing.sm,
  },
  createSection: {
    padding: spacing.sm,
    borderBottom: '1px solid var(--border)',
  },
  inputGroup: {
    display: 'flex',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 12,
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    outline: 'none',
  },
  createButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: 'var(--primary-foreground)',
    backgroundColor: 'var(--primary)',
    border: 'none',
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'opacity 0.1s',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    color: 'var(--muted-foreground)',
    textAlign: 'center' as const,
  },
  emptyIcon: {
    marginBottom: spacing.md,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 1.5,
  },
  snapshotList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  snapshotCard: {
    padding: spacing.md,
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    transition: 'all 0.15s',
  },
  snapshotCardCurrent: {
    borderColor: 'var(--primary)',
    backgroundColor: 'rgba(var(--primary-rgb), 0.05)',
  },
  snapshotHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  snapshotName: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  currentBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 6px',
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: 'var(--primary)',
    backgroundColor: 'rgba(var(--primary-rgb), 0.1)',
    borderRadius: radii.sm,
  },
  snapshotMeta: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    marginBottom: spacing.sm,
  },
  snapshotActions: {
    display: 'flex',
    gap: spacing.sm,
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  actionButtonHover: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--primary)',
    color: 'var(--foreground)',
  },
  deleteButton: {
    color: 'var(--destructive)',
  },
  deleteButtonHover: {
    backgroundColor: 'rgba(var(--destructive-rgb), 0.1)',
    borderColor: 'var(--destructive)',
  },
};

// ============================================================================
// Props
// ============================================================================

interface SnapshotPanelProps {
  snapshots: WorkflowSnapshot[];
  currentSnapshotId: string | null;
  onCreateSnapshot: (name: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function SnapshotPanel({
  snapshots,
  currentSnapshotId,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onClose,
}: SnapshotPanelProps): React.JSX.Element {
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [closeHovered, setCloseHovered] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  const handleCreateSnapshot = useCallback((): void => {
    if (newSnapshotName.trim().length > 0) {
      onCreateSnapshot(newSnapshotName.trim());
      setNewSnapshotName('');
    }
  }, [newSnapshotName, onCreateSnapshot]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        handleCreateSnapshot();
      }
    },
    [handleCreateSnapshot]
  );

  const formatDate = useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // Handle escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Sort snapshots by date (newest first)
  const sortedSnapshots = [...snapshots].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <HistoryIcon />
          <span>Version History</span>
        </div>
        <button
          style={{
            ...styles.closeButton,
            ...(closeHovered
              ? { backgroundColor: 'var(--accent)', color: 'var(--foreground)' }
              : {}),
          }}
          onClick={onClose}
          onMouseEnter={() => {
            setCloseHovered(true);
          }}
          onMouseLeave={() => {
            setCloseHovered(false);
          }}
          title="Close (Escape)"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Create Snapshot */}
      <div style={styles.createSection}>
        <div style={styles.inputGroup}>
          <input
            type="text"
            value={newSnapshotName}
            onChange={(e) => {
              setNewSnapshotName(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Snapshot name..."
            style={styles.input}
          />
          <button
            style={{
              ...styles.createButton,
              opacity: newSnapshotName.trim().length > 0 ? 1 : 0.5,
            }}
            onClick={handleCreateSnapshot}
            disabled={newSnapshotName.trim().length === 0}
          >
            <PlusIcon />
            Save
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {sortedSnapshots.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <HistoryIcon />
            </div>
            <div style={styles.emptyText}>
              No snapshots yet.
              <br />
              Save a snapshot to preserve your current workflow state.
            </div>
          </div>
        ) : (
          <div style={styles.snapshotList}>
            {sortedSnapshots.map((snapshot) => {
              const isCurrent = snapshot.id === currentSnapshotId;
              return (
                <div
                  key={snapshot.id}
                  style={{
                    ...styles.snapshotCard,
                    ...(isCurrent ? styles.snapshotCardCurrent : {}),
                  }}
                >
                  <div style={styles.snapshotHeader}>
                    <div style={styles.snapshotName}>
                      {snapshot.name}
                      {isCurrent ? (
                        <span style={styles.currentBadge}>
                          <CheckIcon />
                          Current
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div style={styles.snapshotMeta}>
                    {formatDate(snapshot.createdAt)} &middot; {snapshot.cards.length} cards
                  </div>
                  <div style={styles.snapshotActions}>
                    {!isCurrent ? (
                      <button
                        style={{
                          ...styles.actionButton,
                          ...(hoveredAction === `restore-${snapshot.id}`
                            ? styles.actionButtonHover
                            : {}),
                        }}
                        onClick={() => {
                          onRestoreSnapshot(snapshot.id);
                        }}
                        onMouseEnter={() => {
                          setHoveredAction(`restore-${snapshot.id}`);
                        }}
                        onMouseLeave={() => {
                          setHoveredAction(null);
                        }}
                      >
                        <RestoreIcon />
                        Restore
                      </button>
                    ) : null}
                    <button
                      style={{
                        ...styles.actionButton,
                        ...styles.deleteButton,
                        ...(hoveredAction === `delete-${snapshot.id}`
                          ? styles.deleteButtonHover
                          : {}),
                      }}
                      onClick={() => {
                        onDeleteSnapshot(snapshot.id);
                      }}
                      onMouseEnter={() => {
                        setHoveredAction(`delete-${snapshot.id}`);
                      }}
                      onMouseLeave={() => {
                        setHoveredAction(null);
                      }}
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
