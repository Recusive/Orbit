/**
 * MissionsCanvas
 * Main canvas component for missions mode - ReactFlow with agent cards
 */

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import {
  useMissionsStore,
  useMissionsUIStore,
  selectLeftSidebarVisualWidth,
  selectRightSidebarVisualWidth,
} from '../stores';

import { AgentCardNode } from './AgentCardNode';
import { AgentExpandedView } from './AgentExpandedView';
import { MissionEdge } from './MissionEdge';
import { MissionsFloatingToolbar } from './MissionsFloatingToolbar';
import { MissionsRightSidebar } from './MissionsRightSidebar';
import { MissionsSidebar } from './MissionsSidebar';

import type { AgentCard, AgentCardNodeData, MissionConnection, MissionEdgeData } from '../types';
import type { Connection, Edge, EdgeTypes, Node, NodeTypes, OnConnect } from '@xyflow/react';

import './MissionsCanvas.css';

// ============================================================================
// Node/Edge Types
// ============================================================================

const nodeTypes: NodeTypes = {
  agent: AgentCardNode,
};

const edgeTypes: EdgeTypes = {
  mission: MissionEdge,
};

// ============================================================================
// Helpers
// ============================================================================

function agentToNode(
  agent: AgentCard,
  callbacks: {
    onUpdate: (id: string, updates: Partial<AgentCard>) => void;
    onDelete: (id: string) => void;
    onExecute?: (id: string) => void; // Optional until wired to agent-bridge
    onStop?: (id: string) => void; // Optional until wired to agent-bridge
    onConfigure: (id: string) => void;
    onExpand: (id: string) => void;
  }
): Node<AgentCardNodeData> {
  return {
    id: agent.id,
    type: 'agent',
    position: agent.position,
    data: {
      agent,
      onUpdate: callbacks.onUpdate,
      onDelete: callbacks.onDelete,
      onConfigure: callbacks.onConfigure,
      onExpand: callbacks.onExpand,
      // Conditionally spread optional callbacks to avoid exactOptionalPropertyTypes issues
      ...(callbacks.onExecute !== undefined && { onExecute: callbacks.onExecute }),
      ...(callbacks.onStop !== undefined && { onStop: callbacks.onStop }),
    },
  };
}

function connectionToEdge(
  connection: MissionConnection,
  isActive: boolean,
  callbacks: {
    onUpdate: (id: string, updates: Partial<MissionConnection>) => void;
    onDelete: (id: string) => void;
  }
): Edge<MissionEdgeData> {
  return {
    id: connection.id,
    type: 'mission',
    source: connection.sourceAgentId,
    target: connection.targetAgentId,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    data: {
      connection,
      isActive,
      onUpdate: callbacks.onUpdate,
      onDelete: callbacks.onDelete,
    },
  };
}

// ============================================================================
// Component
// ============================================================================

interface MissionsCanvasProps {
  readonly onAgentSelect?: (agentId: string | null) => void;
}

/**
 * Inner canvas component that has access to useReactFlow() via ReactFlow's context.
 * The outer MissionsCanvas wraps this in ReactFlowProvider to ensure the context is available.
 */
function MissionsCanvasInner({ onAgentSelect }: MissionsCanvasProps): React.JSX.Element {
  // Get ReactFlow instance for coordinate transforms (zoom/pan-aware positioning)
  const { screenToFlowPosition } = useReactFlow();

  // Store state
  const agents = useMissionsStore((s) => s.agents);
  const connections = useMissionsStore((s) => s.connections);
  const runningAgentIds = useMissionsStore((s) => s.runningAgentIds);

  // Store actions
  const addAgent = useMissionsStore((s) => s.addAgent);
  const updateAgent = useMissionsStore((s) => s.updateAgent);
  const deleteAgent = useMissionsStore((s) => s.deleteAgent);
  const addConnection = useMissionsStore((s) => s.addConnection);
  const updateConnection = useMissionsStore((s) => s.updateConnection);
  const deleteConnection = useMissionsStore((s) => s.deleteConnection);
  const setFocusedAgent = useMissionsStore((s) => s.setFocusedAgent);

  // UI store - sidebar state for Controls/MiniMap positioning
  const leftSidebarCollapsed = useMissionsUIStore((s) => s.leftSidebarCollapsed);
  const leftSidebarVisualWidth = useMissionsUIStore(selectLeftSidebarVisualWidth);
  const rightSidebarCollapsed = useMissionsUIStore((s) => s.rightSidebarCollapsed);
  const rightSidebarVisualWidth = useMissionsUIStore(selectRightSidebarVisualWidth);
  const showMinimap = useMissionsUIStore((s) => s.showMinimap);

  // Expanded agent state - when set, shows full agent view overlay
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // Get the expanded agent data (undefined if agent was deleted while expanded)
  const expandedAgent = expandedAgentId !== null ? (agents[expandedAgentId] ?? null) : null;

  // Clean up expanded view if the agent is deleted while expanded
  useEffect(() => {
    if (expandedAgentId !== null && expandedAgent === null) {
      // Agent was deleted while expanded view was open - close the view
      setExpandedAgentId(null);
    }
  }, [expandedAgentId, expandedAgent]);

  // Stable callbacks for node interactions (extracted to prevent re-renders)
  const handleConfigure = useCallback(
    (id: string): void => {
      setFocusedAgent(id);
    },
    [setFocusedAgent]
  );

  const handleExpand = useCallback((id: string): void => {
    setExpandedAgentId(id);
  }, []);

  // Callbacks for nodes
  // NOTE: onExecute/onStop are omitted until agent-bridge integration is complete.
  // AgentCardNode disables Run/Stop buttons when these are undefined.
  const nodeCallbacks = useMemo(
    () => ({
      onUpdate: updateAgent,
      onDelete: deleteAgent,
      // onExecute and onStop are intentionally omitted - will be wired to agent-bridge
      onConfigure: handleConfigure,
      onExpand: handleExpand,
    }),
    [updateAgent, deleteAgent, handleConfigure, handleExpand]
  );

  // Callbacks for edges
  const edgeCallbacks = useMemo(
    () => ({
      onUpdate: updateConnection,
      onDelete: deleteConnection,
    }),
    [updateConnection, deleteConnection]
  );

  // Convert store data to ReactFlow nodes/edges
  const initialNodes = useMemo(() => {
    return Object.values(agents).map((agent) => agentToNode(agent, nodeCallbacks));
  }, [agents, nodeCallbacks]);

  const initialEdges = useMemo(() => {
    const runningSet = new Set(runningAgentIds);
    return Object.values(connections).map((conn) => {
      const isActive = runningSet.has(conn.sourceAgentId);
      return connectionToEdge(conn, isActive, edgeCallbacks);
    });
  }, [connections, runningAgentIds, edgeCallbacks]);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync store changes to ReactFlow while preserving internal state (selected, dragging)
  // This is critical because ReactFlow maintains transient state that would be lost
  // if we simply replaced nodes/edges wholesale during streaming updates.
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return Object.values(agents).map((agent) => {
        const next = agentToNode(agent, nodeCallbacks);
        const prevNode = prevById.get(agent.id);
        // Preserve ReactFlow's transient state (selected, dragging) if node existed before
        if (prevNode === undefined) return next;
        // Preserve selected/dragging state with explicit boolean assignments
        if (prevNode.selected === true) next.selected = true;
        if (prevNode.dragging === true) next.dragging = true;
        return next;
      });
    });
  }, [agents, nodeCallbacks, setNodes]);

  useEffect(() => {
    const runningSet = new Set(runningAgentIds);
    setEdges((prev) => {
      const prevById = new Map(prev.map((e) => [e.id, e]));
      return Object.values(connections).map((conn) => {
        const isActive = runningSet.has(conn.sourceAgentId);
        const next = connectionToEdge(conn, isActive, edgeCallbacks);
        const prevEdge = prevById.get(conn.id);
        // Preserve ReactFlow's transient state (selected) if edge existed before
        if (prevEdge === undefined) return next;
        if (prevEdge.selected === true) next.selected = true;
        return next;
      });
    });
  }, [connections, runningAgentIds, edgeCallbacks, setEdges]);

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Add to store
      addConnection({
        id: `conn-${String(Date.now())}`,
        sourceAgentId: connection.source,
        targetAgentId: connection.target,
        createdBy: 'user',
      });
    },
    [addConnection]
  );

  // Handle node changes (position and deletion)
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);

      // Sync changes to missions store
      for (const change of changes) {
        if (change.type === 'position' && change.position !== undefined) {
          updateAgent(change.id, { position: change.position });
        } else if (change.type === 'remove') {
          // Sync deletion to store (triggered by deleteKeyCode)
          deleteAgent(change.id);
        }
      }
    },
    [onNodesChange, updateAgent, deleteAgent]
  );

  // Handle edge changes (deletion)
  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);

      // Sync deletions to missions store
      for (const change of changes) {
        if (change.type === 'remove') {
          deleteConnection(change.id);
        }
      }
    },
    [onEdgesChange, deleteConnection]
  );

  // Handle node selection
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setFocusedAgent(node.id);
      onAgentSelect?.(node.id);
    },
    [setFocusedAgent, onAgentSelect]
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    setFocusedAgent(null);
    onAgentSelect?.(null);
  }, [setFocusedAgent, onAgentSelect]);

  // Handle double-click to add agent
  // Uses screenToFlowPosition to correctly place agents when canvas is zoomed/panned
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Convert screen coordinates to flow coordinates (accounts for zoom/pan)
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addAgent({
        id: `agent-${String(Date.now())}`,
        createdBy: 'user',
        position,
        name: `Agent ${String(Object.keys(agents).length + 1)}`,
      });
    },
    [addAgent, agents, screenToFlowPosition]
  );

  // Handle add agent from toolbar
  const handleAddAgent = useCallback(() => {
    addAgent({
      id: `agent-${String(Date.now())}`,
      createdBy: 'user',
      position: { x: 200, y: 200 },
      name: `Agent ${String(Object.keys(agents).length + 1)}`,
    });
  }, [addAgent, agents]);

  return (
    <div className="missions-canvas-container">
      {/* Left Sidebar - Floating overlay */}
      <MissionsSidebar />

      {/* Main Canvas */}
      <div className="missions-canvas-main">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onDoubleClick={handleDoubleClick}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          {/* Background - hidden like workflow mode */}
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="transparent" />
          <Controls
            showZoom
            showFitView
            showInteractive={false}
            position="bottom-left"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              left: leftSidebarCollapsed ? 8 : leftSidebarVisualWidth + 16,
              transition: 'left 280ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
          {showMinimap ? (
            <MiniMap
              style={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
                width: 120,
                height: 80,
                right: rightSidebarCollapsed ? 8 : rightSidebarVisualWidth + 16,
                transition: 'right 280ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              maskColor="rgba(0, 0, 0, 0.5)"
            />
          ) : null}
        </ReactFlow>

        {/* Floating Toolbar */}
        <MissionsFloatingToolbar onAddAgent={handleAddAgent} />
      </div>

      {/* Right Sidebar - Floating overlay */}
      <MissionsRightSidebar />

      {/* Expanded Agent View - Full screen overlay */}
      {/* Wrapped in ErrorBoundary because it imports heavy components (ChatArea, ActionsBar) */}
      {expandedAgent !== null ? (
        <ErrorBoundary
          fallback={(error, reset) => (
            <div className="agent-expanded-error">
              <div className="agent-expanded-error-content">
                <h3>Agent View Error</h3>
                <p>{error.message}</p>
                <div className="agent-expanded-error-actions">
                  <button onClick={reset}>Try Again</button>
                  <button
                    onClick={() => {
                      setExpandedAgentId(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        >
          <AgentExpandedView
            agent={expandedAgent}
            onClose={() => {
              setExpandedAgentId(null);
            }}
          />
        </ErrorBoundary>
      ) : null}
    </div>
  );
}

/**
 * MissionsCanvas - Main exported component
 * Wraps MissionsCanvasInner in ReactFlowProvider to enable useReactFlow() hook
 * for coordinate transforms (screenToFlowPosition).
 *
 * Includes ErrorBoundary to catch ReactFlow errors and prevent canvas crashes.
 */
export function MissionsCanvas({ onAgentSelect }: MissionsCanvasProps): React.JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="missions-canvas-error">
          <div className="missions-canvas-error-content">
            <h3>Canvas Error</h3>
            <p>{error.message}</p>
            <button onClick={reset}>Try Again</button>
          </div>
        </div>
      )}
    >
      <ReactFlowProvider>
        {/* Spread props to handle exactOptionalPropertyTypes correctly */}
        <MissionsCanvasInner {...(onAgentSelect !== undefined && { onAgentSelect })} />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
