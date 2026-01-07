/**
 * Orchestrator Module - Multi-agent coordination for canvas operations
 *
 * Provides:
 * - Intent analysis and routing (fast path vs full orchestration)
 * - Task decomposition into dependency graphs
 * - Multi-agent execution with node locking
 * - Conflict detection and resolution
 * - Blackboard shared state management
 */

// Types
export type {
  // Core types
  TaskStatus,
  AgentType,
  OrchestratorStatus,
  Task,
  TaskOutput,
  CanvasChange,
  TaskStage,
  TaskGraph,
  NodeLock,
  TaskStageProgress,
  TaskProgress,
  AgentActivity,
  OrchestratorState,
  OrchestratorError,
  // Conflict types
  ConflictType,
  ConflictSeverity,
  ConflictStrategy,
  Conflict,
  Resolution,
  OrchestratorControlAction,
  // Snapshot types
  CanvasSnapshot,
  NodeSnapshot,
  EdgeSnapshot,
  ViewportState,
  BlackboardSlice,
  Constraint,
  // Intent analysis types
  IntentComplexity,
  IntentCategory,
  IntentAnalysis,
  DecompositionResult,
} from './types.js';

// Blackboard
export { Blackboard, getBlackboard, createBlackboard } from './blackboard.js';
export type { SliceOptions } from './blackboard.js';

// Node Lock Manager
export { NodeLockManager, getNodeLockManager, createNodeLockManager } from './node-lock-manager.js';
export type { LockRequest, LockResult } from './node-lock-manager.js';

// Intent Analyzer
export { IntentAnalyzer, getIntentAnalyzer, createIntentAnalyzer } from './intent-analyzer.js';

// Task Decomposer
export { TaskDecomposer, getTaskDecomposer, createTaskDecomposer } from './task-decomposer.js';

// Conflict Resolver
export {
  ConflictResolver,
  getConflictResolver,
  createConflictResolver,
} from './conflict-resolver.js';
export type {
  ConflictDetectionResult,
  ResolutionOption,
  ConflictResolverConfig,
} from './conflict-resolver.js';

// Task Executor
export { TaskExecutor, getTaskExecutor, createTaskExecutor } from './task-executor.js';
export type { AgentExecutor, TaskExecutorConfig, TaskExecutionEvents } from './task-executor.js';

// Orchestrator
export { Orchestrator, getOrchestrator, createOrchestrator } from './orchestrator.js';
export type { OrchestratorConfig } from './orchestrator.js';

// Agents
export {
  BaseAgent,
  LayoutAgent,
  createLayoutAgent,
  ComponentAgent,
  createComponentAgent,
  StyleAgent,
  createStyleAgent,
  IntegrationAgent,
  createIntegrationAgent,
  getAgentInstance,
  registerAgentInstance,
  unregisterAgentInstance,
  clearAgentInstances,
} from './agents/index.js';
export type { AgentConfig, AgentEvents } from './agents/index.js';
