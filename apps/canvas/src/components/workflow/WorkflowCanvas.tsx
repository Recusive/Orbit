import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { selectCards, selectConnections, useWorkflowStore } from '../../stores/workflowStore';
import {
  selectLeftSidebarCollapsed,
  selectLeftSidebarVisualWidth,
  selectRightSidebarCollapsed,
  selectRightSidebarVisualWidth,
  useWorkflowUIStore,
} from '../../stores/workflowUIStore';

import { AIPromptPanel } from './AIPromptPanel';
import { AddCardDialog } from './AddCardDialog';
import { CardExpandedView } from './CardExpandedView';
import { ConnectionLabelDialog } from './ConnectionLabelDialog';
import { ConnectionPropertiesPanel } from './ConnectionPropertiesPanel';
import { MarkdownCardNode } from './MarkdownCardNode';
import { WorkflowEdge } from './WorkflowEdge';
import { WorkflowFloatingToolbar } from './WorkflowFloatingToolbar';

import type {
  MarkdownCard,
  MarkdownCardNodeData,
  WorkflowConnection,
  WorkflowEdgeData,
  LineRange,
  CardType,
  AgentType,
} from '../../types/workflowTypes';
import type {
  OnConnectStartParams,
  Node,
  Edge,
  Connection,
  NodeTypes,
  EdgeTypes,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';

// ============================================================================
// Node & Edge Types Registration
// ============================================================================

// Cast to NodeTypes/EdgeTypes for ReactFlow compatibility
const nodeTypes = {
  markdownCard: MarkdownCardNode,
} as NodeTypes;

const edgeTypes = {
  workflow: WorkflowEdge,
} as EdgeTypes;

// ============================================================================
// Helper Functions - Convert store data to ReactFlow format
// ============================================================================

function cardsToNodes(cards: Record<string, MarkdownCard>): Node[] {
  return Object.values(cards).map((card) => ({
    id: card.id,
    type: 'markdownCard',
    position: card.position,
    data: {
      card,
    },
  }));
}

function connectionsToEdges(connections: Record<string, WorkflowConnection>): Edge[] {
  return Object.values(connections).map((connection) => ({
    id: connection.id,
    source: connection.sourceCardId,
    target: connection.targetCardId,
    // Always use correct handle types: right for source, left for target
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'workflow',
    // Smaller, subtle arrow marker
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: 'var(--muted-foreground)',
    },
    data: {
      connection,
    },
  }));
}

// ============================================================================
// WorkflowCanvas Component
// ============================================================================

interface WorkflowCanvasProps {
  onCardSelect?: (cardId: string | null) => void;
}

// Inner component that uses ReactFlow hooks (must be inside ReactFlowProvider)
function WorkflowCanvasInner({ onCardSelect }: WorkflowCanvasProps): React.JSX.Element {
  // Sidebar state for Controls/MiniMap positioning
  const isSidebarCollapsed = useWorkflowUIStore(selectLeftSidebarCollapsed);
  const leftSidebarVisualWidth = useWorkflowUIStore(selectLeftSidebarVisualWidth);
  const isRightSidebarCollapsed = useWorkflowUIStore(selectRightSidebarCollapsed);
  const rightSidebarVisualWidth = useWorkflowUIStore(selectRightSidebarVisualWidth);

  // Get data from store
  const storeCards = useWorkflowStore(selectCards);
  const storeConnections = useWorkflowStore(selectConnections);
  const storeUpdateCard = useWorkflowStore((state) => state.updateCard);
  const storeDeleteCard = useWorkflowStore((state) => state.deleteCard);
  const storeDuplicateCard = useWorkflowStore((state) => state.duplicateCard);
  const storeAddCard = useWorkflowStore((state) => state.addCard);
  const storeAddConnection = useWorkflowStore((state) => state.addConnection);
  const storeUpdateConnection = useWorkflowStore((state) => state.updateConnection);
  const storeDeleteConnection = useWorkflowStore((state) => state.deleteConnection);

  // Derive ReactFlow nodes and edges from store
  const storeNodes = useMemo(() => cardsToNodes(storeCards), [storeCards]);
  const storeEdges = useMemo(() => connectionsToEdges(storeConnections), [storeConnections]);

  // ReactFlow state - initialized from store, synced back
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // Sync store changes to ReactFlow state
  useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // Custom nodes change handler to sync position changes to store
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]): void => {
      // First, apply changes to ReactFlow state
      onNodesChange(changes);

      // Then sync position changes to store
      for (const change of changes) {
        if (
          change.type === 'position' &&
          change.position !== undefined &&
          change.dragging === false
        ) {
          // Only update store when drag ends (dragging === false)
          storeUpdateCard(change.id, { position: change.position });
        }
      }
    },
    [onNodesChange, storeUpdateCard]
  );

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);
  // State for tracking connection drag
  const [connectingFrom, setConnectingFrom] = useState<OnConnectStartParams | null>(null);
  // State for creating card from dropped connection
  const [pendingConnectionSource, setPendingConnectionSource] = useState<{
    nodeId: string;
    handleId: string | null;
    position: { x: number; y: number };
  } | null>(null);

  // ReactFlow instance for viewport operations
  const { getViewport, screenToFlowPosition } = useReactFlow();

  // ========================================================================
  // Card Operations - Using store actions
  // ========================================================================

  const handleCardUpdate = useCallback(
    (cardId: string, updates: Partial<MarkdownCard>): void => {
      storeUpdateCard(cardId, updates);
    },
    [storeUpdateCard]
  );

  const handleCardDelete = useCallback(
    (cardId: string): void => {
      storeDeleteCard(cardId);
    },
    [storeDeleteCard]
  );

  const handleCardDuplicate = useCallback(
    (cardId: string): void => {
      storeDuplicateCard(cardId);
    },
    [storeDuplicateCard]
  );

  const handleToggleCollapse = useCallback(
    (cardId: string): void => {
      const card = storeCards[cardId];
      if (card !== undefined) {
        storeUpdateCard(cardId, { collapsed: !card.collapsed });
      }
    },
    [storeCards, storeUpdateCard]
  );

  const handleLineSelect = useCallback(
    (cardId: string, ranges: LineRange[]): void => {
      handleCardUpdate(cardId, { selectedRanges: ranges });
    },
    [handleCardUpdate]
  );

  const handleAssignAgent = useCallback((cardId: string, agentType: AgentType): void => {
    // agentType will be used to pre-select agent in future
    void agentType;
    // Open AI prompt panel with the card in context
    // Ensure the card is in the selection
    setSelectedCardIds((prev) => {
      if (!prev.includes(cardId)) {
        return [...prev, cardId];
      }
      return prev;
    });
    setAiPromptOpen(true);
  }, []);

  // Handle AI prompt panel
  const handleCloseAiPrompt = useCallback((): void => {
    setAiPromptOpen(false);
  }, []);

  // Handle Add Card dialog
  const handleOpenAddCardDialog = useCallback((): void => {
    setAddCardDialogOpen(true);
  }, []);

  const handleCloseAddCardDialog = useCallback((): void => {
    setAddCardDialogOpen(false);
    setPendingConnectionSource(null);
  }, []);

  const handleCreateCardFromDialog = useCallback(
    (name: string, type: CardType, content: string): void => {
      // Use pending connection position if available, otherwise use viewport center
      let x: number;
      let y: number;

      if (pendingConnectionSource !== null) {
        // Use the drop position from the connection drag
        x = pendingConnectionSource.position.x;
        y = pendingConnectionSource.position.y;
      } else {
        // Fallback to viewport center
        const viewport = getViewport();
        x = (-viewport.x + 400) / viewport.zoom;
        y = (-viewport.y + 300) / viewport.zoom;
      }

      const newCardId = `card-${String(Date.now())}`;

      storeAddCard({
        id: newCardId,
        createdBy: 'user',
        name,
        content,
        type,
        position: { x, y },
      });

      // If this was from a connection drag, create the connection after the node renders
      if (pendingConnectionSource !== null) {
        const handleId = pendingConnectionSource.handleId;
        const originNodeId = pendingConnectionSource.nodeId;
        setPendingConnectionSource(null);

        // Delay connection creation to allow node to render with its handles
        requestAnimationFrame(() => {
          // Determine direction based on which handle was dragged from:
          // - If dragged from "right" (source handle), origin is source, new card is target
          // - If dragged from "left" (target handle), new card is source, origin is target
          const isFromSourceHandle = handleId === 'right' || handleId === null;

          storeAddConnection({
            id: `edge-${String(Date.now())}`,
            sourceCardId: isFromSourceHandle ? originNodeId : newCardId,
            targetCardId: isFromSourceHandle ? newCardId : originNodeId,
            sourceHandle: 'right', // Always use right as source
            targetHandle: 'left', // Always use left as target
            createdBy: 'user',
            label: '',
          });
        });
      }
    },
    [getViewport, storeAddCard, storeAddConnection, pendingConnectionSource]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const isMac = navigator.userAgent.toUpperCase().includes('MAC');

    const handleKeyDown = (e: KeyboardEvent): void => {
      const isModKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + K to open AI prompt panel
      if (isModKey && e.key === 'k') {
        // Only handle if we have selected cards
        if (selectedCardIds.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setAiPromptOpen(true);
        }
      }

      // Cmd/Ctrl + N to open Add Card dialog
      if (isModKey && e.key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        setAddCardDialogOpen(true);
      }
    };

    // Use capture phase to intercept before global handler
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [selectedCardIds]);

  // Handle card expand
  const handleExpand = useCallback((cardId: string): void => {
    setExpandedCardId(cardId);
  }, []);

  // Handle close expanded view
  const handleCloseExpanded = useCallback((): void => {
    setExpandedCardId(null);
  }, []);

  // Get expanded card
  const expandedCard =
    expandedCardId !== null
      ? ((nodes.find((n) => n.id === expandedCardId)?.data as MarkdownCardNodeData | undefined)
          ?.card ?? null)
      : null;

  // Get cards and connections for AI context
  const allCards = useMemo(() => {
    return nodes
      .map((node) => (node.data as MarkdownCardNodeData | undefined)?.card)
      .filter((card): card is MarkdownCard => card !== undefined);
  }, [nodes]);

  const allConnections = useMemo(() => {
    return edges
      .map((edge) => (edge.data as WorkflowEdgeData | undefined)?.connection)
      .filter((connection): connection is WorkflowConnection => connection !== undefined);
  }, [edges]);

  // Get line selections from selected cards
  const lineSelections = useMemo(() => {
    const selections: Record<string, LineRange[]> = {};
    for (const cardId of selectedCardIds) {
      const card = allCards.find((c) => c.id === cardId);
      if (card !== undefined && card.selectedRanges.length > 0) {
        selections[cardId] = card.selectedRanges;
      }
    }
    return selections;
  }, [selectedCardIds, allCards]);

  // ========================================================================
  // Node data with callbacks
  // ========================================================================

  const nodesWithCallbacks = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onUpdate: handleCardUpdate,
        onDelete: handleCardDelete,
        onDuplicate: handleCardDuplicate,
        onToggleCollapse: handleToggleCollapse,
        onLineSelect: handleLineSelect,
        onAssignAgent: handleAssignAgent,
        onExpand: handleExpand,
      },
    }));
  }, [
    nodes,
    handleCardUpdate,
    handleCardDelete,
    handleCardDuplicate,
    handleToggleCollapse,
    handleLineSelect,
    handleAssignAgent,
    handleExpand,
  ]);

  // ========================================================================
  // Edge Operations
  // ========================================================================

  const handleEdgeUpdate = useCallback(
    (edgeId: string, updates: Partial<WorkflowConnection>): void => {
      storeUpdateConnection(edgeId, updates);
    },
    [storeUpdateConnection]
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string): void => {
      storeDeleteConnection(edgeId);
      setSelectedEdgeId(null);
    },
    [storeDeleteConnection]
  );

  // Get selected edge for properties panel
  const selectedEdge = selectedEdgeId !== null ? edges.find((e) => e.id === selectedEdgeId) : null;
  const selectedConnection =
    selectedEdge !== null && selectedEdge !== undefined
      ? ((selectedEdge.data as WorkflowEdgeData | undefined)?.connection ?? null)
      : null;

  // Handle close properties panel
  const handleClosePropertiesPanel = useCallback((): void => {
    setSelectedEdgeId(null);
  }, []);

  // Edge data with callbacks
  const edgesWithCallbacks = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data,
        onUpdate: handleEdgeUpdate,
        onDelete: handleEdgeDelete,
      },
    }));
  }, [edges, handleEdgeUpdate, handleEdgeDelete]);

  // ========================================================================
  // Connection Operations
  // ========================================================================

  // Ref to track if connection was successfully made (onConnect was called)
  const connectionMadeRef = useRef(false);

  // Track when connection drag starts
  const handleConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams): void => {
      setConnectingFrom(params);
      connectionMadeRef.current = false;
    },
    []
  );

  // Show label dialog when user creates a connection
  const handleConnect = useCallback((connection: Connection): void => {
    connectionMadeRef.current = true; // Mark that connection was made
    setConnectingFrom(null);
    setPendingConnection(connection);
  }, []);

  // Handle when connection drag ends - detect if dropped on empty space
  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent): void => {
      // Capture values before timeout (closure issue)
      const sourceParams = connectingFrom;
      const clientX = 'touches' in event ? (event.touches[0]?.clientX ?? 0) : event.clientX;
      const clientY = 'touches' in event ? (event.touches[0]?.clientY ?? 0) : event.clientY;

      // Small delay to let onConnect fire first if it's going to
      setTimeout(() => {
        // If connection was made, don't do anything
        if (connectionMadeRef.current) {
          setConnectingFrom(null);
          return;
        }

        // If no source params, nothing to do
        if (sourceParams === null) return;

        // Dropped on empty space - create new card
        const nodeId = sourceParams.nodeId;
        const handleId = sourceParams.handleId;

        if (nodeId) {
          const position = screenToFlowPosition({ x: clientX, y: clientY });

          // Store the pending connection source and open the dialog
          setPendingConnectionSource({
            nodeId,
            handleId: handleId ?? null,
            position,
          });
          setAddCardDialogOpen(true);
        }

        setConnectingFrom(null);
      }, 50);
    },
    [connectingFrom, screenToFlowPosition]
  );

  // Create the connection with the provided label
  const handleConfirmConnection = useCallback(
    (label: string): void => {
      if (pendingConnection === null) return;

      // Always use correct handle types: right for source, left for target
      // This normalizes connections regardless of which direction user dragged
      storeAddConnection({
        id: `edge-${String(Date.now())}`,
        sourceCardId: pendingConnection.source,
        targetCardId: pendingConnection.target,
        sourceHandle: 'right',
        targetHandle: 'left',
        createdBy: 'user',
        label,
      });

      setPendingConnection(null);
    },
    [pendingConnection, storeAddConnection]
  );

  // Cancel connection creation
  const handleCancelConnection = useCallback((): void => {
    setPendingConnection(null);
  }, []);

  // ========================================================================
  // Selection Handling
  // ========================================================================

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }): void => {
      // Track multi-card selection
      const newSelectedIds = selectedNodes.map((node) => node.id);
      setSelectedCardIds(newSelectedIds);

      // Notify parent of first selected (for backwards compatibility)
      const firstSelectedId = newSelectedIds[0] ?? null;
      onCardSelect?.(firstSelectedId);

      // Track edge selection
      const firstSelectedEdge = selectedEdges[0];
      const newSelectedEdgeId = firstSelectedEdge?.id ?? null;
      setSelectedEdgeId(newSelectedEdgeId);
    },
    [onCardSelect]
  );

  // ========================================================================
  // Double-click to add new card
  // ========================================================================

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent): void => {
      // Only create card if double-clicking on the pane background, not on a node or edge
      const target = event.target as HTMLElement;
      const isOnNode = target.closest('.react-flow__node') !== null;
      const isOnEdge = target.closest('.react-flow__edge') !== null;

      if (isOnNode || isOnEdge) {
        return;
      }

      // Get click position in flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Add card to store
      storeAddCard({
        id: `card-${String(Date.now())}`,
        createdBy: 'user',
        name: 'New Card',
        content: '# New Card\n\nStart writing here...',
        type: 'prompt',
        position,
      });
    },
    [storeAddCard, screenToFlowPosition]
  );

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <>
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edgesWithCallbacks}
          onNodesChange={handleNodesChange as (changes: NodeChange<Node>[]) => void}
          onEdgesChange={onEdgesChange as (changes: EdgeChange<Edge>[]) => void}
          onConnectStart={handleConnectStart}
          onConnect={handleConnect}
          onConnectEnd={handleConnectEnd}
          onSelectionChange={handleSelectionChange}
          onDoubleClick={handleDoubleClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          snapToGrid
          snapGrid={[16, 16]}
          multiSelectionKeyCode="Shift"
          selectionOnDrag
          defaultEdgeOptions={{
            type: 'workflow',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 12,
              height: 12,
              color: 'var(--muted-foreground)',
            },
          }}
          proOptions={{ hideAttribution: true }}
        >
          {/* Background - hidden */}
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="transparent" />

          {/* Controls */}
          <Controls
            showZoom
            showFitView
            showInteractive={false}
            position="bottom-left"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              left: isSidebarCollapsed ? 8 : leftSidebarVisualWidth + 16,
              transition: 'left 280ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />

          {/* Minimap */}
          <MiniMap
            nodeColor={(node) => {
              // Check if this is a workflow node with card data
              const nodeData = node.data as Record<string, unknown> | undefined;
              const card = nodeData?.['card'] as MarkdownCard | undefined;
              const cardType = card?.type;
              if (cardType) {
                const typeColors: Record<CardType, string> = {
                  prompt: '#3b82f6',
                  response: '#22c55e',
                  decision: '#eab308',
                  diagram: '#a855f7',
                  'code-snippet': '#6b7280',
                  document: '#14b8a6',
                };
                return typeColors[cardType];
              }
              return '#6b7280';
            }}
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
              width: 120,
              height: 80,
              right: isRightSidebarCollapsed ? 8 : rightSidebarVisualWidth + 16,
              transition: 'right 280ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            maskColor="rgba(0, 0, 0, 0.5)"
          />

          {/* Floating Toolbar */}
          <WorkflowFloatingToolbar
            onAddCard={handleOpenAddCardDialog}
            onOpenAgent={(): void => {
              window.dispatchEvent(new CustomEvent('orbit:agent-open'));
            }}
          />
        </ReactFlow>
      </div>

      {/* Expanded Card Modal */}
      {expandedCard !== null && (
        <CardExpandedView
          card={expandedCard}
          onClose={handleCloseExpanded}
          onUpdate={handleCardUpdate}
        />
      )}

      {/* Connection Properties Panel */}
      {selectedConnection !== null && (
        <ConnectionPropertiesPanel
          connection={selectedConnection}
          onUpdate={handleEdgeUpdate}
          onDelete={handleEdgeDelete}
          onClose={handleClosePropertiesPanel}
          isSidebarCollapsed={isRightSidebarCollapsed}
          sidebarVisualWidth={rightSidebarVisualWidth}
        />
      )}

      {/* Connection Label Dialog */}
      {pendingConnection !== null && (
        <ConnectionLabelDialog
          onConfirm={handleConfirmConnection}
          onCancel={handleCancelConnection}
        />
      )}

      {/* AI Prompt Panel */}
      {aiPromptOpen ? (
        <AIPromptPanel
          cards={allCards}
          connections={allConnections}
          selectedCardIds={selectedCardIds}
          lineSelections={lineSelections}
          onClose={handleCloseAiPrompt}
        />
      ) : null}

      {/* Add Card Dialog */}
      <AddCardDialog
        isOpen={addCardDialogOpen}
        onClose={handleCloseAddCardDialog}
        onCreateCard={handleCreateCardFromDialog}
      />
    </>
  );
}

// Exported wrapper that provides isolated ReactFlowProvider context
export function WorkflowCanvas(props: WorkflowCanvasProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
