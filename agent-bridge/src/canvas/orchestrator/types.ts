/*---------------------------------------------------------------------------------------------
 *  Orchestrator Types - Type definitions for canvas orchestration
 *  Ported from Orbit/src/orbit/canvas/orchestrator/types.ts
 *--------------------------------------------------------------------------------------------*/

// Task execution status
export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed';

// Agent types for the hierarchical pipeline
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
  dependencies: string[];
  status: TaskStatus;
  assignedNodeIds: string[];
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
  nodeIds?: string[];
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
 */
export interface TaskStage {
  id: number;
  name: string;
  taskIds: string[];
  blocking: boolean;
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
  type: 'read' | 'write';
  includesChildren: boolean;
  acquiredAt: number;
  expiresAt: number;
}

/**
 * Progress info for a task stage
 */
export interface TaskStageProgress {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress: number;
  tasks: TaskProgress[];
}

/**
 * Progress info for a single task
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
  designTree?: unknown;
  viewport: ViewportState;
  timestamp: number;
  selectedNodeId?: string;
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

// =============================================================================
// Intent Analysis Types
// =============================================================================

/**
 * Complexity level of a user intent
 */
export type IntentComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Intent category for routing
 */
export type IntentCategory =
  | 'create-component' // Create a new component
  | 'modify-component' // Update existing component
  | 'style-change' // CSS/styling changes
  | 'layout-change' // Structural layout changes
  | 'multi-component' // Multiple components involved
  | 'full-page' // Full page/app creation
  | 'unknown'; // Cannot determine

/**
 * Result of intent analysis
 */
export interface IntentAnalysis {
  /** Original user prompt */
  userIntent: string;

  /** Detected complexity level */
  complexity: IntentComplexity;

  /** Primary category of the intent */
  category: IntentCategory;

  /** Whether to use fast path (single agent) */
  useFastPath: boolean;

  /** If fast path, which agent type to use */
  fastPathAgent?: AgentType;

  /** Detected component/node references in the prompt */
  referencedNodeIds: string[];

  /** Estimated number of tasks */
  estimatedTaskCount: number;

  /** Confidence score (0-1) */
  confidence: number;

  /** Reasoning for the analysis */
  reasoning: string;
}

/**
 * Task decomposition result
 */
export interface DecompositionResult {
  /** The generated task graph */
  graph: TaskGraph;

  /** Analysis that led to this decomposition */
  analysis: IntentAnalysis;

  /** Estimated total time (ms) */
  estimatedDuration?: number;
}
