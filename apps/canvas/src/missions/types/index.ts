/**
 * Missions Mode Types
 * Types for the AI Agent Orchestration canvas with connected agent cards
 */

// ============================================================================
// Agent Status
// ============================================================================

/**
 * Agent execution status lifecycle
 */
export type AgentStatus =
  | 'idle' // Ready to execute, not yet started
  | 'pending' // Waiting for dependencies to complete
  | 'running' // Currently executing (prompt sent to Claude)
  | 'streaming' // Receiving streaming response chunks
  | 'complete' // Finished successfully with output
  | 'error'; // Failed with an error

/**
 * Available Claude models for agents
 */
export type AgentModel = 'haiku' | 'sonnet' | 'opus';

/**
 * Model configuration display info
 */
export interface AgentModelConfig {
  model: AgentModel;
  label: string;
  description: string;
  speed: 'fast' | 'medium' | 'slow';
  cost: 'low' | 'medium' | 'high';
}

export const AGENT_MODEL_CONFIGS: Record<AgentModel, AgentModelConfig> = {
  haiku: {
    model: 'haiku',
    label: 'Haiku',
    description: 'Fast responses, good for simple tasks',
    speed: 'fast',
    cost: 'low',
  },
  sonnet: {
    model: 'sonnet',
    label: 'Sonnet',
    description: 'Balanced speed and capability',
    speed: 'medium',
    cost: 'medium',
  },
  opus: {
    model: 'opus',
    label: 'Opus',
    description: 'Most capable, best for complex reasoning',
    speed: 'slow',
    cost: 'high',
  },
};

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Configuration for an agent's Claude settings
 */
export interface AgentConfig {
  model: AgentModel;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingEnabled?: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: 'sonnet',
  temperature: 0.7,
  maxTokens: 4096,
  thinkingEnabled: false,
};

// ============================================================================
// Agent Execution
// ============================================================================

/**
 * Result of a single agent execution
 */
export interface AgentExecutionResult {
  output: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  error?: string;
}

/**
 * Activity log entry status
 */
export type ActivityLogStatus =
  | 'in_progress' // Currently doing this
  | 'completed' // Done
  | 'needs_input' // Waiting for user input
  | 'error' // Failed
  | 'cancelled'; // User cancelled

/**
 * Single activity log entry showing what the agent is doing
 */
export interface ActivityLogEntry {
  id: string;
  message: string;
  status: ActivityLogStatus;
  timestamp: number;
}

/**
 * Execution state for tracking streaming progress
 */
export interface AgentExecutionState {
  status: AgentStatus;
  currentOutput: string; // Streaming buffer
  activityLog: ActivityLogEntry[]; // Live activity feed
  lastResult?: AgentExecutionResult;
  executionHistory: AgentExecutionResult[];
  errorMessage?: string;
}

// ============================================================================
// Context Propagation
// ============================================================================

/**
 * How context flows from parent agent to child agent
 */
export type ContextFlowType =
  | 'full' // Pass entire parent output
  | 'summary' // Summarize parent output before passing
  | 'filtered' // Apply filter/template to extract relevant parts
  | 'none'; // Do not inherit any context

/**
 * Mode for summarizing parent context
 */
export type ContextSummaryMode = 'full' | 'summary' | 'custom';

// ============================================================================
// Agent Card
// ============================================================================

/**
 * The main agent card node data structure
 * Each card represents an AI agent that can be executed
 */
export interface AgentCard {
  id: string;
  name: string;

  // Prompt configuration
  prompt: string; // The user instruction for this agent
  promptMode: 'static' | 'template'; // Static prompt or template with {{context}}

  // Agent configuration
  config: AgentConfig;

  // UI State
  position: { x: number; y: number };
  size: { width: number; height: number };
  collapsed: boolean;
  locked: boolean;

  // Execution state
  execution: AgentExecutionState;

  // Context configuration
  inheritParentContext: boolean; // Whether to receive context from parents
  contextSummaryMode: ContextSummaryMode;
  customContextTemplate?: string; // Custom template for context formatting

  // Tags and metadata
  tags: string[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/**
 * Default values for creating a new agent card
 */
export const DEFAULT_AGENT_CARD: Omit<AgentCard, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
  name: 'New Agent',
  prompt: '',
  promptMode: 'static',
  config: { ...DEFAULT_AGENT_CONFIG },
  position: { x: 0, y: 0 },
  size: { width: 360, height: 280 },
  collapsed: false,
  locked: false,
  execution: {
    status: 'idle',
    currentOutput: '',
    activityLog: [],
    executionHistory: [],
  },
  inheritParentContext: true,
  contextSummaryMode: 'full',
  tags: [],
};

// ============================================================================
// Mission Connection
// ============================================================================

/**
 * Visual style for connection edges
 */
export interface MissionConnectionStyle {
  color?: string;
  strokeWidth?: number;
  animated?: boolean;
  dashed?: boolean;
}

/**
 * Connection between two agent cards defining context flow
 */
export interface MissionConnection {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;

  // Handle positions (always left-to-right flow)
  sourceHandle: 'right';
  targetHandle: 'left';

  // Context flow configuration
  contextFlow: ContextFlowType;
  contextFilter?: string; // Regex pattern to filter output
  contextTransform?: string; // Template to transform context
  priority: number; // Order when multiple parents (lower = first)

  // User-defined label
  label?: string;
  description?: string;

  // Visual styling
  style: MissionConnectionStyle;

  // Metadata
  createdAt: number;
  createdBy: string;
}

/**
 * Default connection values
 */
export const DEFAULT_MISSION_CONNECTION: Omit<
  MissionConnection,
  'id' | 'sourceAgentId' | 'targetAgentId' | 'createdAt' | 'createdBy'
> = {
  sourceHandle: 'right',
  targetHandle: 'left',
  contextFlow: 'full',
  priority: 1,
  style: {
    animated: false,
    dashed: false,
  },
};

// ============================================================================
// Mission
// ============================================================================

/**
 * Mission execution status
 */
export type MissionStatus =
  | 'draft' // Not ready to run (incomplete configuration)
  | 'ready' // Ready to execute
  | 'running' // Currently executing agents
  | 'paused' // Execution paused by user
  | 'completed' // All agents completed successfully
  | 'failed'; // One or more agents failed

/**
 * Result of a single mission run
 */
export interface MissionRun {
  id: string;
  startedAt: number;
  completedAt?: number;
  status: MissionStatus;
  agentResults: Record<string, AgentExecutionResult>;
  executionOrder: string[]; // Actual order agents were executed
  totalTokensUsed: number;
  totalDurationMs: number;
  error?: string;
}

/**
 * The main mission data structure
 * A mission is a collection of agent cards with connections
 */
export interface Mission {
  id: string;
  name: string;
  description?: string;

  // Content (IDs reference agents and connections in store)
  agentIds: string[];
  connectionIds: string[];

  // Entry points (agents with no dependencies - auto-computed)
  entryAgentIds: string[];

  // Execution
  status: MissionStatus;
  currentRun?: MissionRun;
  runHistory: MissionRun[];

  // Execution configuration
  autoExecute: boolean; // Auto-run children when dependencies complete
  stopOnError: boolean; // Stop mission if any agent fails
  maxConcurrency: number; // Max agents running in parallel

  // Tags and metadata
  tags: string[];
  createdAt: number;
  updatedAt: number;
  owner: string;
}

/**
 * Default mission values
 */
export const DEFAULT_MISSION: Omit<Mission, 'id' | 'owner' | 'createdAt' | 'updatedAt'> = {
  name: 'New Mission',
  agentIds: [],
  connectionIds: [],
  entryAgentIds: [],
  status: 'draft',
  runHistory: [],
  autoExecute: true,
  stopOnError: true,
  maxConcurrency: 3,
  tags: [],
};

// ============================================================================
// Mission Metadata (for listing)
// ============================================================================

/**
 * Lightweight mission metadata for listing without full content
 */
export interface MissionMetadata {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  agentCount: number;
  connectionCount: number;
  status: MissionStatus;
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// ReactFlow Node/Edge Data
// ============================================================================

/**
 * Data passed to the AgentCardNode ReactFlow component
 */
export interface AgentCardNodeData {
  agent: AgentCard;
  onUpdate?: (agentId: string, updates: Partial<AgentCard>) => void;
  onDelete?: (agentId: string) => void;
  onDuplicate?: (agentId: string) => void;
  onToggleCollapse?: (agentId: string) => void;
  onPrompt?: (agentId: string, prompt: string) => void;
  onExecute?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
  onConfigure?: (agentId: string) => void;
  onExpand?: (agentId: string) => void;
  // Index signature for ReactFlow compatibility
  [key: string]: unknown;
}

/**
 * Data passed to the MissionEdge ReactFlow component
 */
export interface MissionEdgeData {
  connection: MissionConnection;
  isActive: boolean; // Context currently flowing
  onUpdate?: (connectionId: string, updates: Partial<MissionConnection>) => void;
  onDelete?: (connectionId: string) => void;
  onEditLabel?: (connectionId: string) => void;
  // Index signature for ReactFlow compatibility
  [key: string]: unknown;
}

// ============================================================================
// UI State
// ============================================================================

/**
 * Selection state for the mission canvas
 */
export interface MissionSelection {
  selectedAgentIds: string[];
  selectedConnectionIds: string[];
  focusedAgentId: string | null;
}

/**
 * Right sidebar panel tabs
 */
export type MissionRightPanelTab = 'config' | 'log' | 'history';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new agent card with defaults
 */
export function createAgentCard(
  partial: Partial<AgentCard> & { id: string; createdBy: string }
): AgentCard {
  const now = Date.now();
  return {
    ...DEFAULT_AGENT_CARD,
    ...partial,
    config: { ...DEFAULT_AGENT_CONFIG, ...partial.config },
    execution: { ...DEFAULT_AGENT_CARD.execution, ...partial.execution },
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/**
 * Create a new mission connection with defaults
 */
export function createMissionConnection(
  partial: Partial<MissionConnection> & {
    id: string;
    sourceAgentId: string;
    targetAgentId: string;
    createdBy: string;
  }
): MissionConnection {
  return {
    ...DEFAULT_MISSION_CONNECTION,
    ...partial,
    createdAt: partial.createdAt ?? Date.now(),
  };
}

/**
 * Create a new mission with defaults
 */
export function createMission(partial: Partial<Mission> & { id: string; owner: string }): Mission {
  const now = Date.now();
  return {
    ...DEFAULT_MISSION,
    ...partial,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/**
 * Get status display color
 */
export function getAgentStatusColor(status: AgentStatus): string {
  const colors: Record<AgentStatus, string> = {
    idle: 'var(--muted-foreground)',
    pending: 'var(--yellow-500)',
    running: 'var(--blue-500)',
    streaming: 'var(--blue-500)',
    complete: 'var(--green-500)',
    error: 'var(--red-500)',
  };
  return colors[status];
}

/**
 * Get status display label
 */
export function getAgentStatusLabel(status: AgentStatus): string {
  const labels: Record<AgentStatus, string> = {
    idle: 'Idle',
    pending: 'Pending',
    running: 'Running',
    streaming: 'Streaming',
    complete: 'Complete',
    error: 'Error',
  };
  return labels[status];
}

/**
 * Get model display config
 */
export function getAgentModelConfig(model: AgentModel): AgentModelConfig {
  return AGENT_MODEL_CONFIGS[model];
}
