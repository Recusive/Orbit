/*---------------------------------------------------------------------------------------------
 *  ConflictResolver - Detects and resolves conflicts between agent outputs
 *
 *  When multiple agents modify the same node/property, conflicts can occur.
 *  This module:
 *  - Detects conflicts from pending changes
 *  - Applies resolution strategies (first-wins, last-wins, merge, AI-arbitrate)
 *  - Tracks resolution history for debugging
 *  - Escalates unresolvable conflicts to user
 *--------------------------------------------------------------------------------------------*/

import { createLogger } from '../../common/logging/logger.js';

import type {
  CanvasChange,
  Conflict,
  ConflictSeverity,
  ConflictStrategy,
  ConflictType,
  Resolution,
  TaskOutput,
} from './types.js';

const logger = createLogger('ConflictResolver');

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  /** Detected conflicts */
  conflicts: Conflict[];
  /** Changes that don't conflict */
  cleanChanges: CanvasChange[];
}

/**
 * Resolution options for a conflict
 */
export interface ResolutionOption {
  strategy: ConflictStrategy;
  label: string;
  description: string;
  value: unknown;
  confidence?: number;
}

/**
 * Conflict resolution configuration
 */
export interface ConflictResolverConfig {
  /** Default strategy for auto-resolvable conflicts */
  defaultStrategy: ConflictStrategy;
  /** Priority order for agents (higher index = higher priority) */
  agentPriority: string[];
  /** Whether to auto-resolve low-severity conflicts */
  autoResolveLowSeverity: boolean;
  /** Conflict types that always require user input */
  alwaysAskUser: ConflictType[];
}

/**
 * Event callback types (internal)
 */
type ConflictDetectedCallback = (conflict: Conflict) => void;
type ConflictResolvedCallback = (resolution: Resolution) => void;
type UserInputRequiredCallback = (data: {
  conflict: Conflict;
  options: ResolutionOption[];
}) => void;

const DEFAULT_CONFIG: ConflictResolverConfig = {
  defaultStrategy: 'last-wins',
  agentPriority: ['layout', 'component', 'style', 'integration'],
  autoResolveLowSeverity: true,
  alwaysAskUser: ['code'], // Code conflicts should usually involve user
};

/**
 * ConflictResolver - Manages conflict detection and resolution
 */
export class ConflictResolver {
  private readonly config: ConflictResolverConfig;

  /** Pending conflicts awaiting resolution */
  private pendingConflicts = new Map<string, Conflict>();

  /** Resolution history */
  private resolutionHistory: Resolution[] = [];

  /** Event callbacks */
  private conflictDetectedCallbacks: ConflictDetectedCallback[] = [];
  private conflictResolvedCallbacks: ConflictResolvedCallback[] = [];
  private userInputRequiredCallbacks: UserInputRequiredCallback[] = [];

  constructor(config: Partial<ConflictResolverConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info({ config: this.config }, 'ConflictResolver initialized');
  }

  /**
   * Register callback for conflict detected events
   */
  onConflictDetected(callback: ConflictDetectedCallback): () => void {
    this.conflictDetectedCallbacks.push(callback);
    return () => {
      const index = this.conflictDetectedCallbacks.indexOf(callback);
      if (index >= 0) this.conflictDetectedCallbacks.splice(index, 1);
    };
  }

  /**
   * Register callback for conflict resolved events
   */
  onConflictResolved(callback: ConflictResolvedCallback): () => void {
    this.conflictResolvedCallbacks.push(callback);
    return () => {
      const index = this.conflictResolvedCallbacks.indexOf(callback);
      if (index >= 0) this.conflictResolvedCallbacks.splice(index, 1);
    };
  }

  /**
   * Register callback for user input required events
   */
  onUserInputRequired(callback: UserInputRequiredCallback): () => void {
    this.userInputRequiredCallbacks.push(callback);
    return () => {
      const index = this.userInputRequiredCallbacks.indexOf(callback);
      if (index >= 0) this.userInputRequiredCallbacks.splice(index, 1);
    };
  }

  /**
   * Detect conflicts from multiple task outputs
   */
  detectConflicts(outputs: Map<string, TaskOutput>): ConflictDetectionResult {
    const conflicts: Conflict[] = [];
    const allChanges: { taskId: string; change: CanvasChange }[] = [];

    // Collect all changes with their source task
    for (const [taskId, output] of outputs) {
      for (const change of output.changes) {
        allChanges.push({ taskId, change });
      }
    }

    // Group changes by nodeId + property
    const changeGroups = new Map<string, { taskId: string; change: CanvasChange }[]>();

    for (const item of allChanges) {
      const key = this.getChangeKey(item.change);
      const group = changeGroups.get(key) ?? [];
      group.push(item);
      changeGroups.set(key, group);
    }

    // Detect conflicts (multiple changes to same key)
    const conflictingKeys = new Set<string>();

    for (const [key, group] of changeGroups) {
      if (group.length > 1) {
        // Check if values actually differ
        const values = group.map((g) => g.change.after);
        const uniqueValues = this.getUniqueValues(values);

        if (uniqueValues.length > 1) {
          const conflict = this.createConflict(key, group);
          conflicts.push(conflict);
          conflictingKeys.add(key);
          this.pendingConflicts.set(conflict.id, conflict);
          this.emitConflictDetected(conflict);
        }
      }
    }

    // Collect non-conflicting changes
    const cleanChanges: CanvasChange[] = [];
    for (const item of allChanges) {
      const key = this.getChangeKey(item.change);
      if (!conflictingKeys.has(key)) {
        cleanChanges.push(item.change);
      }
    }

    logger.info(
      { conflictCount: conflicts.length, cleanChangeCount: cleanChanges.length },
      'Conflict detection complete'
    );

    return { conflicts, cleanChanges };
  }

  /**
   * Attempt to auto-resolve a conflict
   */
  autoResolve(conflict: Conflict): Resolution | null {
    // Check if this type always requires user input
    if (this.config.alwaysAskUser.includes(conflict.type)) {
      logger.debug({ conflictId: conflict.id }, 'Conflict requires user input');
      return null;
    }

    // Check if auto-resolvable
    if (!conflict.autoResolvable) {
      return null;
    }

    // Apply default strategy
    const resolution = this.applyStrategy(conflict, this.config.defaultStrategy);

    if (resolution) {
      this.recordResolution(resolution);
      this.pendingConflicts.delete(conflict.id);
      this.emitConflictResolved(resolution);
    }

    return resolution;
  }

  /**
   * Get resolution options for a conflict
   */
  getResolutionOptions(conflict: Conflict): ResolutionOption[] {
    const options: ResolutionOption[] = [];

    // Add option for each agent's value
    for (let i = 0; i < conflict.agents.length; i++) {
      const agent = conflict.agents[i];
      const value = conflict.values[i];

      if (agent) {
        options.push({
          strategy: 'priority-based',
          label: `Use ${agent}'s value`,
          description: `Apply the value from ${agent}: ${this.formatValue(value)}`,
          value,
          confidence: this.getAgentPriority(agent) / this.config.agentPriority.length,
        });
      }
    }

    // Add merge option if applicable
    if (this.canMerge(conflict)) {
      const mergedValue = this.attemptMerge(conflict);
      if (mergedValue !== null) {
        options.push({
          strategy: 'merge',
          label: 'Merge values',
          description: `Combine values: ${this.formatValue(mergedValue)}`,
          value: mergedValue,
          confidence: 0.7,
        });
      }
    }

    // Add first-wins and last-wins
    options.push({
      strategy: 'first-wins',
      label: 'Keep first',
      description: `Keep the first value: ${this.formatValue(conflict.values[0])}`,
      value: conflict.values[0],
    });

    options.push({
      strategy: 'last-wins',
      label: 'Keep last',
      description: `Keep the latest value: ${this.formatValue(conflict.values[conflict.values.length - 1])}`,
      value: conflict.values[conflict.values.length - 1],
    });

    return options;
  }

  /**
   * Resolve a conflict with a specific resolution
   */
  resolve(conflictId: string, resolution: Resolution): boolean {
    const conflict = this.pendingConflicts.get(conflictId);
    if (!conflict) {
      logger.warn({ conflictId }, 'Conflict not found');
      return false;
    }

    this.recordResolution(resolution);
    this.pendingConflicts.delete(conflictId);
    this.emitConflictResolved(resolution);

    logger.info({ conflictId, strategy: resolution.strategy }, 'Conflict resolved');

    return true;
  }

  /**
   * Request user input for a conflict
   */
  requestUserInput(conflict: Conflict): void {
    const options = this.getResolutionOptions(conflict);
    this.emitUserInputRequired({ conflict, options });
  }

  /**
   * Get pending conflicts
   */
  getPendingConflicts(): Conflict[] {
    return Array.from(this.pendingConflicts.values());
  }

  /**
   * Get resolution history
   */
  getResolutionHistory(): Resolution[] {
    return [...this.resolutionHistory];
  }

  /**
   * Clear all pending conflicts and history
   */
  reset(): void {
    this.pendingConflicts.clear();
    this.resolutionHistory = [];
    logger.info('ConflictResolver reset');
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.conflictDetectedCallbacks = [];
    this.conflictResolvedCallbacks = [];
    this.userInputRequiredCallbacks = [];
    this.pendingConflicts.clear();
    this.resolutionHistory = [];
  }

  // ========== Event Emitters ==========

  private emitConflictDetected(conflict: Conflict): void {
    for (const callback of this.conflictDetectedCallbacks) {
      try {
        callback(conflict);
      } catch (err) {
        logger.error({ err }, 'Error in conflict detected callback');
      }
    }
  }

  private emitConflictResolved(resolution: Resolution): void {
    for (const callback of this.conflictResolvedCallbacks) {
      try {
        callback(resolution);
      } catch (err) {
        logger.error({ err }, 'Error in conflict resolved callback');
      }
    }
  }

  private emitUserInputRequired(data: { conflict: Conflict; options: ResolutionOption[] }): void {
    for (const callback of this.userInputRequiredCallbacks) {
      try {
        callback(data);
      } catch (err) {
        logger.error({ err }, 'Error in user input required callback');
      }
    }
  }

  // ========== Private Methods ==========

  /**
   * Get a unique key for a change (nodeId + property)
   */
  private getChangeKey(change: CanvasChange): string {
    return `${change.nodeId}:${change.property ?? change.type}`;
  }

  /**
   * Get unique values from an array (deep comparison for objects)
   */
  private getUniqueValues(values: unknown[]): unknown[] {
    const unique: unknown[] = [];
    for (const value of values) {
      const exists = unique.some((u) => this.deepEqual(u, value));
      if (!exists) {
        unique.push(value);
      }
    }
    return unique;
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object' || a === null || b === null) return false;

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = Object.keys(aObj);

    if (keys.length !== Object.keys(bObj).length) return false;

    for (const key of keys) {
      if (!this.deepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  /**
   * Create a conflict from a group of changes
   */
  private createConflict(key: string, group: { taskId: string; change: CanvasChange }[]): Conflict {
    const parts = key.split(':');
    const nodeId = parts[0] ?? key;
    const property = parts[1];
    const agents = group.map((g) => g.taskId);
    const values = group.map((g) => g.change.after);
    const firstGroup = group[0];
    const changeType = firstGroup?.change.type ?? 'update';

    // Determine conflict type
    let type: ConflictType;
    switch (changeType) {
      case 'move':
        type = 'position';
        break;
      case 'style':
        type = 'style';
        break;
      case 'update':
        type = property === 'code' ? 'code' : 'style';
        break;
      case 'create':
      case 'delete':
        type = 'hierarchy';
        break;
    }

    // Determine severity
    let severity: ConflictSeverity;
    if (type === 'code') {
      severity = 'critical';
    } else if (type === 'position' || type === 'hierarchy') {
      severity = 'warning';
    } else {
      severity = 'info';
    }

    // Check if auto-resolvable
    const autoResolvable = severity !== 'critical' && !this.config.alwaysAskUser.includes(type);

    const conflict: Conflict = {
      id: `conflict-${String(Date.now())}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      agents,
      nodeId,
      property: property ?? changeType,
      values,
      severity,
      autoResolvable,
    };

    // Add suggested resolution for auto-resolvable conflicts
    if (autoResolvable) {
      conflict.suggestedResolution = {
        conflictId: conflict.id,
        strategy: this.config.defaultStrategy,
        resolvedValue: this.getValueByStrategy(conflict, this.config.defaultStrategy),
        reasoning: `Auto-resolved using ${this.config.defaultStrategy} strategy`,
      };
    }

    return conflict;
  }

  /**
   * Apply a resolution strategy to a conflict
   */
  private applyStrategy(conflict: Conflict, strategy: ConflictStrategy): Resolution | null {
    const resolvedValue = this.getValueByStrategy(conflict, strategy);

    if (resolvedValue === undefined) {
      return null;
    }

    return {
      conflictId: conflict.id,
      strategy,
      resolvedValue,
      reasoning: `Applied ${strategy} strategy`,
    };
  }

  /**
   * Get the resolved value based on strategy
   */
  private getValueByStrategy(conflict: Conflict, strategy: ConflictStrategy): unknown {
    switch (strategy) {
      case 'first-wins':
        return conflict.values[0];

      case 'last-wins':
        return conflict.values[conflict.values.length - 1];

      case 'priority-based': {
        // Find highest priority agent
        let highestPriority = -1;
        let highestValue = conflict.values[0];

        for (let i = 0; i < conflict.agents.length; i++) {
          const agent = conflict.agents[i];
          if (agent) {
            const priority = this.getAgentPriority(agent);
            if (priority > highestPriority) {
              highestPriority = priority;
              highestValue = conflict.values[i];
            }
          }
        }

        return highestValue;
      }

      case 'merge':
        return this.attemptMerge(conflict);

      case 'ai-arbitrate':
      case 'user-prompt':
        // These strategies require external input, fall back to last-wins
        return conflict.values[conflict.values.length - 1];
    }
  }

  /**
   * Get agent priority (higher = more priority)
   */
  private getAgentPriority(agentId: string): number {
    // Extract agent type from ID (e.g., "layout-agent-0" -> "layout")
    const type = agentId.split('-')[0] ?? agentId;
    const index = this.config.agentPriority.indexOf(type);
    return index >= 0 ? index : 0;
  }

  /**
   * Check if values can be merged
   */
  private canMerge(conflict: Conflict): boolean {
    // Style conflicts can often be merged
    if (conflict.type === 'style') {
      return conflict.values.every((v) => typeof v === 'object' && v !== null);
    }

    // Position conflicts can sometimes be averaged
    if (conflict.type === 'position') {
      return conflict.values.every(
        (v) => typeof v === 'object' && v !== null && 'x' in v && 'y' in v
      );
    }

    return false;
  }

  /**
   * Attempt to merge values
   */
  private attemptMerge(conflict: Conflict): unknown {
    if (conflict.type === 'style') {
      // Merge style objects (later values override)
      const merged: Record<string, unknown> = {};
      for (const value of conflict.values) {
        if (typeof value === 'object' && value !== null) {
          Object.assign(merged, value);
        }
      }
      return merged;
    }

    if (conflict.type === 'position') {
      // Average positions
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (const value of conflict.values) {
        const pos = value as { x: number; y: number } | null | undefined;
        if (
          pos !== null &&
          pos !== undefined &&
          typeof pos.x === 'number' &&
          typeof pos.y === 'number'
        ) {
          sumX += pos.x;
          sumY += pos.y;
          count++;
        }
      }

      if (count > 0) {
        return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
      }
    }

    return null;
  }

  /**
   * Format a value for display
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      return value.length > 50 ? value.substring(0, 47) + '...' : value;
    }

    if (typeof value === 'object') {
      const str = JSON.stringify(value);
      return str.length > 50 ? str.substring(0, 47) + '...' : str;
    }

    // Handle primitives (number, boolean, bigint, symbol, function)
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }

    return '[unknown]';
  }

  /**
   * Record a resolution in history
   */
  private recordResolution(resolution: Resolution): void {
    this.resolutionHistory.push(resolution);

    // Keep history bounded
    if (this.resolutionHistory.length > 100) {
      this.resolutionHistory = this.resolutionHistory.slice(-100);
    }
  }
}

/**
 * Singleton instance
 */
let resolverInstance: ConflictResolver | null = null;

/**
 * Get or create the ConflictResolver singleton
 */
export function getConflictResolver(): ConflictResolver {
  resolverInstance ??= new ConflictResolver();
  return resolverInstance;
}

/**
 * Create a fresh ConflictResolver (for testing or isolation)
 */
export function createConflictResolver(config?: Partial<ConflictResolverConfig>): ConflictResolver {
  return new ConflictResolver(config);
}
