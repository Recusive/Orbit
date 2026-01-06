/**
 * ConnectionsPanel - Connections tab showing incoming and outgoing connections
 * for the selected card
 */

import React, { useCallback, useMemo, useState } from 'react';

import type { MarkdownCard, WorkflowConnection } from '../../types/workflowTypes';

// ============================================================================
// Types
// ============================================================================

interface ConnectionsPanelProps {
  card: MarkdownCard | null;
  cards: MarkdownCard[];
  connections: WorkflowConnection[];
  onSelectConnection: (connectionId: string) => void;
  onUpdateConnection: (connectionId: string, updates: Partial<WorkflowConnection>) => void;
  onDeleteConnection: (connectionId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConnectionsPanel({
  card,
  cards,
  connections,
  onSelectConnection,
  onUpdateConnection,
  onDeleteConnection,
}: ConnectionsPanelProps): React.JSX.Element {
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');

  // Get card name by ID
  const getCardName = useCallback(
    (cardId: string): string => {
      const foundCard = cards.find((c) => c.id === cardId);
      return foundCard?.name ?? 'Unknown Card';
    },
    [cards]
  );

  // Get incoming connections (connections where this card is the target)
  const incomingConnections = useMemo(() => {
    if (card === null) return [];
    return connections.filter((conn) => conn.targetCardId === card.id);
  }, [card, connections]);

  // Get outgoing connections (connections where this card is the source)
  const outgoingConnections = useMemo(() => {
    if (card === null) return [];
    return connections.filter((conn) => conn.sourceCardId === card.id);
  }, [card, connections]);

  // Handle label editing
  const handleStartEditLabel = useCallback((conn: WorkflowConnection): void => {
    setEditingLabelId(conn.id);
    setLabelValue(conn.label);
  }, []);

  const handleSaveLabel = useCallback(
    (connectionId: string): void => {
      const trimmedLabel = labelValue.trim();
      if (trimmedLabel !== '') {
        onUpdateConnection(connectionId, { label: trimmedLabel });
      }
      setEditingLabelId(null);
    },
    [labelValue, onUpdateConnection]
  );

  const handleLabelKeyDown = useCallback(
    (e: React.KeyboardEvent, connectionId: string): void => {
      if (e.key === 'Enter') {
        handleSaveLabel(connectionId);
      } else if (e.key === 'Escape') {
        setEditingLabelId(null);
      }
    },
    [handleSaveLabel]
  );

  // Render a single connection item
  const renderConnectionItem = (
    conn: WorkflowConnection,
    direction: 'incoming' | 'outgoing'
  ): React.JSX.Element => {
    const otherCardId = direction === 'incoming' ? conn.sourceCardId : conn.targetCardId;
    const otherCardName = getCardName(otherCardId);
    const directionIcon = direction === 'incoming' ? '←' : '→';
    const isEditing = editingLabelId === conn.id;

    return (
      <div
        key={conn.id}
        style={{
          padding: '10px 12px',
          backgroundColor: 'var(--muted)',
          borderRadius: 6,
          marginBottom: 8,
        }}
      >
        {/* Connection Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div
            onClick={() => {
              onSelectConnection(conn.id);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              flex: 1,
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--muted-foreground)',
              }}
            >
              {directionIcon}
            </span>
            <span
              style={{
                fontSize: 13,
                color: 'var(--foreground)',
                fontWeight: 500,
              }}
            >
              {otherCardName}
            </span>
          </div>
          <button
            onClick={() => {
              onDeleteConnection(conn.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              fontSize: 14,
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            title="Delete connection"
          >
            ×
          </button>
        </div>

        {/* Connection Label */}
        <div>
          {isEditing ? (
            <input
              type="text"
              value={labelValue}
              onChange={(e) => {
                setLabelValue(e.target.value);
              }}
              onBlur={() => {
                handleSaveLabel(conn.id);
              }}
              onKeyDown={(e) => {
                handleLabelKeyDown(e, conn.id);
              }}
              placeholder="Add label..."
              autoFocus
              style={{
                width: '100%',
                padding: '6px 8px',
                backgroundColor: 'var(--input)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                fontSize: 12,
                color: 'var(--foreground)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <div
              onClick={() => {
                handleStartEditLabel(conn);
              }}
              style={{
                padding: '6px 8px',
                backgroundColor: 'var(--background)',
                borderRadius: 4,
                fontSize: 12,
                color: conn.label !== '' ? 'var(--foreground)' : 'var(--muted-foreground)',
                cursor: 'pointer',
                fontStyle: conn.label !== '' ? 'normal' : 'italic',
              }}
            >
              {conn.label !== '' ? conn.label : 'Click to add label...'}
            </div>
          )}
        </div>

        {/* Connection Direction Badge */}
        {conn.direction === 'bidirectional' && (
          <div
            style={{
              marginTop: 8,
              display: 'inline-block',
              padding: '2px 6px',
              backgroundColor: 'var(--primary)',
              borderRadius: 4,
              fontSize: 10,
              color: 'var(--primary-foreground)',
            }}
          >
            Bidirectional
          </div>
        )}
      </div>
    );
  };

  // Empty state
  if (card === null) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: 'center',
          color: 'var(--muted-foreground)',
        }}
      >
        <p style={{ margin: 0, fontSize: 14 }}>No card selected</p>
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>Select a card to view its connections</p>
      </div>
    );
  }

  const hasConnections = incomingConnections.length > 0 || outgoingConnections.length > 0;

  return (
    <div style={{ padding: 16 }}>
      {/* Incoming Connections */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 10,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Incoming ({incomingConnections.length})
        </label>
        {incomingConnections.length > 0 ? (
          incomingConnections.map((conn) => renderConnectionItem(conn, 'incoming'))
        ) : (
          <div
            style={{
              padding: 12,
              backgroundColor: 'var(--muted)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--muted-foreground)',
              textAlign: 'center',
            }}
          >
            No incoming connections
          </div>
        )}
      </div>

      {/* Outgoing Connections */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 10,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Outgoing ({outgoingConnections.length})
        </label>
        {outgoingConnections.length > 0 ? (
          outgoingConnections.map((conn) => renderConnectionItem(conn, 'outgoing'))
        ) : (
          <div
            style={{
              padding: 12,
              backgroundColor: 'var(--muted)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--muted-foreground)',
              textAlign: 'center',
            }}
          >
            No outgoing connections
          </div>
        )}
      </div>

      {/* Help Text */}
      {!hasConnections && (
        <div
          style={{
            padding: 16,
            backgroundColor: 'var(--muted)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--muted-foreground)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0 }}>Drag from one card's handle to another to create a connection</p>
        </div>
      )}
    </div>
  );
}
