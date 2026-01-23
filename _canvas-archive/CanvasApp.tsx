import { createLogger } from '@orbit/common/lib';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const logger = createLogger('CanvasApp');

import { AgentChatPanel } from './components/agent/AgentChatPanel';
import { CanvasFloatingToolbar } from './components/canvas/CanvasFloatingToolbar';
import { CanvasToolbar } from './components/canvas/CanvasToolbar';
import { DesignCanvasNode } from './components/design/DesignCanvasNode';
import { DesignLeftSidebar } from './components/design/DesignLeftSidebar';
import { DrawingPreview } from './components/drawing/DrawingPreview';
import { DrawingToolsPanel } from './components/drawing/DrawingToolsPanel';
import { CommandPalette } from './components/menus/CommandPalette';
import { ComponentMenu } from './components/menus/ComponentMenu';
import { ContextMenu } from './components/menus/ContextMenu';
import { SmartGuidesOverlay } from './components/overlays/SmartGuidesOverlay';
import { InlineTextEditor } from './components/shared/InlineTextEditor';
import { RightSidebar } from './components/shared/RightSidebar';
import { ShortcutsHelp } from './components/shared/ShortcutsHelp';
import { WorkflowCanvas } from './components/workflow/WorkflowCanvas';
import { WorkflowRightSidebar } from './components/workflow/WorkflowRightSidebar';
import { WorkflowSidebar } from './components/workflow/WorkflowSidebar';
import { createCommands, modKey } from './config/commands';
import { initialEdges, initialNodes } from './config/initialState';
import { useBackendSync } from './hooks/backend/useBackendSync';
import { useMcpToolExecution } from './hooks/backend/useMcpToolExecution';
import { useDesignTree } from './hooks/design/useDesignTree';
import { useSmartGuides } from './hooks/design/useSmartGuides';
import { useDrawingTools } from './hooks/drawing/useDrawingTools';
import {
  useCanvasActions,
  useCanvasPersistence,
  useCanvasShortcuts,
  useCanvasToolExecution,
  useLayerManagement,
  useTauriCanvas,
  usePerception,
} from './hooks/index';
import { MissionsCanvas } from './missions/components';
import { useMissionsUIStore } from './missions/stores';
// Canvas colors now come from CSS variables in globals.css
import { PageNode, EsmSandpackNode } from './sandpack/index';
import { selectActiveWorkflow, useWorkflowStore } from './stores/workflowStore';
import {
  selectLeftSidebarCollapsed,
  selectLeftSidebarVisualWidth,
  selectRightSidebarCollapsed,
  selectRightSidebarVisualWidth,
  useWorkflowUIStore,
} from './stores/workflowUIStore';
import { DEFAULT_CANVAS_MODE } from './types/canvasMode';

import type { ContextMenuItem } from './components/menus/ContextMenu';
import type { Guide } from './hooks/design/useSmartGuides';
import type { ContextMenuState } from './hooks/index';
import type { ComponentTemplate } from './lib/components/componentLibrary';
import type { EsmSandpackNodeData } from './sandpack/EsmSandpackNode';
import type { CanvasMode } from './types/canvasMode';
import type { DesignNode, TextNode as DesignTextNode } from './types/designNodeTypes';
import type { PerceptionResult } from './types/ipcProtocol';
import type { PageNodeData } from './types/pageTypes';
import type { Connection, Node, NodeTypes } from '@xyflow/react';

// Code-first canvas: EsmSandpackNode for components, PageNode for compositions
// Design mode: DesignCanvasNode with NodeResizer for visual primitives
const nodeTypes: NodeTypes = {
  sandpack: EsmSandpackNode,
  page: PageNode,
  design: DesignCanvasNode,
};

// SVG Icons for context menu
const TrashIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const CopyIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const DuplicateIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="8" y="8" width="14" height="14" rx="2" ry="2"></rect>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
  </svg>
);

const ExportIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
);

function CanvasAppInner(): React.JSX.Element {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showComponentMenu, setShowComponentMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 100, y: 100 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(DEFAULT_CANVAS_MODE.mode);

  // Workflow state and actions
  const activeWorkflow = useWorkflowStore(selectActiveWorkflow);
  const { loadWorkflow, createWorkflow, deleteWorkflow, listWorkflows } = useBackendSync();

  // Sidebar state (workflow)
  const isSidebarCollapsed = useWorkflowUIStore(selectLeftSidebarCollapsed);
  const leftSidebarVisualWidth = useWorkflowUIStore(selectLeftSidebarVisualWidth);
  const toggleLeftSidebar = useWorkflowUIStore((state) => state.toggleLeftSidebar);
  const isRightSidebarCollapsed = useWorkflowUIStore(selectRightSidebarCollapsed);
  const rightSidebarVisualWidth = useWorkflowUIStore(selectRightSidebarVisualWidth);
  const toggleRightSidebar = useWorkflowUIStore((state) => state.toggleRightSidebar);

  // Sidebar state (missions) - only collapsed/toggle needed, width is managed inside MissionsCanvas
  const missionsLeftSidebarCollapsed = useMissionsUIStore((s) => s.leftSidebarCollapsed);
  const missionsToggleLeftSidebar = useMissionsUIStore((s) => s.toggleLeftSidebar);
  const missionsRightSidebarCollapsed = useMissionsUIStore((s) => s.rightSidebarCollapsed);
  const missionsToggleRightSidebar = useMissionsUIStore((s) => s.toggleRightSidebar);

  // Fetch workflow list when entering workflow mode
  useEffect(() => {
    if (canvasMode === 'workflow') {
      listWorkflows();
    }
  }, [canvasMode, listWorkflows]);

  // Workflow sidebar handlers
  const handleWorkflowSelect = useCallback(
    (workflowId: string): void => {
      loadWorkflow(workflowId);
    },
    [loadWorkflow]
  );

  const handleWorkflowCreate = useCallback(
    (name: string): void => {
      createWorkflow(name);
    },
    [createWorkflow]
  );

  const handleWorkflowDelete = useCallback(
    (workflowId: string): void => {
      deleteWorkflow(workflowId);
    },
    [deleteWorkflow]
  );

  const handleWorkflowRefresh = useCallback((): void => {
    listWorkflows();
  }, [listWorkflows]);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow();
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  // Canvas persistence hook
  const { loadState, saveState } = useCanvasPersistence();

  // Layer management hook (old system - keeping for now)
  const layerManagement = useLayerManagement();

  // New Design Tree system - unified layer/object model
  const designTree = useDesignTree();
  const syncedNodeIdsRef = useRef<Set<string>>(new Set());

  // Drawing tools for design mode
  const handleNodeCreated = useCallback(
    (node: DesignNode): void => {
      designTree.dispatch({ type: 'ADD_NODE', node });
      designTree.selectNode(node.id);
    },
    [designTree]
  );

  const drawingTools = useDrawingTools({
    onNodeCreated: handleNodeCreated,
    onToolChange: (): void => {
      // Tool change handled
    },
  });

  // Memoized handler for design node updates
  const handleDesignNodeUpdate = useCallback(
    (nodeId: string, updates: Partial<DesignNode>): void => {
      designTree.updateNode(nodeId, updates);
    },
    [designTree]
  );

  // Smart guides for alignment snapping
  useSmartGuides({ threshold: 5, enabled: canvasMode === 'design' });
  const [activeGuides] = useState<Guide[]>([]);

  // Inline text editing state
  const [editingTextNode, setEditingTextNode] = useState<DesignTextNode | null>(null);

  // Handler to start editing a text node
  const handleStartTextEdit = useCallback(
    (nodeId: string): void => {
      const designNode = designTree.tree.nodes.get(nodeId);
      if (designNode?.type === 'text') {
        setEditingTextNode(designNode);
      }
    },
    [designTree.tree.nodes]
  );

  // Handler to save text edits
  const handleSaveTextEdit = useCallback(
    (nodeId: string, newContent: string): void => {
      const designNode = designTree.tree.nodes.get(nodeId);
      if (designNode?.type === 'text') {
        designTree.updateNode(nodeId, {
          textProperties: {
            ...designNode.textProperties,
            content: newContent,
          },
        });
      }
      setEditingTextNode(null);
    },
    [designTree]
  );

  // Handler to cancel text editing
  const handleCancelTextEdit = useCallback((): void => {
    setEditingTextNode(null);
  }, []);

  // Drawing state for tracking mouse interactions
  const [, setDrawingPreviewRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Handle mouse down on canvas for drawing
  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      // Only handle drawing in design mode with a drawing tool selected
      if (canvasMode !== 'design' || drawingTools.activeTool === 'select') return;

      // Don't start drawing if clicking on a node or control
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__controls')) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      drawingTools.startDrawing(position);
    },
    [canvasMode, drawingTools, screenToFlowPosition]
  );

  // Handle mouse move for drawing preview
  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent): void => {
      if (!drawingTools.isDrawing) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      drawingTools.updateDrawing(position);

      // Also update local preview rect for the overlay
      if (drawingTools.previewRect !== null) {
        setDrawingPreviewRect({
          x: drawingTools.previewRect.x,
          y: drawingTools.previewRect.y,
          width: drawingTools.previewRect.width,
          height: drawingTools.previewRect.height,
        });
      }
    },
    [drawingTools, screenToFlowPosition]
  );

  // Handle mouse up to finish drawing
  const handleCanvasMouseUp = useCallback((): void => {
    if (!drawingTools.isDrawing) return;

    const node = drawingTools.finishDrawing();
    setDrawingPreviewRect(null);

    // After creating a shape, revert to select tool
    if (node !== null) {
      drawingTools.setActiveTool('select');
    }
  }, [drawingTools]);

  // Handle keyboard shortcuts for tools
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Don't intercept if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;

      // Only handle tool shortcuts in design mode
      if (canvasMode !== 'design') return;

      const toolFromKey = drawingTools.toolShortcuts[event.key];
      if (toolFromKey !== undefined) {
        event.preventDefault();
        drawingTools.setActiveTool(toolFromKey);
      }

      // Escape to cancel drawing or switch to select
      if (event.key === 'Escape') {
        if (drawingTools.isDrawing) {
          drawingTools.cancelDrawing();
          setDrawingPreviewRect(null);
        } else {
          drawingTools.setActiveTool('select');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canvasMode, drawingTools]);

  // Convert design tree nodes to ReactFlow nodes for design mode view
  const designModeNodes = useMemo(() => {
    if (canvasMode === 'code') return []; // Only compute for design mode

    const rfNodes: Node[] = [];
    for (const [id, designNode] of designTree.tree.nodes) {
      // Only render root-level nodes (parentId === null)
      // Child nodes will be rendered by their parent's layout
      if (designNode.parentId === null) {
        rfNodes.push({
          id: `design-${id}`,
          type: 'design',
          position: { x: designNode.x, y: designNode.y },
          data: {
            designNode,
            onUpdate: handleDesignNodeUpdate,
            onStartEdit: handleStartTextEdit,
          },
          style: { width: designNode.width, height: designNode.height },
          draggable: !designNode.locked,
        });
      }
    }
    return rfNodes;
  }, [canvasMode, designTree.tree.nodes, handleDesignNodeUpdate, handleStartTextEdit]);

  // Compute nodes to render based on canvas mode
  const nodesToRender = useMemo(() => {
    if (canvasMode === 'design') {
      // Design mode: show design primitives from design tree
      return designModeNodes;
    }
    if (canvasMode === 'workflow') {
      // Workflow mode: handled by WorkflowCanvas component
      return [];
    }
    if (canvasMode === 'missions') {
      // Missions mode: handled by MissionsCanvas component
      return [];
    }
    // Code mode: show Sandpack nodes (current behavior)
    return nodes;
  }, [canvasMode, nodes, designModeNodes]);

  // Sync ReactFlow nodes to Design Tree - create DesignNodes for canvas components
  useEffect(() => {
    const currentNodeIds = new Set(nodes.map((n) => n.id));

    // Add new nodes to design tree
    for (const node of nodes) {
      // Check both our tracking ref AND the actual design tree to prevent duplicates
      if (!syncedNodeIdsRef.current.has(node.id) && !designTree.tree.nodes.has(node.id)) {
        const data = node.data as EsmSandpackNodeData | PageNodeData;
        const label: string =
          'label' in data && typeof data.label === 'string'
            ? data.label
            : 'name' in data && typeof data.name === 'string'
              ? data.name
              : '';

        // Create a component node in design tree with same ID
        // Get the code if this is a EsmSandpackNode
        const code: string = 'code' in data && typeof data.code === 'string' ? data.code : '';

        designTree.dispatch({
          type: 'ADD_NODE',
          node: {
            id: node.id, // Use same ID as ReactFlow node
            name: label,
            type: 'component',
            parentId: null,
            children: [],
            x: node.position.x,
            y: node.position.y,
            width: 300,
            height: 200,
            rotation: 0,
            constraints: { horizontal: 'left', vertical: 'top' },
            visible: true,
            locked: false,
            opacity: 1,
            expanded: true,
            fills: [],
            strokes: [],
            cornerRadius: 0,
            effects: { shadows: [] },
            clipContent: false,
            componentProps: {
              code,
              props: {},
            },
          },
        });
        syncedNodeIdsRef.current.add(node.id);
      }
    }

    // Remove deleted nodes from design tree
    for (const id of syncedNodeIdsRef.current) {
      if (!currentNodeIds.has(id)) {
        designTree.dispatch({ type: 'DELETE_NODES', nodeIds: [id] });
        syncedNodeIdsRef.current.delete(id);
      }
    }
  }, [nodes, designTree]);

  // Perception hook for AI visual inspection
  const { sendPerceptionRequest } = usePerception();

  // Sync layers with nodes when nodes change
  // DEPS: layerManagement.syncFromNodes is a stable useCallback with [] deps (see useLayerManagement.ts:633)
  // The layerManagement object itself changes on render, but we only use the stable syncFromNodes function.
  useEffect(() => {
    layerManagement.syncFromNodes(
      nodes.map((n) => {
        // Handle both EsmSandpackNode (label) and PageNode (name)
        const data = n.data as EsmSandpackNodeData | PageNodeData;
        const label: string =
          'label' in data && typeof data.label === 'string'
            ? data.label
            : 'name' in data && typeof data.name === 'string'
              ? data.name
              : '';
        return { id: n.id, data: { label } };
      })
    );
  }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps -- layerManagement.syncFromNodes is stable (see DEPS comment above)

  // Load persisted state on mount - initialization pattern
  // DEPS: All functions used (loadState, setNodes, setEdges, setViewport, setIsStateLoaded) are stable:
  // - loadState: imported module function (stable)
  // - setNodes/setEdges: ReactFlow state setters (stable by React guarantee)
  // - setViewport: ReactFlow instance method (stable)
  // - setIsStateLoaded: useState setter (stable by React guarantee)
  useEffect(() => {
    const persistedState = loadState();
    if (persistedState !== null) {
      // Restore nodes and edges
      if (persistedState.nodes.length > 0) {
        setNodes(persistedState.nodes);
      }
      if (persistedState.edges.length > 0) {
        setEdges(persistedState.edges);
      }
      // Restore viewport after a short delay to ensure React Flow is ready
      if (persistedState.viewport !== undefined) {
        const viewportToRestore = persistedState.viewport; // Capture for closure
        void setTimeout(() => {
          void setViewport(viewportToRestore);
        }, 100);
      }
    }
    setIsStateLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- all functions are stable (see DEPS comment above)

  // Save state when nodes or edges change (debounced)
  useEffect(() => {
    // Don't save until initial state is loaded (prevents overwriting persisted state)
    if (!isStateLoaded) return;

    const viewport = getViewport();
    saveState(nodes, edges, viewport);
  }, [nodes, edges, isStateLoaded, saveState, getViewport]);

  // Ref to hold the sendPerceptionResult function - avoids circular dependency
  // between useCanvasToolExecution (needs sendPerceptionResult) and useTauriCanvas (provides it)
  const sendPerceptionResultRef = useRef<
    (requestId: string, toolName: string, nodeId: string, result: PerceptionResult) => void
  >(() => {
    // sendPerceptionResult not yet initialized
  });

  // Ref to hold the sendMcpToolResponse function - avoids circular dependency
  const sendMcpToolResponseRef = useRef<
    (requestId: string, success: boolean, result?: unknown, error?: string) => void
  >(() => {
    // sendMcpToolResponse not yet initialized
  });

  // Canvas tool execution hook (old architecture - keeping for backwards compatibility)
  const { handleCanvasToolExecute } = useCanvasToolExecution({
    setNodes,
    setEdges,
    sendPerceptionRequest,
    sendPerceptionResult: (
      requestId: string,
      toolName: string,
      nodeId: string,
      result: unknown
    ) => {
      // Use ref to get latest function - breaks circular dependency
      sendPerceptionResultRef.current(requestId, toolName, nodeId, result as PerceptionResult);
    },
  });

  // MCP tool execution hook (new architecture with proper Claude SDK integration)
  const { handleMcpToolRequest } = useMcpToolExecution({
    nodes,
    edges,
    setNodes,
    setEdges,
    sendMcpToolResponse: (requestId, success, result, error) => {
      // Use ref to get latest function
      sendMcpToolResponseRef.current(requestId, success, result, error);
    },
    sendPerceptionRequest,
  });

  // Single useTauriCanvas call - handles all canvas tool execution messages from extension
  const messaging = useTauriCanvas({
    onCanvasToolExecute: handleCanvasToolExecute,
    onMcpToolRequest: handleMcpToolRequest,
    onCodeUpdate: (nodeId, code) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, code } } : n))
      );
    },
    onExportResult: (success, _filePath, error) => {
      if (!success) {
        logger.warn('Export failed', { error: error ?? 'Unknown error' });
      }
    },
  });

  // Update the refs with the actual functions after useTauriCanvas returns
  useEffect(() => {
    sendPerceptionResultRef.current = messaging.sendPerceptionResult;
  }, [messaging.sendPerceptionResult]);

  useEffect(() => {
    sendMcpToolResponseRef.current = messaging.sendMcpToolResponse;
  }, [messaging.sendMcpToolResponse]);

  // Canvas actions hook (must be before useEffect that uses selectedNodeId)
  const canvasActions = useCanvasActions({
    nodes,
    setNodes,
    setEdges,
    screenToFlowPosition,
    contextMenu,
    exportComponent: messaging.exportComponent,
  });

  // Sync selection: when design tree selection changes, select on canvas
  useEffect(() => {
    if (
      designTree.selection.focusedId &&
      syncedNodeIdsRef.current.has(designTree.selection.focusedId)
    ) {
      // Only update if it's different to avoid loops
      if (canvasActions.selectedNodeId !== designTree.selection.focusedId) {
        canvasActions.setSelectedNodeId(designTree.selection.focusedId);
      }
    }
  }, [designTree.selection.focusedId, canvasActions]);

  // Sync selection: when canvas selection changes, select in design tree
  useEffect(() => {
    if (canvasActions.selectedNodeId !== null) {
      if (designTree.selection.focusedId !== canvasActions.selectedNodeId) {
        designTree.selectNode(canvasActions.selectedNodeId);
      }
    } else {
      if (designTree.selection.nodeIds.length > 0) {
        designTree.clearSelection();
      }
    }
  }, [canvasActions.selectedNodeId, designTree]);

  // Sync canvas state to extension whenever nodes, edges, or selection changes
  // This ensures the agent has up-to-date context including which node is selected
  // Debounced to prevent rapid-fire updates from ResizeObserver/React Flow
  const lastCanvasStateRef = useRef<string>('');
  useEffect(() => {
    if (!isStateLoaded) return;

    // Determine selected node type
    const selectedNode = nodes.find((n) => n.id === canvasActions.selectedNodeId);
    const selectedNodeType = selectedNode?.type === 'page' ? 'page' : 'sandpack';

    // Create a fingerprint to detect actual changes (ignore position updates)
    const fingerprint = JSON.stringify({
      nodeIds: nodes.map((n) => n.id).sort(),
      edgeIds: edges.map((e) => e.id).sort(),
      selectedNodeId: canvasActions.selectedNodeId,
    });

    // Only send if state actually changed
    if (fingerprint === lastCanvasStateRef.current) {
      return;
    }
    lastCanvasStateRef.current = fingerprint;

    messaging.sendCanvasState(
      nodes,
      edges,
      canvasActions.selectedNodeId ?? undefined,
      canvasActions.selectedNodeId ? selectedNodeType : undefined
    );
  }, [nodes, edges, canvasActions.selectedNodeId, isStateLoaded, messaging]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  // Get the currently selected node for the properties panel
  const selectedNode = nodes.find((n) => n.id === canvasActions.selectedNodeId) ?? null;

  // Double-click to open component menu
  const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
    setMenuPosition({ x: event.clientX, y: event.clientY });
    setShowComponentMenu(true);
  }, []);

  // Right-click context menu
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      nodeId: node.id,
    });
  }, []);

  // Handle drag and drop from component menu
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const componentType = event.dataTransfer.getData('application/reactflow');
      if (!componentType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      canvasActions.handleAddNode(componentType, position);
    },
    [screenToFlowPosition, canvasActions]
  );

  // Context menu items
  const contextMenuItems: ContextMenuItem[] = [
    {
      label: 'Duplicate',
      icon: <DuplicateIcon />,
      shortcut: `${modKey}+D`,
      action: canvasActions.handleDuplicateSelected,
    },
    {
      label: 'Copy',
      icon: <CopyIcon />,
      shortcut: `${modKey}+C`,
      action: canvasActions.handleCopySelected,
    },
    {
      label: 'Export to File',
      icon: <ExportIcon />,
      shortcut: `${modKey}+E`,
      action: canvasActions.handleExportSelected,
    },
    {
      label: '',
      action: () => {
        /* divider item */
      },
      divider: true,
    },
    {
      label: 'Delete',
      icon: <TrashIcon />,
      shortcut: 'Del',
      action: canvasActions.handleDeleteSelected,
    },
  ];

  // Command palette commands
  const commands = createCommands({
    handleAddNode: canvasActions.handleAddNode,
    handleAddPage: canvasActions.handleAddPage,
    handleDuplicateSelected: canvasActions.handleDuplicateSelected,
    handleDeleteSelected: canvasActions.handleDeleteSelected,
    handleCopySelected: canvasActions.handleCopySelected,
    handlePaste: canvasActions.handlePaste,
    handleExportSelected: canvasActions.handleExportSelected,
    setNodes,
    setShowComponentMenu,
    setMenuPosition,
    setShowShortcutsHelp,
  });

  // Keyboard shortcuts hook
  useCanvasShortcuts({
    setShowComponentMenu,
    setShowCommandPalette,
    setShowShortcutsHelp,
    setContextMenu,
    setNodes,
    handleDeleteSelected: canvasActions.handleDeleteSelected,
    handleDuplicateSelected: canvasActions.handleDuplicateSelected,
    handleCopySelected: canvasActions.handleCopySelected,
    handlePaste: canvasActions.handlePaste,
    handleExportSelected: canvasActions.handleExportSelected,
  });

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Canvas Area - Full size, sidebars overlay on top */}
      <div
        ref={reactFlowWrapper}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          backgroundColor: 'var(--background)',
          cursor: canvasMode === 'design' ? drawingTools.cursorStyle : 'default',
        }}
      >
        {/* Workflow Mode Canvas */}
        {canvasMode === 'workflow' ? (
          <WorkflowCanvas
            onCardSelect={(cardId) => {
              if (cardId !== null) {
                canvasActions.setSelectedNodeId(cardId);
              } else {
                canvasActions.setSelectedNodeId(null);
              }
            }}
          />
        ) : canvasMode === 'missions' ? (
          /* Missions Mode Canvas */
          <MissionsCanvas
            onAgentSelect={(agentId: string | null): void => {
              if (agentId !== null) {
                canvasActions.setSelectedNodeId(agentId);
              } else {
                canvasActions.setSelectedNodeId(null);
              }
            }}
          />
        ) : (
          <ReactFlow
            nodes={nodesToRender}
            edges={canvasMode === 'design' ? [] : edges}
            nodeTypes={nodeTypes}
            {...(canvasMode === 'code' && { onNodesChange })}
            {...(canvasMode === 'code' && { onEdgesChange })}
            {...(canvasMode === 'code' && { onConnect })}
            onNodeClick={canvasActions.handleNodeClick}
            onPaneClick={(): void => {
              setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
              canvasActions.setSelectedNodeId(null);
            }}
            onDoubleClick={handlePaneDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            deleteKeyCode={null}
            // Design mode optimizations
            // Only enable selection drag when using select tool, not drawing tools
            selectionOnDrag={canvasMode === 'design' && drawingTools.activeTool === 'select'}
            panOnScroll={canvasMode === 'design'}
            // Disable pan on drag when drawing tool is active
            panOnDrag={
              canvasMode === 'design'
                ? drawingTools.activeTool === 'select'
                  ? [1, 2]
                  : false
                : true
            }
            selectionMode={canvasMode === 'design' ? SelectionMode.Partial : SelectionMode.Full}
            snapToGrid={canvasMode === 'design'}
            snapGrid={[10, 10]}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="transparent" />
            <Controls
              style={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
                left: isSidebarCollapsed ? 8 : leftSidebarVisualWidth + 16,
                transition: 'left 280ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
            <MiniMap
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
              maskColor="rgba(0, 0, 0, 0.6)"
              nodeColor="var(--muted-foreground)"
            />

            {/* Floating Toolbar for Code/Design modes */}
            <CanvasFloatingToolbar
              onAddComponent={(): void => {
                setMenuPosition({
                  x: window.innerWidth / 2 - 160,
                  y: window.innerHeight / 2 - 100,
                });
                setShowComponentMenu(true);
              }}
            />
          </ReactFlow>
        )}

        {/* Drawing Interaction Overlay - Captures mouse events when drawing tool is active */}
        {canvasMode === 'design' && drawingTools.activeTool !== 'select' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              cursor: drawingTools.cursorStyle,
              zIndex: 10,
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />
        )}

        {/* Drawing Tools Panel - Design Mode Only */}
        {canvasMode === 'design' && (
          <DrawingToolsPanel
            activeTool={drawingTools.activeTool}
            onToolChange={drawingTools.setActiveTool}
            isSidebarCollapsed={isSidebarCollapsed}
            sidebarVisualWidth={leftSidebarVisualWidth}
          />
        )}

        {/* Drawing Preview Overlay - Shows shape being drawn */}
        {canvasMode === 'design' && drawingTools.previewRect ? (
          <DrawingPreview
            rect={drawingTools.previewRect}
            tool={drawingTools.activeTool}
            viewport={getViewport()}
          />
        ) : null}

        {/* Smart Guides Overlay - Alignment guides during drag */}
        {canvasMode === 'design' && activeGuides.length > 0 && (
          <SmartGuidesOverlay guides={activeGuides} viewport={getViewport()} />
        )}

        {/* Inline Text Editor - Direct text editing overlay */}
        {editingTextNode ? (
          <InlineTextEditor
            node={editingTextNode}
            viewport={getViewport()}
            onSave={handleSaveTextEdit}
            onCancel={handleCancelTextEdit}
          />
        ) : null}

        {/* Component Menu */}
        {showComponentMenu ? (
          <ComponentMenu
            position={menuPosition}
            onSelect={(type): void => {
              canvasActions.handleAddNode(type, screenToFlowPosition(menuPosition));
            }}
            onClose={(): void => {
              setShowComponentMenu(false);
            }}
          />
        ) : null}

        {/* Context Menu */}
        <ContextMenu
          menuState={contextMenu}
          items={contextMenuItems}
          onClose={(): void => {
            setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
          }}
        />

        {/* Agent Chat Panel */}
        <AgentChatPanel initialState="minimized" hideWhenMinimized />
      </div>

      {/* Left Sidebar - Floating overlay */}
      {canvasMode === 'workflow' ? (
        <WorkflowSidebar
          activeWorkflowId={activeWorkflow?.id ?? null}
          onWorkflowSelect={handleWorkflowSelect}
          onWorkflowCreate={handleWorkflowCreate}
          onWorkflowDelete={handleWorkflowDelete}
          onRefresh={handleWorkflowRefresh}
        />
      ) : canvasMode === 'missions' ? null /* MissionsCanvas renders its own sidebars */ : (
        <DesignLeftSidebar
          tree={designTree.tree}
          selection={designTree.selection}
          onSelectNode={(nodeId, addToSelection): void => {
            designTree.selectNode(nodeId, addToSelection);
          }}
          onClearSelection={designTree.clearSelection}
          onToggleVisibility={(nodeId): void => {
            designTree.dispatch({ type: 'TOGGLE_VISIBILITY', nodeId });
          }}
          onToggleLock={(nodeId): void => {
            designTree.dispatch({ type: 'TOGGLE_LOCK', nodeId });
          }}
          onToggleExpand={(nodeId): void => {
            designTree.dispatch({ type: 'TOGGLE_EXPAND', nodeId });
          }}
          onRename={(nodeId, newName): void => {
            designTree.updateNode(nodeId, { name: newName });
          }}
          onDelete={(nodeIds): void => {
            designTree.dispatch({ type: 'DELETE_NODES', nodeIds });
          }}
          onDuplicate={(nodeIds): void => {
            designTree.dispatch({ type: 'DUPLICATE_NODES', nodeIds });
          }}
          onMove={(nodeId, newParentId, index): void => {
            designTree.dispatch({ type: 'MOVE_NODE', nodeId, newParentId, index });
          }}
          onGroup={(nodeIds, name): void => {
            if (name !== undefined) {
              designTree.dispatch({ type: 'GROUP_NODES', nodeIds, groupName: name });
            } else {
              designTree.dispatch({ type: 'GROUP_NODES', nodeIds });
            }
          }}
          onUngroup={(nodeId): void => {
            designTree.dispatch({ type: 'UNGROUP_NODE', nodeId });
          }}
          onBringToFront={(nodeId): void => {
            designTree.dispatch({ type: 'BRING_TO_FRONT', nodeId });
          }}
          onSendToBack={(nodeId): void => {
            designTree.dispatch({ type: 'SEND_TO_BACK', nodeId });
          }}
          onAddFrame={(): void => {
            const frame = designTree.addFrame('New Frame');
            designTree.selectNode(frame.id);
          }}
          onAddComponent={(component: ComponentTemplate): void => {
            designTree.addComponent(component.name, component.code);
            canvasActions.handleAddLibraryComponent(component);
          }}
        />
      )}

      {/* Right Sidebar - Floating overlay */}
      {canvasMode === 'workflow' ? (
        <WorkflowRightSidebar selectedCardId={canvasActions.selectedNodeId} />
      ) : canvasMode === 'missions' ? null /* MissionsCanvas renders its own sidebars */ : (
        <RightSidebar
          selectedNode={selectedNode}
          nodes={nodes}
          edges={edges}
          onUpdateNode={canvasActions.handleUpdateNode}
          onSelectNode={canvasActions.handleSelectNodeFromPreview}
        />
      )}

      {/* Floating Toolbar - Absolute positioned overlay */}
      <CanvasToolbar
        onAddComponent={(): void => {
          setMenuPosition({ x: window.innerWidth / 2 - 160, y: 100 });
          setShowComponentMenu(true);
        }}
        canUndo={designTree.canUndo}
        canRedo={designTree.canRedo}
        onUndo={designTree.undo}
        onRedo={designTree.redo}
        canvasMode={canvasMode}
        onCanvasModeChange={setCanvasMode}
        isSidebarCollapsed={
          canvasMode === 'missions' ? missionsLeftSidebarCollapsed : isSidebarCollapsed
        }
        onToggleSidebar={canvasMode === 'missions' ? missionsToggleLeftSidebar : toggleLeftSidebar}
        isRightSidebarCollapsed={
          canvasMode === 'missions' ? missionsRightSidebarCollapsed : isRightSidebarCollapsed
        }
        onToggleRightSidebar={
          canvasMode === 'missions' ? missionsToggleRightSidebar : toggleRightSidebar
        }
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={(): void => {
          setShowCommandPalette(false);
        }}
        commands={commands}
      />

      {/* Shortcuts Help Modal */}
      <ShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={(): void => {
          setShowShortcutsHelp(false);
        }}
      />
    </div>
  );
}

// Wrap with ReactFlowProvider
export function CanvasApp(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasAppInner />
    </ReactFlowProvider>
  );
}
