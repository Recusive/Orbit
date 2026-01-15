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
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo } from 'react';

import {
  useMissionsStore,
  useMissionsUIStore,
  selectLeftSidebarVisualWidth,
  selectRightSidebarVisualWidth,
} from '../stores';

import { AgentCardNode } from './AgentCardNode';
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
    onExecute: (id: string) => void;
    onStop: (id: string) => void;
    onConfigure: (id: string) => void;
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
      onExecute: callbacks.onExecute,
      onStop: callbacks.onStop,
      onConfigure: callbacks.onConfigure,
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

export function MissionsCanvas({ onAgentSelect }: MissionsCanvasProps): React.JSX.Element {
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
  const showGrid = useMissionsUIStore((s) => s.showGrid);

  // Callbacks for nodes
  const nodeCallbacks = useMemo(
    () => ({
      onUpdate: updateAgent,
      onDelete: deleteAgent,
      onExecute: () => {
        // TODO: Execute single agent - will be wired to agent-bridge
      },
      onStop: () => {
        // TODO: Stop single agent - will be wired to agent-bridge
      },
      onConfigure: (id: string) => {
        setFocusedAgent(id);
      },
    }),
    [updateAgent, deleteAgent, setFocusedAgent]
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

  // Sync store changes to ReactFlow
  useEffect(() => {
    setNodes(Object.values(agents).map((agent) => agentToNode(agent, nodeCallbacks)));
  }, [agents, nodeCallbacks, setNodes]);

  useEffect(() => {
    const runningSet = new Set(runningAgentIds);
    setEdges(
      Object.values(connections).map((conn) => {
        const isActive = runningSet.has(conn.sourceAgentId);
        return connectionToEdge(conn, isActive, edgeCallbacks);
      })
    );
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

  // Handle node position changes
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);

      // Update agent positions in store
      for (const change of changes) {
        if (change.type === 'position' && change.position !== undefined) {
          updateAgent(change.id, { position: change.position });
        }
      }
    },
    [onNodesChange, updateAgent]
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
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      addAgent({
        id: `agent-${String(Date.now())}`,
        createdBy: 'user',
        position,
        name: `Agent ${String(Object.keys(agents).length + 1)}`,
      });
    },
    [addAgent, agents]
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
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onDoubleClick={handleDoubleClick}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          {showGrid ? (
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
          ) : null}
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
    </div>
  );
}
