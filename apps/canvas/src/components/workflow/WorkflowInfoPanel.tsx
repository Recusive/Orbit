/**
 * WorkflowInfoPanel - Workflow info tab showing metadata, stats, and export options
 */

import React, { useCallback, useState } from 'react';

import type { Workflow, WorkflowSnapshot } from '../../types/workflowTypes';

// ============================================================================
// Types
// ============================================================================

interface WorkflowInfoPanelProps {
  workflow: Workflow | null;
  cardCount: number;
  connectionCount: number;
  onUpdateWorkflow: (updates: Partial<Workflow>) => void;
  onExport: (format: 'json' | 'markdown') => void;
  onCreateSnapshot: (name: string, description?: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function WorkflowInfoPanel({
  workflow,
  cardCount,
  connectionCount,
  onUpdateWorkflow,
  onExport,
  onCreateSnapshot,
  onRestoreSnapshot,
}: WorkflowInfoPanelProps): React.JSX.Element {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDescription, setSnapshotDescription] = useState('');

  // Format timestamp
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handle name editing
  const handleStartEditName = useCallback((): void => {
    if (workflow !== null) {
      setNameValue(workflow.name);
      setEditingName(true);
    }
  }, [workflow]);

  const handleSaveName = useCallback((): void => {
    if (workflow !== null && nameValue.trim() !== '') {
      onUpdateWorkflow({ name: nameValue.trim() });
    }
    setEditingName(false);
  }, [nameValue, onUpdateWorkflow, workflow]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter') {
        handleSaveName();
      } else if (e.key === 'Escape') {
        setEditingName(false);
      }
    },
    [handleSaveName]
  );

  // Handle description editing
  const handleStartEditDescription = useCallback((): void => {
    if (workflow !== null) {
      setDescriptionValue(workflow.description ?? '');
      setEditingDescription(true);
    }
  }, [workflow]);

  const handleSaveDescription = useCallback((): void => {
    if (workflow !== null) {
      const trimmedDescription = descriptionValue.trim();
      if (trimmedDescription !== '') {
        onUpdateWorkflow({ description: trimmedDescription });
      }
    }
    setEditingDescription(false);
  }, [descriptionValue, onUpdateWorkflow, workflow]);

  // Handle snapshot creation
  const handleCreateSnapshot = useCallback((): void => {
    if (snapshotName.trim() !== '') {
      onCreateSnapshot(snapshotName.trim(), snapshotDescription.trim() || undefined);
      setSnapshotName('');
      setSnapshotDescription('');
      setShowSnapshotForm(false);
    }
  }, [snapshotName, snapshotDescription, onCreateSnapshot]);

  // Empty state
  if (workflow === null) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: 'center',
          color: 'var(--muted-foreground)',
        }}
      >
        <p style={{ margin: 0, fontSize: 14 }}>No workflow loaded</p>
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>
          Create or select a workflow to view its info
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Workflow Name */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Name
        </label>
        {editingName ? (
          <input
            type="text"
            value={nameValue}
            onChange={(e) => {
              setNameValue(e.target.value);
            }}
            onBlur={handleSaveName}
            onKeyDown={handleNameKeyDown}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 10px',
              backgroundColor: 'var(--input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 14,
              color: 'var(--foreground)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <div
            onClick={handleStartEditName}
            style={{
              padding: '8px 10px',
              backgroundColor: 'var(--muted)',
              borderRadius: 6,
              fontSize: 14,
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            {workflow.name}
          </div>
        )}
      </div>

      {/* Description */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Description
        </label>
        {editingDescription ? (
          <textarea
            value={descriptionValue}
            onChange={(e) => {
              setDescriptionValue(e.target.value);
            }}
            onBlur={handleSaveDescription}
            placeholder="Add a description..."
            autoFocus
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              backgroundColor: 'var(--input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--foreground)',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            onClick={handleStartEditDescription}
            style={{
              padding: '8px 10px',
              backgroundColor: 'var(--muted)',
              borderRadius: 6,
              fontSize: 13,
              color:
                workflow.description !== undefined
                  ? 'var(--foreground)'
                  : 'var(--muted-foreground)',
              cursor: 'pointer',
              minHeight: 60,
              fontStyle: workflow.description !== undefined ? 'normal' : 'italic',
            }}
          >
            {workflow.description ?? 'Click to add description...'}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ marginBottom: 20 }}>
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
          Statistics
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <div
            style={{
              padding: 12,
              backgroundColor: 'var(--muted)',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--foreground)',
              }}
            >
              {cardCount}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--muted-foreground)',
                marginTop: 2,
              }}
            >
              Cards
            </div>
          </div>
          <div
            style={{
              padding: 12,
              backgroundColor: 'var(--muted)',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--foreground)',
              }}
            >
              {connectionCount}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--muted-foreground)',
                marginTop: 2,
              }}
            >
              Connections
            </div>
          </div>
        </div>
      </div>

      {/* Timestamps */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Timestamps
        </label>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          <div style={{ marginBottom: 4 }}>
            <strong>Created:</strong> {formatDate(workflow.createdAt)}
          </div>
          <div>
            <strong>Updated:</strong> {formatDate(workflow.updatedAt)}
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div style={{ marginBottom: 20 }}>
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
          Export
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              onExport('json');
            }}
            style={{
              flex: 1,
              padding: '10px 12px',
              backgroundColor: 'var(--muted)',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            JSON
          </button>
          <button
            onClick={() => {
              onExport('markdown');
            }}
            style={{
              flex: 1,
              padding: '10px 12px',
              backgroundColor: 'var(--muted)',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            Markdown
          </button>
        </div>
      </div>

      {/* Snapshots */}
      <div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          <span>Snapshots ({workflow.snapshots.length})</span>
          <button
            onClick={() => {
              setShowSnapshotForm(!showSnapshotForm);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 16,
              color: 'var(--primary)',
              cursor: 'pointer',
            }}
          >
            {showSnapshotForm ? '−' : '+'}
          </button>
        </label>

        {/* Snapshot Creation Form */}
        {showSnapshotForm ? (
          <div
            style={{
              padding: 12,
              backgroundColor: 'var(--muted)',
              borderRadius: 6,
              marginBottom: 10,
            }}
          >
            <input
              type="text"
              value={snapshotName}
              onChange={(e) => {
                setSnapshotName(e.target.value);
              }}
              placeholder="Snapshot name..."
              style={{
                width: '100%',
                padding: '8px 10px',
                backgroundColor: 'var(--input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                color: 'var(--foreground)',
                outline: 'none',
                marginBottom: 8,
                boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              value={snapshotDescription}
              onChange={(e) => {
                setSnapshotDescription(e.target.value);
              }}
              placeholder="Description (optional)..."
              style={{
                width: '100%',
                padding: '8px 10px',
                backgroundColor: 'var(--input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                color: 'var(--foreground)',
                outline: 'none',
                marginBottom: 8,
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleCreateSnapshot}
              disabled={snapshotName.trim() === ''}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: snapshotName.trim() !== '' ? 'var(--primary)' : 'var(--muted)',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                color:
                  snapshotName.trim() !== ''
                    ? 'var(--primary-foreground)'
                    : 'var(--muted-foreground)',
                cursor: snapshotName.trim() !== '' ? 'pointer' : 'not-allowed',
              }}
            >
              Create Snapshot
            </button>
          </div>
        ) : null}

        {/* Snapshot List */}
        {workflow.snapshots.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workflow.snapshots.map((snapshot: WorkflowSnapshot) => (
              <div
                key={snapshot.id}
                style={{
                  padding: 10,
                  backgroundColor: 'var(--muted)',
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--foreground)',
                      fontWeight: 500,
                    }}
                  >
                    {snapshot.name}
                  </span>
                  <button
                    onClick={() => {
                      onRestoreSnapshot(snapshot.id);
                    }}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'var(--primary)',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 11,
                      color: 'var(--primary-foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    Restore
                  </button>
                </div>
                {snapshot.description !== undefined && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--muted-foreground)',
                      marginTop: 4,
                    }}
                  >
                    {snapshot.description}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--muted-foreground)',
                    marginTop: 4,
                  }}
                >
                  {formatDate(snapshot.createdAt)}
                </div>
              </div>
            ))}
          </div>
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
            No snapshots yet
          </div>
        )}
      </div>
    </div>
  );
}
