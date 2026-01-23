/**
 * SharedCardLibraryPanel - Browse and use shared cards from the library
 * Displays all shared cards, allows search/filter, and adding to workflows
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useBackendSync } from '../../hooks/backend/useBackendSync';
import { useWorkflowStore } from '../../stores/workflowStore';

import type { CardType, SharedCardMetadata } from '../../types/workflowTypes';

// ============================================================================
// Types
// ============================================================================

interface SharedCardLibraryPanelProps {
  onPromoteCard?: (cardId: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const CARD_TYPE_ICONS: Record<CardType, string> = {
  prompt: 'P',
  response: 'R',
  decision: 'D',
  diagram: 'G',
  'code-snippet': 'C',
  document: 'F',
};

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '12px',
    height: '100%',
    overflow: 'hidden',
  },
  searchContainer: {
    display: 'flex',
    gap: '8px',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: '1px solid var(--vscode-input-border, #3c3c3c)',
    backgroundColor: 'var(--vscode-input-background, #3c3c3c)',
    color: 'var(--vscode-input-foreground, #cccccc)',
    outline: 'none',
  },
  refreshButton: {
    padding: '8px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: '1px solid var(--vscode-button-border, transparent)',
    backgroundColor: 'var(--vscode-button-secondaryBackground, #3c3c3c)',
    color: 'var(--vscode-button-secondaryForeground, #cccccc)',
    cursor: 'pointer',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  cardItem: {
    padding: '12px',
    borderRadius: '6px',
    backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
    border: '1px solid var(--vscode-panel-border, #3c3c3c)',
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
  },
  cardItemHover: {
    backgroundColor: 'var(--vscode-list-hoverBackground, #2a2d2e)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  cardIcon: {
    fontSize: '16px',
  },
  cardName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--vscode-foreground, #cccccc)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cardMeta: {
    display: 'flex',
    gap: '8px',
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground, #808080)',
  },
  cardTags: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap' as const,
    marginTop: '6px',
  },
  tag: {
    padding: '2px 6px',
    fontSize: '10px',
    borderRadius: '3px',
    backgroundColor: 'var(--vscode-badge-background, #4d4d4d)',
    color: 'var(--vscode-badge-foreground, #ffffff)',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  },
  actionButton: {
    padding: '4px 10px',
    fontSize: '11px',
    borderRadius: '4px',
    border: '1px solid var(--vscode-button-border, transparent)',
    backgroundColor: 'var(--vscode-button-background, #0e639c)',
    color: 'var(--vscode-button-foreground, #ffffff)',
    cursor: 'pointer',
  },
  actionButtonSecondary: {
    backgroundColor: 'var(--vscode-button-secondaryBackground, #3c3c3c)',
    color: 'var(--vscode-button-secondaryForeground, #cccccc)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    gap: '12px',
    color: 'var(--vscode-descriptionForeground, #808080)',
    textAlign: 'center' as const,
  },
  emptyIcon: {
    fontSize: '32px',
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '13px',
  },
  emptyHint: {
    fontSize: '12px',
    opacity: 0.8,
  },
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    color: 'var(--vscode-descriptionForeground, #808080)',
  },
};

// ============================================================================
// Component
// ============================================================================

export function SharedCardLibraryPanel({
  onPromoteCard: _onPromoteCard,
}: SharedCardLibraryPanelProps): React.JSX.Element {
  void _onPromoteCard;
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const sharedCards = useWorkflowStore((state) => state.sharedCards);
  const sharedCardsLoading = useWorkflowStore((state) => state.sharedCardsLoading);
  const activeWorkflow = useWorkflowStore((state) => state.activeWorkflow);

  const { listSharedCards, copySharedCardToWorkflow, searchSharedCards } = useBackendSync();

  // Load shared cards on mount
  useEffect(() => {
    listSharedCards();
  }, [listSharedCards]);

  // Handle search
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const query = e.target.value;
      setSearchQuery(query);

      if (query.trim() === '') {
        listSharedCards();
      } else {
        searchSharedCards(query);
      }
    },
    [listSharedCards, searchSharedCards]
  );

  // Handle refresh
  const handleRefresh = useCallback((): void => {
    setSearchQuery('');
    listSharedCards();
  }, [listSharedCards]);

  // Handle adding card to workflow
  const handleAddToWorkflow = useCallback(
    (cardId: string): void => {
      if (activeWorkflow === null) return;
      copySharedCardToWorkflow(cardId);
    },
    [activeWorkflow, copySharedCardToWorkflow]
  );

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Filter cards based on search query (client-side fallback)
  const filteredCards =
    searchQuery.trim() === ''
      ? sharedCards
      : sharedCards.filter(
          (card) =>
            card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            card.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
        );

  // Render empty state
  if (!sharedCardsLoading && filteredCards.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search shared cards..."
            value={searchQuery}
            onChange={handleSearch}
            style={styles.searchInput}
          />
          <button onClick={handleRefresh} style={styles.refreshButton} title="Refresh">
            ↻
          </button>
        </div>
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>📚</span>
          <span style={styles.emptyText}>
            {searchQuery !== '' ? 'No cards match your search' : 'No shared cards yet'}
          </span>
          <span style={styles.emptyHint}>
            {searchQuery !== ''
              ? 'Try a different search term'
              : 'Promote cards from your workflows to share them'}
          </span>
        </div>
      </div>
    );
  }

  // Render loading state
  if (sharedCardsLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingState}>Loading shared cards...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search shared cards..."
          value={searchQuery}
          onChange={handleSearch}
          style={styles.searchInput}
        />
        <button onClick={handleRefresh} style={styles.refreshButton} title="Refresh">
          ↻
        </button>
      </div>

      <div style={styles.cardList}>
        {filteredCards.map((card: SharedCardMetadata) => (
          <div
            key={card.id}
            style={{
              ...styles.cardItem,
              ...(hoveredCardId === card.id ? styles.cardItemHover : {}),
            }}
            onMouseEnter={(): void => {
              setHoveredCardId(card.id);
            }}
            onMouseLeave={(): void => {
              setHoveredCardId(null);
            }}
          >
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>{CARD_TYPE_ICONS[card.type]}</span>
              <span style={styles.cardName}>{card.name}</span>
            </div>

            <div style={styles.cardMeta}>
              <span>{card.type}</span>
              <span>•</span>
              <span>{formatDate(card.updatedAt)}</span>
            </div>

            {card.tags.length > 0 && (
              <div style={styles.cardTags}>
                {card.tags.slice(0, 4).map((tag) => (
                  <span key={tag} style={styles.tag}>
                    {tag}
                  </span>
                ))}
                {card.tags.length > 4 && <span style={styles.tag}>+{card.tags.length - 4}</span>}
              </div>
            )}

            {activeWorkflow !== null && (
              <div style={styles.actions}>
                <button
                  style={styles.actionButton}
                  onClick={(): void => {
                    handleAddToWorkflow(card.id);
                  }}
                >
                  Add to Workflow
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
