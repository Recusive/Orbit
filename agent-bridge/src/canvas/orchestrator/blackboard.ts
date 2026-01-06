/*---------------------------------------------------------------------------------------------
 *  Blackboard - Shared state with context slicing
 *
 *  The Blackboard is the shared memory for all agents during orchestration.
 *  It provides:
 *  - Current canvas state (nodes, edges, design tree)
 *  - Pending uncommitted changes from running tasks
 *  - Context slicing: each agent gets only relevant data to reduce token usage
 *  - Sibling output sharing for coordination
 *--------------------------------------------------------------------------------------------*/

import { createLogger } from '../../common/logging/logger.js';

import type {
  BlackboardSlice,
  CanvasChange,
  CanvasSnapshot,
  Constraint,
  NodeSnapshot,
  TaskOutput,
} from './types.js';

const logger = createLogger('Blackboard');

/**
 * Options for getting a context slice
 */
export interface SliceOptions {
  /** Include ancestor nodes */
  includeAncestors?: boolean;
  /** Include descendant nodes */
  includeDescendants?: boolean;
  /** Include sibling nodes (same parent) */
  includeSiblings?: boolean;
  /** Include connected nodes via edges */
  includeConnected?: boolean;
  /** Maximum depth for descendants */
  maxDepth?: number;
}

const DEFAULT_SLICE_OPTIONS: SliceOptions = {
  includeAncestors: true,
  includeDescendants: true,
  includeSiblings: false,
  includeConnected: true,
  maxDepth: 3,
};

/**
 * Blackboard - Shared context for multi-agent orchestration
 */
export class Blackboard {
  /** Current canvas state snapshot */
  private canvasState: CanvasSnapshot | null = null;

  /** Pending changes from running tasks (not yet committed) */
  private pendingChanges = new Map<string, CanvasChange[]>();

  /** Node ownership: nodeId -> taskId */
  private nodeOwnership = new Map<string, string>();

  /** Completed task outputs for sibling coordination */
  private taskOutputs = new Map<string, TaskOutput>();

  /** User and system constraints */
  private constraints: Constraint[] = [];

  /** Parent-child relationships */
  private parentMap = new Map<string, string>();
  private childrenMap = new Map<string, string[]>();

  constructor() {
    logger.info('Blackboard initialized');
  }

  /**
   * Update the canvas state snapshot
   */
  setCanvasState(state: CanvasSnapshot): void {
    this.canvasState = state;
    this.buildHierarchy(state.nodes);
    logger.debug({ nodeCount: state.nodes.length }, 'Canvas state updated');
  }

  /**
   * Get the current canvas state
   */
  getCanvasState(): CanvasSnapshot | null {
    return this.canvasState;
  }

  /**
   * Get a context slice for a specific set of nodes
   * This is what gets passed to agents to reduce token usage
   */
  getSlice(nodeIds: string[], options: SliceOptions = {}): BlackboardSlice {
    const opts = { ...DEFAULT_SLICE_OPTIONS, ...options };

    if (!this.canvasState) {
      return {
        relevantNodes: [],
        relevantEdges: [],
        constraints: [],
        siblingOutputs: new Map(),
      };
    }

    // Start with the requested nodes
    const relevantNodeIds = new Set<string>(nodeIds);

    // Add ancestors
    if (opts.includeAncestors) {
      for (const nodeId of nodeIds) {
        this.addAncestors(nodeId, relevantNodeIds);
      }
    }

    // Add descendants
    if (opts.includeDescendants === true) {
      for (const nodeId of nodeIds) {
        this.addDescendants(nodeId, relevantNodeIds, opts.maxDepth ?? 3);
      }
    }

    // Add siblings
    if (opts.includeSiblings) {
      for (const nodeId of nodeIds) {
        this.addSiblings(nodeId, relevantNodeIds);
      }
    }

    // Add connected nodes via edges
    if (opts.includeConnected) {
      this.addConnectedNodes(nodeIds, relevantNodeIds);
    }

    // Filter nodes
    const relevantNodes = this.canvasState.nodes.filter((n) => relevantNodeIds.has(n.id));

    // Filter edges (both endpoints must be in relevant nodes)
    const relevantEdges = this.canvasState.edges.filter(
      (e) => relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target)
    );

    // Get relevant constraints
    // TODO: Filter based on node relevance - for now, include all
    const relevantConstraints = [...this.constraints];

    // Get sibling task outputs (for coordination)
    const siblingOutputs = new Map<string, TaskOutput>();
    for (const [taskId, output] of this.taskOutputs) {
      // Include outputs that created/modified nodes we care about
      if (output.nodeIds?.some((id) => relevantNodeIds.has(id))) {
        siblingOutputs.set(taskId, output);
      }
    }

    logger.debug(
      {
        requestedNodes: nodeIds.length,
        resultNodes: relevantNodes.length,
        resultEdges: relevantEdges.length,
      },
      'Created context slice'
    );

    return {
      relevantNodes,
      relevantEdges,
      constraints: relevantConstraints,
      siblingOutputs,
    };
  }

  /**
   * Get a slice for all nodes (full context)
   */
  getFullSlice(): BlackboardSlice {
    if (!this.canvasState) {
      return {
        relevantNodes: [],
        relevantEdges: [],
        constraints: [],
        siblingOutputs: new Map(),
      };
    }

    return {
      relevantNodes: [...this.canvasState.nodes],
      relevantEdges: [...this.canvasState.edges],
      constraints: [...this.constraints],
      siblingOutputs: new Map(this.taskOutputs),
    };
  }

  /**
   * Add pending changes from a task (not yet committed)
   */
  addPendingChanges(taskId: string, changes: CanvasChange[]): void {
    const existing = this.pendingChanges.get(taskId) ?? [];
    this.pendingChanges.set(taskId, [...existing, ...changes]);

    // Track node ownership for new nodes
    for (const change of changes) {
      if (change.type === 'create') {
        this.nodeOwnership.set(change.nodeId, taskId);
      }
    }

    logger.debug({ taskId, changeCount: changes.length }, 'Added pending changes');
  }

  /**
   * Get pending changes for a task
   */
  getPendingChanges(taskId: string): CanvasChange[] {
    return this.pendingChanges.get(taskId) ?? [];
  }

  /**
   * Get all pending changes
   */
  getAllPendingChanges(): Map<string, CanvasChange[]> {
    return new Map(this.pendingChanges);
  }

  /**
   * Commit pending changes for a task (apply to canvas state)
   */
  commitChanges(taskId: string): CanvasChange[] {
    const changes = this.pendingChanges.get(taskId);
    if (!changes) {
      return [];
    }

    // Apply changes to canvas state
    if (this.canvasState) {
      this.applyChangesToState(changes);
    }

    // Remove from pending
    this.pendingChanges.delete(taskId);

    logger.info({ taskId, changeCount: changes.length }, 'Committed changes');

    return changes;
  }

  /**
   * Discard pending changes for a task
   */
  discardChanges(taskId: string): void {
    const changes = this.pendingChanges.get(taskId);
    if (changes) {
      // Remove node ownership for discarded creates
      for (const change of changes) {
        if (change.type === 'create') {
          this.nodeOwnership.delete(change.nodeId);
        }
      }
      this.pendingChanges.delete(taskId);
      logger.info({ taskId }, 'Discarded pending changes');
    }
  }

  /**
   * Record task output for sibling coordination
   */
  setTaskOutput(taskId: string, output: TaskOutput): void {
    this.taskOutputs.set(taskId, output);
    logger.debug({ taskId, success: output.success }, 'Recorded task output');
  }

  /**
   * Get task output
   */
  getTaskOutput(taskId: string): TaskOutput | undefined {
    return this.taskOutputs.get(taskId);
  }

  /**
   * Get node owner (which task owns/created a node)
   */
  getNodeOwner(nodeId: string): string | undefined {
    return this.nodeOwnership.get(nodeId);
  }

  /**
   * Check if a node is owned by a task
   */
  isOwnedBy(nodeId: string, taskId: string): boolean {
    return this.nodeOwnership.get(nodeId) === taskId;
  }

  /**
   * Add a constraint
   */
  addConstraint(constraint: Constraint): void {
    this.constraints.push(constraint);
    logger.debug({ type: constraint.type, source: constraint.source }, 'Added constraint');
  }

  /**
   * Get all constraints
   */
  getConstraints(): Constraint[] {
    return [...this.constraints];
  }

  /**
   * Get constraints for a specific type
   */
  getConstraintsByType(type: Constraint['type']): Constraint[] {
    return this.constraints.filter((c) => c.type === type);
  }

  /**
   * Clear constraints from a specific source
   */
  clearConstraints(source: Constraint['source']): void {
    this.constraints = this.constraints.filter((c) => c.source !== source);
  }

  /**
   * Reset the blackboard (new orchestration run)
   */
  reset(): void {
    this.canvasState = null;
    this.pendingChanges.clear();
    this.nodeOwnership.clear();
    this.taskOutputs.clear();
    this.constraints = [];
    this.parentMap.clear();
    this.childrenMap.clear();
    logger.info('Blackboard reset');
  }

  /**
   * Build parent-child hierarchy from nodes
   */
  private buildHierarchy(nodes: NodeSnapshot[]): void {
    this.parentMap.clear();
    this.childrenMap.clear();

    for (const node of nodes) {
      const parentId = node.data.parentId as string | undefined;
      if (parentId) {
        this.parentMap.set(node.id, parentId);
        const children = this.childrenMap.get(parentId) ?? [];
        children.push(node.id);
        this.childrenMap.set(parentId, children);
      }
    }
  }

  /**
   * Add ancestor nodes to the set
   */
  private addAncestors(nodeId: string, nodeSet: Set<string>): void {
    let currentId: string | undefined = this.parentMap.get(nodeId);
    while (currentId) {
      nodeSet.add(currentId);
      currentId = this.parentMap.get(currentId);
    }
  }

  /**
   * Add descendant nodes to the set
   */
  private addDescendants(nodeId: string, nodeSet: Set<string>, maxDepth: number, depth = 0): void {
    if (depth >= maxDepth) {
      return;
    }

    const children = this.childrenMap.get(nodeId) ?? [];
    for (const childId of children) {
      nodeSet.add(childId);
      this.addDescendants(childId, nodeSet, maxDepth, depth + 1);
    }
  }

  /**
   * Add sibling nodes to the set
   */
  private addSiblings(nodeId: string, nodeSet: Set<string>): void {
    const parentId = this.parentMap.get(nodeId);
    if (parentId) {
      const siblings = this.childrenMap.get(parentId) ?? [];
      for (const siblingId of siblings) {
        nodeSet.add(siblingId);
      }
    }
  }

  /**
   * Add nodes connected via edges
   */
  private addConnectedNodes(nodeIds: string[], nodeSet: Set<string>): void {
    if (!this.canvasState) {
      return;
    }

    const nodeIdSet = new Set(nodeIds);

    for (const edge of this.canvasState.edges) {
      if (nodeIdSet.has(edge.source)) {
        nodeSet.add(edge.target);
      }
      if (nodeIdSet.has(edge.target)) {
        nodeSet.add(edge.source);
      }
    }
  }

  /**
   * Apply changes to the internal canvas state
   */
  private applyChangesToState(changes: CanvasChange[]): void {
    if (!this.canvasState) {
      return;
    }

    for (const change of changes) {
      switch (change.type) {
        case 'create': {
          // Add new node
          const newNode: NodeSnapshot = {
            id: change.nodeId,
            type: 'sandpack', // Default type
            position: { x: 0, y: 0 },
            data: (change.after as Record<string, unknown> | undefined) ?? {},
          };
          this.canvasState.nodes.push(newNode);
          break;
        }

        case 'update': {
          const node = this.canvasState.nodes.find((n) => n.id === change.nodeId);
          if (node && change.property) {
            node.data[change.property] = change.after;
          }
          break;
        }

        case 'delete': {
          this.canvasState.nodes = this.canvasState.nodes.filter((n) => n.id !== change.nodeId);
          this.canvasState.edges = this.canvasState.edges.filter(
            (e) => e.source !== change.nodeId && e.target !== change.nodeId
          );
          break;
        }

        case 'move': {
          const moveNode = this.canvasState.nodes.find((n) => n.id === change.nodeId);
          if (moveNode !== undefined && change.after !== undefined) {
            const pos = change.after as { x: number; y: number };
            moveNode.position = pos;
          }
          break;
        }

        case 'style': {
          const styleNode = this.canvasState.nodes.find((n) => n.id === change.nodeId);
          if (styleNode !== undefined && change.property !== undefined) {
            const style = (styleNode.data.style as Record<string, unknown> | undefined) ?? {};
            style[change.property] = change.after;
            styleNode.data.style = style;
          }
          break;
        }
      }
    }

    // Rebuild hierarchy after changes
    this.buildHierarchy(this.canvasState.nodes);
  }
}

/**
 * Singleton instance
 */
let blackboardInstance: Blackboard | null = null;

/**
 * Get or create the Blackboard singleton
 */
export function getBlackboard(): Blackboard {
  blackboardInstance ??= new Blackboard();
  return blackboardInstance;
}

/**
 * Create a fresh Blackboard (for testing or isolation)
 */
export function createBlackboard(): Blackboard {
  return new Blackboard();
}
