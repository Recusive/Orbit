/**
 * Mission Agent Factory
 *
 * Factory function for creating Claude Agent SDK sessions based on agent type.
 * Each agent type has different initialization behavior:
 * - Full: Standard agent, user provides task directly
 * - Review: Fetches git diff, sends review task prompt
 * - Plan: Enables plan mode at session start
 *
 * All agents use the same system prompt from the canvas system.
 */

import { EventEmitter } from 'node:events';

import { createLogger } from '../../common/logging/logger.js';

import { createCanvasAgent } from './canvas-agent.js';

import type { CanvasAgent } from './canvas-agent.js';
import type { CanvasSessionConfig, SDKMessage, McpToolRequest } from '../types/types.js';

const logger = createLogger('MissionAgentFactory');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Agent type enum - must match frontend types
 */
export type AgentType = 'full' | 'review' | 'plan';

/**
 * Review scope - determines what git changes to analyze
 */
export type ReviewScope = 'uncommitted' | 'staged' | 'branch' | 'pr' | 'commit';

/**
 * Base configuration for all agent types
 */
interface BaseAgentTypeConfig {
  id: string;
  name: string;
  agentType: AgentType;
}

/**
 * Full agent configuration
 */
export interface FullAgentTypeConfig extends BaseAgentTypeConfig {
  agentType: 'full';
}

/**
 * Review agent configuration
 */
export interface ReviewAgentTypeConfig extends BaseAgentTypeConfig {
  agentType: 'review';
  reviewScope: ReviewScope;
  baseBranch?: string;
  prRef?: string;
  commitSha?: string;
}

/**
 * Plan agent configuration
 * Plan mode restricts the agent to read-only tools until it creates a plan.
 */
export interface PlanAgentTypeConfig extends BaseAgentTypeConfig {
  agentType: 'plan';
  // Plan mode is enabled automatically via SDK's permissionMode: 'plan'
}

/**
 * Discriminated union of agent type configs
 */
export type AgentTypeConfig = FullAgentTypeConfig | ReviewAgentTypeConfig | PlanAgentTypeConfig;

/**
 * Options for creating a mission agent session
 */
export interface MissionAgentOptions {
  /** Session ID for the agent */
  sessionId: string;
  /** Agent type configuration */
  typeConfig: AgentTypeConfig;
  /** Claude model configuration */
  sessionConfig?: CanvasSessionConfig;
  /** Working directory for git operations */
  cwd?: string;
}

/**
 * Result from fetching a diff for review
 */
export interface DiffResult {
  success: boolean;
  diff: string;
  description: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  error?: string;
}

/**
 * Initialization context for review agents
 */
export interface ReviewInitContext {
  /** The fetched diff */
  diffResult: DiffResult;
  /** Description of what was reviewed */
  scopeDescription: string;
}

/**
 * Mission Agent - wraps CanvasAgent with type-specific initialization
 */
export interface MissionAgent {
  /** Unique session ID */
  readonly sessionId: string;
  /** Agent type */
  readonly agentType: AgentType;
  /** Underlying canvas agent */
  readonly agent: CanvasAgent;
  /** Review context (only for review agents) */
  readonly reviewContext?: ReviewInitContext;
  /** Whether the agent is in plan mode */
  readonly isPlanMode: boolean;

  // Event handlers
  onMessage(callback: (message: SDKMessage) => void): () => void;
  onToolRequest(callback: (request: McpToolRequest) => void): () => void;

  // Messaging
  sendMessage(message: string): void;
  sendMessageWithContext(message: string, context: string): void;

  // Lifecycle
  interrupt(): Promise<void>;
  dispose(): void;
}

// ============================================================================
// MISSION AGENT IMPLEMENTATION
// ============================================================================

/**
 * Internal implementation of MissionAgent
 */
class MissionAgentImpl implements MissionAgent {
  readonly sessionId: string;
  readonly agentType: AgentType;
  readonly agent: CanvasAgent;
  readonly reviewContext?: ReviewInitContext;
  readonly isPlanMode: boolean;

  private readonly emitter = new EventEmitter();
  private disposed = false;

  constructor(
    sessionId: string,
    agentType: AgentType,
    agent: CanvasAgent,
    reviewContext?: ReviewInitContext,
    isPlanMode = false
  ) {
    this.sessionId = sessionId;
    this.agentType = agentType;
    this.agent = agent;
    this.reviewContext = reviewContext;
    this.isPlanMode = isPlanMode;

    // Forward agent events
    agent.onMessage((message) => {
      this.emitter.emit('message', message);
    });

    agent.onToolRequest((request) => {
      this.emitter.emit('toolRequest', request);
    });
  }

  onMessage(callback: (message: SDKMessage) => void): () => void {
    this.emitter.on('message', callback);
    return () => {
      this.emitter.off('message', callback);
    };
  }

  onToolRequest(callback: (request: McpToolRequest) => void): () => void {
    this.emitter.on('toolRequest', callback);
    return () => {
      this.emitter.off('toolRequest', callback);
    };
  }

  sendMessage(message: string): void {
    if (this.disposed) {
      throw new Error('MissionAgent has been disposed');
    }
    this.agent.sendMessage(message);
  }

  sendMessageWithContext(message: string, context: string): void {
    if (this.disposed) {
      throw new Error('MissionAgent has been disposed');
    }
    const fullMessage = `${context}\n\n---\n\n${message}`;
    this.agent.sendMessage(fullMessage);
  }

  async interrupt(): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.agent.interrupt();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.agent.dispose();
    this.emitter.removeAllListeners();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a mission agent based on type configuration.
 *
 * Different agent types have different initialization:
 * - Full: Standard agent, ready for any task
 * - Review: Fetches git diff based on scope, sets up review context
 * - Plan: Enables plan mode for implementation planning
 *
 * @param options - Configuration for the mission agent
 * @returns MissionAgent instance ready to use
 *
 * @example
 * ```typescript
 * // Full agent
 * const fullAgent = await createMissionAgentSession({
 *   sessionId: 'agent-1',
 *   typeConfig: { id: '1', name: 'Coder', agentType: 'full' },
 * });
 *
 * // Review agent
 * const reviewAgent = await createMissionAgentSession({
 *   sessionId: 'agent-2',
 *   typeConfig: {
 *     id: '2',
 *     name: 'Reviewer',
 *     agentType: 'review',
 *     reviewScope: 'uncommitted',
 *   },
 *   cwd: '/path/to/repo',
 * });
 *
 * // Plan agent
 * const planAgent = await createMissionAgentSession({
 *   sessionId: 'agent-3',
 *   typeConfig: { id: '3', name: 'Planner', agentType: 'plan' },
 * });
 * ```
 */
export function createMissionAgentSession(options: MissionAgentOptions): MissionAgent {
  const { sessionId, typeConfig, sessionConfig } = options;

  logger.info(
    { sessionId, agentType: typeConfig.agentType, name: typeConfig.name },
    'Creating mission agent session'
  );

  switch (typeConfig.agentType) {
    case 'full':
      return createFullAgent(sessionId, sessionConfig);

    case 'review':
      return createReviewAgent(sessionId, typeConfig, sessionConfig);

    case 'plan':
      return createPlanAgent(sessionId, typeConfig, sessionConfig);

    default: {
      // Exhaustive check
      const _exhaustive: never = typeConfig;
      throw new Error(`Unknown agent type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ============================================================================
// TYPE-SPECIFIC CREATORS
// ============================================================================

/**
 * Create a full (general-purpose) agent
 */
function createFullAgent(sessionId: string, sessionConfig?: CanvasSessionConfig): MissionAgent {
  logger.info({ sessionId }, 'Creating full agent');

  const agent = createCanvasAgent(sessionId, sessionConfig);
  agent.startSession();

  return new MissionAgentImpl(sessionId, 'full', agent);
}

/**
 * Create a review agent with diff context
 */
function createReviewAgent(
  sessionId: string,
  typeConfig: ReviewAgentTypeConfig,
  sessionConfig?: CanvasSessionConfig
): MissionAgent {
  logger.info({ sessionId, reviewScope: typeConfig.reviewScope }, 'Creating review agent');

  // Fetch diff based on scope (placeholder - frontend provides actual diff)
  const diffResult = fetchDiff(typeConfig);

  if (!diffResult.success) {
    logger.warn({ sessionId, error: diffResult.error }, 'Failed to fetch diff for review agent');
  }

  const scopeDescription = getScopeDescription(typeConfig);

  const reviewContext: ReviewInitContext = {
    diffResult,
    scopeDescription,
  };

  // Create and start agent
  const agent = createCanvasAgent(sessionId, sessionConfig);
  agent.startSession();

  logger.info(
    {
      sessionId,
      filesChanged: diffResult.filesChanged,
      linesAdded: diffResult.linesAdded,
      linesRemoved: diffResult.linesRemoved,
    },
    'Review agent created with diff context'
  );

  return new MissionAgentImpl(sessionId, 'review', agent, reviewContext);
}

/**
 * Create a plan agent with plan mode enabled
 * Plan mode sets SDK's permissionMode to 'plan', restricting to read-only tools.
 */
function createPlanAgent(
  sessionId: string,
  _typeConfig: PlanAgentTypeConfig,
  sessionConfig?: CanvasSessionConfig
): MissionAgent {
  logger.info({ sessionId }, 'Creating plan agent with plan mode enabled');

  // Enable plan mode via session config
  // This sets permissionMode: 'plan' in the SDK options
  const planConfig: CanvasSessionConfig = {
    ...sessionConfig,
    planModeEnabled: true,
  };

  const agent = createCanvasAgent(sessionId, planConfig);
  agent.startSession();

  logger.info({ sessionId }, 'Plan agent created - SDK will restrict to read-only tools');

  return new MissionAgentImpl(sessionId, 'plan', agent, undefined, true);
}

// ============================================================================
// DIFF FETCHING
// ============================================================================

/**
 * Fetch diff based on review scope.
 * This is a placeholder implementation - the actual git operations
 * will be performed via Tauri commands from the frontend.
 */
function fetchDiff(config: ReviewAgentTypeConfig): DiffResult {
  // In the agent-bridge, we don't have direct access to git operations
  // The frontend will need to:
  // 1. Fetch the diff using Tauri commands
  // 2. Pass the diff result when sending the first message

  logger.debug(
    { scope: config.reviewScope },
    'Diff fetch placeholder - frontend will provide actual diff'
  );

  // Return empty result - frontend will populate this
  return {
    success: true,
    diff: '',
    description: `Waiting for ${config.reviewScope} diff from frontend`,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
  };
}

/**
 * Get human-readable description for review scope
 */
function getScopeDescription(config: ReviewAgentTypeConfig): string {
  switch (config.reviewScope) {
    case 'uncommitted':
      return 'all uncommitted changes (staged and unstaged)';
    case 'staged':
      return 'staged changes only';
    case 'branch':
      return `branch changes vs ${config.baseBranch ?? 'main'}`;
    case 'pr':
      return `pull request ${config.prRef ?? ''}`;
    case 'commit':
      return `commit ${config.commitSha?.substring(0, 7) ?? ''}`;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build context message for review agent with diff
 */
export function buildReviewContextMessage(
  reviewContext: ReviewInitContext,
  taskPrompt: string
): string {
  const { diffResult, scopeDescription } = reviewContext;

  if (!diffResult.success || diffResult.diff.length === 0) {
    return `No changes found for ${scopeDescription}.

${taskPrompt}`;
  }

  return `## Review Scope
Reviewing ${scopeDescription}

## Statistics
- Files changed: ${String(diffResult.filesChanged)}
- Lines added: ${String(diffResult.linesAdded)}
- Lines removed: ${String(diffResult.linesRemoved)}

## Diff
\`\`\`diff
${diffResult.diff}
\`\`\`

---

${taskPrompt}`;
}

/**
 * Build initial message for plan agent
 */
export function buildPlanModeMessage(userTask: string): string {
  return `I need help planning the implementation for the following task. Please analyze the requirements and create a detailed implementation plan before writing any code.

## Task
${userTask}

Please start by understanding the requirements and creating a step-by-step plan.`;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isFullAgentConfig(config: AgentTypeConfig): config is FullAgentTypeConfig {
  return config.agentType === 'full';
}

export function isReviewAgentConfig(config: AgentTypeConfig): config is ReviewAgentTypeConfig {
  return config.agentType === 'review';
}

export function isPlanAgentConfig(config: AgentTypeConfig): config is PlanAgentTypeConfig {
  return config.agentType === 'plan';
}
