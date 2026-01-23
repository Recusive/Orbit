/**
 * Hook for canvas node operations
 * Handles CRUD, copy/paste, export, and selection operations
 */
import { useCallback, useState } from 'react';

import { createSandpackNodeData, generateNodeId, createPageNode } from '../../config/initialState';

import type { ComponentTemplate } from '../../lib/components/componentLibrary';
import type { SandpackNodeData } from '../../sandpack/SandpackNode';
import type { Node, Edge } from '@xyflow/react';

// Type guard for nodes with SandpackNodeData
function hasSandpackData(node: Node): node is Node & { data: SandpackNodeData } {
  const data = node.data;
  return typeof data['code'] === 'string' && typeof data['label'] === 'string';
}

export interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  nodeId?: string;
}

export interface UseCanvasActionsOptions {
  nodes: Node[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  contextMenu: ContextMenuState;
  exportComponent: (nodeId: string, code: string, filename: string) => void;
}

export interface CanvasActions {
  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Clipboard
  clipboard: Node[];

  // Node operations
  handleAddNode: (componentType: string, position?: { x: number; y: number }) => void;
  handleAddPage: (name?: string) => void;
  handleAddLibraryComponent: (component: ComponentTemplate) => void;
  handleDeleteSelected: () => void;
  handleDuplicateSelected: () => void;
  handleCopySelected: () => void;
  handlePaste: () => void;
  handleExportSelected: () => void;
  handleUpdateNode: (nodeId: string, updates: Partial<Node['data']>) => void;
  handleNodeClick: (event: React.MouseEvent, node: Node) => void;
  handleSelectNodeFromPreview: (nodeId: string) => void;
}

export function useCanvasActions({
  nodes,
  setNodes,
  setEdges,
  screenToFlowPosition,
  contextMenu,
  exportComponent,
}: UseCanvasActionsOptions): CanvasActions {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<Node[]>([]);

  // Add new node at position (code-first: always creates SandpackNode with template)
  const handleAddNode = useCallback(
    (componentType: string, position?: { x: number; y: number }): void => {
      const flowPosition =
        position ??
        screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      const newNode: Node = {
        id: generateNodeId(componentType),
        type: 'sandpack',
        position: flowPosition,
        data: createSandpackNodeData(componentType),
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  // Add new page node for composition
  const handleAddPage = useCallback(
    (name?: string): void => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const pageNode = createPageNode(position, name);
      setNodes((nds) => [...nds, pageNode]);
      setSelectedNodeId(pageNode.id);
    },
    [screenToFlowPosition, setNodes]
  );

  // Add component from library (shadcn/ui style components)
  const handleAddLibraryComponent = useCallback(
    (component: ComponentTemplate): void => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const newNode: Node = {
        id: generateNodeId(component.id),
        type: 'sandpack',
        position,
        data: {
          label: component.name,
          code: component.code,
          viewport: 'desktop',
          showCode: false,
        } as SandpackNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  // Delete selected nodes
  const handleDeleteSelected = useCallback((): void => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    // If context menu has a node, delete that specific node
    if (contextMenu.nodeId) {
      selectedIds.add(contextMenu.nodeId);
    }

    if (selectedIds.size === 0) return;

    setNodes((nds) => nds.filter((n) => !selectedIds.has(n.id)));
    setEdges((eds) => eds.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
  }, [nodes, contextMenu.nodeId, setNodes, setEdges]);

  // Duplicate selected nodes
  const handleDuplicateSelected = useCallback((): void => {
    const selectedNodes = nodes.filter((n) => (n.selected ?? false) || n.id === contextMenu.nodeId);
    if (selectedNodes.length === 0) return;

    const newNodes = selectedNodes.map((node) => ({
      ...node,
      id: generateNodeId(node.type ?? 'node'),
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50,
      },
      selected: true,
    }));

    // Deselect original nodes
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  }, [nodes, contextMenu.nodeId, setNodes]);

  // Copy selected nodes to clipboard
  const handleCopySelected = useCallback((): void => {
    const selectedNodes = nodes.filter((n) => (n.selected ?? false) || n.id === contextMenu.nodeId);
    if (selectedNodes.length > 0) {
      setClipboard(selectedNodes);
    }
  }, [nodes, contextMenu.nodeId]);

  // Paste from clipboard
  const handlePaste = useCallback((): void => {
    if (clipboard.length === 0) return;

    const newNodes = clipboard.map((node) => ({
      ...node,
      id: generateNodeId(node.type ?? 'node'),
      position: {
        x: node.position.x + 100,
        y: node.position.y + 100,
      },
      selected: true,
    }));

    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  }, [clipboard, setNodes]);

  // Export selected node to file
  const handleExportSelected = useCallback((): void => {
    const nodeToExport = contextMenu.nodeId
      ? nodes.find((n) => n.id === contextMenu.nodeId)
      : nodes.find((n) => n.selected);

    if (!nodeToExport || !hasSandpackData(nodeToExport)) return;

    const code = nodeToExport.data.code;
    const label = nodeToExport.data.label;

    const filename = label.replace(/[^a-zA-Z0-9]/g, '') + '.tsx';
    exportComponent(nodeToExport.id, code, filename);
  }, [nodes, contextMenu.nodeId, exportComponent]);

  // Update node data (for properties panel)
  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<Node['data']>): void => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n))
      );
    },
    [setNodes]
  );

  // Handle node click for selection
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node): void => {
    setSelectedNodeId(node.id);
  }, []);

  // Handle click-to-select from preview panel
  const handleSelectNodeFromPreview = useCallback(
    (nodeId: string): void => {
      setSelectedNodeId(nodeId);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
    },
    [setNodes]
  );

  return {
    selectedNodeId,
    setSelectedNodeId,
    clipboard,
    handleAddNode,
    handleAddPage,
    handleAddLibraryComponent,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleCopySelected,
    handlePaste,
    handleExportSelected,
    handleUpdateNode,
    handleNodeClick,
    handleSelectNodeFromPreview,
  };
}
