/*---------------------------------------------------------------------------------------------
 *  NodeLockManager - Node-based locking for parallel execution safety
 *
 *  Provides tree-based locking where:
 *  - Write locks are exclusive (only one agent can write to a node)
 *  - Read locks are shared (multiple agents can read)
 *  - Locks can include children (entire subtree)
 *--------------------------------------------------------------------------------------------*/

import { createLogger } from '../../logger.js';

import type { NodeLock } from './types.js';

const logger = createLogger('NodeLockManager');

/**
 * Lock request result
 */
export interface LockResult {
  success: boolean;
  lock?: NodeLock;
  conflictingLock?: NodeLock;
  reason?: string;
}

/**
 * Lock request options
 */
export interface LockRequest {
  nodeId: string;
  agentId: string;
  taskId: string;
  type: 'read' | 'write';
  includesChildren?: boolean;
  /** Lock timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Node hierarchy for child lock checking
 */
export interface NodeHierarchy {
  nodeId: string;
  parentId?: string;
  childIds: string[];
}

/**
 * NodeLockManager - Manages exclusive and shared locks on canvas nodes
 */
export class NodeLockManager {
  private locks = new Map<string, NodeLock[]>();
  private nodeHierarchy = new Map<string, NodeHierarchy>();

  private readonly defaultTimeout: number;

  constructor(defaultTimeout = 30000) {
    this.defaultTimeout = defaultTimeout;
    logger.info({ defaultTimeout }, 'NodeLockManager initialized');
  }

  /**
   * Attempt to acquire a lock on a node
   */
  acquireLock(request: LockRequest): LockResult {
    const {
      nodeId,
      agentId,
      taskId,
      type,
      includesChildren = false,
      timeout = this.defaultTimeout,
    } = request;

    logger.debug({ nodeId, agentId, taskId, type, includesChildren }, 'Lock request');

    // Clean expired locks first
    this.cleanupExpiredLocks();

    // Check for conflicts
    const conflict = this.findConflict(nodeId, agentId, type, includesChildren);
    if (conflict) {
      logger.warn(
        { nodeId, conflictingAgent: conflict.agentId, conflictingTask: conflict.taskId },
        'Lock conflict detected'
      );
      return {
        success: false,
        conflictingLock: conflict,
        reason: `Node ${nodeId} is locked by ${conflict.agentId} (task: ${conflict.taskId})`,
      };
    }

    // Create the lock
    const now = Date.now();
    const lock: NodeLock = {
      nodeId,
      agentId,
      taskId,
      type,
      includesChildren,
      acquiredAt: now,
      expiresAt: now + timeout,
    };

    // Add to locks map
    const nodeLocks = this.locks.get(nodeId) ?? [];
    nodeLocks.push(lock);
    this.locks.set(nodeId, nodeLocks);

    logger.info({ nodeId, agentId, taskId, type }, 'Lock acquired');

    return { success: true, lock };
  }

  /**
   * Release a specific lock
   */
  releaseLock(taskId: string, nodeId: string): boolean {
    const nodeLocks = this.locks.get(nodeId);
    if (!nodeLocks) {
      return false;
    }

    const initialLength = nodeLocks.length;
    const filtered = nodeLocks.filter((lock) => lock.taskId !== taskId);

    if (filtered.length === initialLength) {
      return false; // No lock was removed
    }

    if (filtered.length === 0) {
      this.locks.delete(nodeId);
    } else {
      this.locks.set(nodeId, filtered);
    }

    logger.info({ nodeId, taskId }, 'Lock released');
    return true;
  }

  /**
   * Release all locks held by a task
   */
  releaseAllLocks(taskId: string): number {
    let released = 0;

    for (const [nodeId, nodeLocks] of this.locks.entries()) {
      const filtered = nodeLocks.filter((lock) => lock.taskId !== taskId);
      if (filtered.length < nodeLocks.length) {
        released += nodeLocks.length - filtered.length;
        if (filtered.length === 0) {
          this.locks.delete(nodeId);
        } else {
          this.locks.set(nodeId, filtered);
        }
      }
    }

    if (released > 0) {
      logger.info({ taskId, released }, 'Released all locks for task');
    }

    return released;
  }

  /**
   * Release all locks held by an agent
   */
  releaseAllForAgent(agentId: string): number {
    let released = 0;

    for (const [nodeId, nodeLocks] of this.locks.entries()) {
      const filtered = nodeLocks.filter((lock) => lock.agentId !== agentId);
      if (filtered.length < nodeLocks.length) {
        released += nodeLocks.length - filtered.length;
        if (filtered.length === 0) {
          this.locks.delete(nodeId);
        } else {
          this.locks.set(nodeId, filtered);
        }
      }
    }

    if (released > 0) {
      logger.info({ agentId, released }, 'Released all locks for agent');
    }

    return released;
  }

  /**
   * Check if a task has a lock on a node
   */
  hasLock(taskId: string, nodeId: string): boolean {
    const nodeLocks = this.locks.get(nodeId);
    if (!nodeLocks) {
      return false;
    }
    return nodeLocks.some((lock) => lock.taskId === taskId);
  }

  /**
   * Get lock info for a node (first lock if multiple)
   */
  getLock(nodeId: string): NodeLock | undefined {
    this.cleanupExpiredLocks();
    const nodeLocks = this.locks.get(nodeId);
    return nodeLocks?.[0];
  }

  /**
   * Get all locks for a node
   */
  getLocksForNode(nodeId: string): NodeLock[] {
    this.cleanupExpiredLocks();
    return [...(this.locks.get(nodeId) ?? [])];
  }

  /**
   * Get all locks held by a task
   */
  getLocksForTask(taskId: string): NodeLock[] {
    this.cleanupExpiredLocks();
    const result: NodeLock[] = [];

    for (const nodeLocks of this.locks.values()) {
      for (const lock of nodeLocks) {
        if (lock.taskId === taskId) {
          result.push(lock);
        }
      }
    }

    return result;
  }

  /**
   * Check if a node is locked
   */
  isNodeLocked(nodeId: string, type?: 'read' | 'write'): boolean {
    this.cleanupExpiredLocks();

    const nodeLocks = this.locks.get(nodeId);
    if (!nodeLocks || nodeLocks.length === 0) {
      return false;
    }

    if (type === undefined) {
      return true;
    }

    // Check for specific lock type
    if (type === 'write') {
      // Any lock prevents writes
      return true;
    }

    // For read, only write locks block
    return nodeLocks.some((lock) => lock.type === 'write');
  }

  /**
   * Set node hierarchy (called when canvas state changes)
   */
  setHierarchy(nodes: { id: string; parentId?: string }[]): void {
    this.nodeHierarchy.clear();

    // Build parent-child relationships
    const childMap = new Map<string, string[]>();

    for (const node of nodes) {
      if (node.parentId) {
        const children = childMap.get(node.parentId) ?? [];
        children.push(node.id);
        childMap.set(node.parentId, children);
      }
    }

    // Create hierarchy entries
    for (const node of nodes) {
      this.nodeHierarchy.set(node.id, {
        nodeId: node.id,
        parentId: node.parentId,
        childIds: childMap.get(node.id) ?? [],
      });
    }

    logger.debug({ nodeCount: nodes.length }, 'Hierarchy updated');
  }

  /**
   * Get all descendant node IDs
   */
  getDescendants(nodeId: string): string[] {
    const descendants: string[] = [];
    const hierarchy = this.nodeHierarchy.get(nodeId);

    if (!hierarchy) {
      return descendants;
    }

    const stack = [...hierarchy.childIds];
    while (stack.length > 0) {
      const childId = stack.pop();
      if (!childId) continue;
      descendants.push(childId);

      const childHierarchy = this.nodeHierarchy.get(childId);
      if (childHierarchy) {
        stack.push(...childHierarchy.childIds);
      }
    }

    return descendants;
  }

  /**
   * Get all ancestor node IDs
   */
  getAncestors(nodeId: string): string[] {
    const ancestors: string[] = [];
    let currentId: string | undefined = nodeId;

    while (currentId) {
      const hierarchy = this.nodeHierarchy.get(currentId);
      if (!hierarchy?.parentId) {
        break;
      }
      ancestors.push(hierarchy.parentId);
      currentId = hierarchy.parentId;
    }

    return ancestors;
  }

  /**
   * Clean up expired locks
   */
  cleanupExpiredLocks(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [nodeId, nodeLocks] of this.locks.entries()) {
      const active = nodeLocks.filter((lock) => lock.expiresAt > now);
      if (active.length < nodeLocks.length) {
        cleaned += nodeLocks.length - active.length;
        if (active.length === 0) {
          this.locks.delete(nodeId);
        } else {
          this.locks.set(nodeId, active);
        }
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned expired locks');
    }
  }

  /**
   * Get total lock count (for debugging)
   */
  getTotalLockCount(): number {
    let count = 0;
    for (const nodeLocks of this.locks.values()) {
      count += nodeLocks.length;
    }
    return count;
  }

  /**
   * Clear all locks (reset)
   */
  reset(): void {
    this.locks.clear();
    this.nodeHierarchy.clear();
    logger.warn('All locks cleared');
  }

  /**
   * Check if acquiring a lock would conflict with existing locks
   */
  private findConflict(
    nodeId: string,
    agentId: string,
    type: 'read' | 'write',
    includesChildren: boolean
  ): NodeLock | undefined {
    // Check the node itself
    const nodeConflict = this.findDirectConflict(nodeId, agentId, type);
    if (nodeConflict) {
      return nodeConflict;
    }

    // Check ancestors (if any ancestor has a lock that includes children)
    for (const ancestorId of this.getAncestors(nodeId)) {
      const ancestorLocks = this.locks.get(ancestorId) ?? [];
      for (const lock of ancestorLocks) {
        if (lock.includesChildren && lock.agentId !== agentId) {
          // Write locks always conflict
          if (lock.type === 'write') {
            return lock;
          }
          // Read locks only conflict with write requests
          if (type === 'write') {
            return lock;
          }
        }
      }
    }

    // If we're locking children, check descendants
    if (includesChildren) {
      for (const descendantId of this.getDescendants(nodeId)) {
        const descendantConflict = this.findDirectConflict(descendantId, agentId, type);
        if (descendantConflict) {
          return descendantConflict;
        }
      }
    }

    return undefined;
  }

  /**
   * Find direct conflict on a specific node
   */
  private findDirectConflict(
    nodeId: string,
    agentId: string,
    type: 'read' | 'write'
  ): NodeLock | undefined {
    const nodeLocks = this.locks.get(nodeId);
    if (!nodeLocks) {
      return undefined;
    }

    for (const lock of nodeLocks) {
      // Same agent can always access its own locks
      if (lock.agentId === agentId) {
        continue;
      }

      // Write lock conflicts with everything
      if (lock.type === 'write') {
        return lock;
      }

      // Read lock only conflicts with write requests
      if (type === 'write') {
        return lock;
      }
    }

    return undefined;
  }
}

/**
 * Singleton instance
 */
let lockManagerInstance: NodeLockManager | null = null;

/**
 * Get or create the NodeLockManager singleton
 */
export function getNodeLockManager(): NodeLockManager {
  lockManagerInstance ??= new NodeLockManager();
  return lockManagerInstance;
}

/**
 * Create a fresh NodeLockManager (for testing or isolation)
 */
export function createNodeLockManager(defaultTimeout?: number): NodeLockManager {
  return new NodeLockManager(defaultTimeout);
}
