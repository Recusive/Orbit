/**
 * Orchestrator types for Sub-Agent coordination
 * These types are shared between Canvas and Extension via IPC
 */

// Task execution status
export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed';

// Agent types matching the orchestrator architecture
export type AgentType = 'layout' | 'component' | 'style' | 'integration';

// Orchestrator status
export type OrchestratorStatus =
  | 'idle'
  | 'analyzing'
  | 'executing'
  | 'resolving'
  | 'completing'
  | 'failed';

/**
 * A single task in the orchestration pipeline
 */
export interface Task {
  id: string;
  type: AgentType;
  agentId: string;
  prompt: string;
  dependencies: string[]; // Task IDs that must complete first
  status: TaskStatus;
  assignedNodeIds: string[]; // Tree branches this task owns
  output?: TaskOutput;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Output from a completed task
 */
export interface TaskOutput {
  success: boolean;
  changes: CanvasChange[];
  code?: string;
  nodeIds?: string[]; // Nodes created/modified
  error?: string;
  suggestions?: string[];
}

/**
 * A change to the canvas state
 */
export interface CanvasChange {
  type: 'create' | 'update' | 'delete' | 'move' | 'style';
  nodeId: string;
  property?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * A stage in the execution pipeline
 * Stages execute sequentially, tasks within a stage can be parallel
 */
export interface TaskStage {
  id: number;
  name: string; // 'Layout', 'Components', 'Style', 'Integration'
  taskIds: string[];
  blocking: boolean; // If true, all tasks must complete before next stage
  status: 'pending' | 'active' | 'completed' | 'failed';
}

/**
 * The full task graph for an orchestration run
 */
export interface TaskGraph {
  id: string;
  userIntent: string;
  tasks: Map<string, Task>;
  stages: TaskStage[];
  createdAt: number;
}

/**
 * Node-based lock for parallel execution safety
 */
export interface NodeLock {
  nodeId: string;
  agentId: string;
  taskId: string;
  type: 'read' | 'write'; // Write = exclusive, Read = shared
  includesChildren: boolean;
  acquiredAt: number;
  expiresAt: number;
}

/**
 * Progress info for a task stage (sent to UI)
 */
export interface TaskStageProgress {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress: number; // 0-100
  tasks: TaskProgress[];
}

/**
 * Progress info for a single task (sent to UI)
 */
export interface TaskProgress {
  id: string;
  type: AgentType;
  agentId: string;
  status: TaskStatus;
  progress?: number;
  assignedNodeIds: string[];
}

/**
 * Activity status for a sub-agent
 */
export interface AgentActivity {
  agentId: string;
  name: string;
  type: AgentType;
  status: 'idle' | 'thinking' | 'executing' | 'waiting';
  currentTaskId?: string;
  tokenUsage?: number;
}

/**
 * Full orchestrator state (sent to canvas via IPC)
 */
export interface OrchestratorState {
  status: OrchestratorStatus;
  currentIntent?: string;
  currentStage: number;
  stages: TaskStageProgress[];
  activeAgents: AgentActivity[];
  completedTasks: number;
  totalTasks: number;
  startTime?: number;
  estimatedCompletion?: number;
  errors: OrchestratorError[];
}

/**
 * Error from orchestrator
 */
export interface OrchestratorError {
  code: string;
  message: string;
  taskId?: string;
  agentId?: string;
  recoverable: boolean;
  suggestedAction?: string;
  timestamp: number;
}

/**
 * Conflict between agent outputs
 */
export type ConflictType = 'position' | 'style' | 'code' | 'hierarchy';
export type ConflictSeverity = 'critical' | 'warning' | 'info';
export type ConflictStrategy =
  | 'first-wins'
  | 'last-wins'
  | 'priority-based'
  | 'merge'
  | 'ai-arbitrate'
  | 'user-prompt';

export interface Conflict {
  id: string;
  type: ConflictType;
  agents: string[];
  nodeId: string;
  property: string;
  values: unknown[];
  severity: ConflictSeverity;
  autoResolvable: boolean;
  suggestedResolution?: Resolution;
}

/**
 * Resolution for a conflict
 */
export interface Resolution {
  conflictId: string;
  strategy: ConflictStrategy;
  resolvedValue: unknown;
  reasoning?: string;
  chosenAgent?: string;
}

/**
 * Control actions for orchestrator
 */
export type OrchestratorControlAction = 'pause' | 'resume' | 'cancel' | 'retry';

/**
 * Serialized canvas snapshot for context passing
 */
export interface CanvasSnapshot {
  nodes: NodeSnapshot[];
  edges: EdgeSnapshot[];
  designTree?: unknown; // SerializedDesignTree
  viewport: ViewportState;
  timestamp: number;
}

export interface NodeSnapshot {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface EdgeSnapshot {
  id: string;
  source: string;
  target: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Blackboard slice - minimal context for an agent
 */
export interface BlackboardSlice {
  relevantNodes: NodeSnapshot[];
  relevantEdges: EdgeSnapshot[];
  designTreeSlice?: unknown;
  constraints: Constraint[];
  siblingOutputs: Map<string, TaskOutput>;
}

/**
 * Constraint from user, agent, or system
 */
export interface Constraint {
  type: 'size' | 'position' | 'style' | 'component' | 'accessibility';
  source: 'user' | 'agent' | 'system';
  property: string;
  value: unknown;
  priority: number;
}
