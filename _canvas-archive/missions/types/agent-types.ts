/**
 * Agent Types
 *
 * Type definitions for the multi-agent canvas system.
 * Each agent type has distinct initialization behavior and configuration.
 *
 * Agent Types:
 * - Full: General-purpose coding agent (default)
 * - Review: Code review specialist that analyzes diffs
 * - Plan: Planning-first agent that creates implementation plans
 */

// ============================================================================
// Agent Type Enum
// ============================================================================

/**
 * Available agent types in the canvas system.
 * Each type has different initialization behavior.
 */
export type AgentType = 'full' | 'review' | 'plan';

/**
 * Display configuration for agent types
 */
export interface AgentTypeDisplayConfig {
  type: AgentType;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  colorDark: string;
  icon: 'code' | 'search' | 'list-todo';
}

export const AGENT_TYPE_CONFIGS: Record<AgentType, AgentTypeDisplayConfig> = {
  full: {
    type: 'full',
    label: 'Full Agent',
    shortLabel: 'Full',
    description: 'General-purpose coding agent. Can read, write, and execute code.',
    color: 'oklch(0.65 0.15 250)', // Blue
    colorDark: 'oklch(0.70 0.12 250)',
    icon: 'code',
  },
  review: {
    type: 'review',
    label: 'Review Agent',
    shortLabel: 'Review',
    description: 'Code review specialist. Analyzes diffs and provides structured feedback.',
    color: 'oklch(0.65 0.15 300)', // Purple
    colorDark: 'oklch(0.70 0.12 300)',
    icon: 'search',
  },
  plan: {
    type: 'plan',
    label: 'Plan Agent',
    shortLabel: 'Plan',
    description: 'Planning-first agent. Creates implementation plans before coding.',
    color: 'oklch(0.65 0.15 145)', // Green
    colorDark: 'oklch(0.70 0.12 145)',
    icon: 'list-todo',
  },
};

// ============================================================================
// Review Scope
// ============================================================================

/**
 * Review scope determines what git changes to analyze.
 */
export type ReviewScope =
  | 'uncommitted' // Unstaged + staged changes (git diff + git diff --cached)
  | 'staged' // Staged changes only (git diff --cached)
  | 'branch' // Current branch vs main/master (git diff main...HEAD)
  | 'pr' // Pull request diff (requires PR reference)
  | 'commit'; // Specific commit(s) (git show <sha>)

/**
 * Display configuration for review scopes
 */
export interface ReviewScopeConfig {
  scope: ReviewScope;
  label: string;
  description: string;
  requiresAdditionalInput: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
}

export const REVIEW_SCOPE_CONFIGS: Record<ReviewScope, ReviewScopeConfig> = {
  uncommitted: {
    scope: 'uncommitted',
    label: 'Uncommitted Changes',
    description: 'All unstaged and staged changes in the working directory',
    requiresAdditionalInput: false,
  },
  staged: {
    scope: 'staged',
    label: 'Staged Changes',
    description: 'Only changes that have been staged for commit',
    requiresAdditionalInput: false,
  },
  branch: {
    scope: 'branch',
    label: 'Branch Diff',
    description: 'Compare current branch against main/master',
    requiresAdditionalInput: false,
  },
  pr: {
    scope: 'pr',
    label: 'Pull Request',
    description: 'Analyze a specific pull request',
    requiresAdditionalInput: true,
    inputLabel: 'PR Number or URL (optional)',
    inputPlaceholder: 'Leave empty for current branch PR',
  },
  commit: {
    scope: 'commit',
    label: 'Specific Commit',
    description: 'Analyze changes in a specific commit',
    requiresAdditionalInput: true,
    inputLabel: 'Commit SHA',
    inputPlaceholder: 'abc123 or abc123..def456',
  },
};

// ============================================================================
// Type-Specific Configurations
// ============================================================================

/**
 * Base configuration shared by all agent types.
 * Extended by specific agent type configs.
 */
interface BaseAgentTypeConfig {
  /** Unique identifier for this agent */
  id: string;
  /** Display name for this agent */
  name: string;
  /** The type of agent - discriminant for the union */
  agentType: AgentType;
}

/**
 * Full Agent configuration.
 * General-purpose agent with no special initialization.
 */
export interface FullAgentTypeConfig extends BaseAgentTypeConfig {
  agentType: 'full';
  // No additional configuration needed
}

/**
 * Review Agent configuration.
 * Includes review scope and related settings.
 */
export interface ReviewAgentTypeConfig extends BaseAgentTypeConfig {
  agentType: 'review';
  /** What changes to review */
  reviewScope: ReviewScope;
  /** Base branch for 'branch' scope (default: "main") */
  baseBranch?: string;
  /** PR reference for 'pr' scope (number or URL) */
  prRef?: string;
  /** Commit SHA or range for 'commit' scope */
  commitSha?: string;
}

/**
 * Plan Agent configuration.
 * Starts in plan mode for implementation planning.
 * Plan mode restricts the agent to read-only tools until it creates a plan.
 */
export interface PlanAgentTypeConfig extends BaseAgentTypeConfig {
  agentType: 'plan';
  // Plan mode is enabled automatically for this agent type
  // No additional configuration needed
}

/**
 * Discriminated union of all agent type configurations.
 * Use this type when you need to handle any agent type.
 */
export type AgentTypeConfig = FullAgentTypeConfig | ReviewAgentTypeConfig | PlanAgentTypeConfig;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if config is for a Full Agent
 */
export function isFullAgentConfig(config: AgentTypeConfig): config is FullAgentTypeConfig {
  return config.agentType === 'full';
}

/**
 * Check if config is for a Review Agent
 */
export function isReviewAgentConfig(config: AgentTypeConfig): config is ReviewAgentTypeConfig {
  return config.agentType === 'review';
}

/**
 * Check if config is for a Plan Agent
 */
export function isPlanAgentConfig(config: AgentTypeConfig): config is PlanAgentTypeConfig {
  return config.agentType === 'plan';
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a default Full Agent configuration
 */
export function createFullAgentConfig(id: string, name: string): FullAgentTypeConfig {
  return {
    id,
    name,
    agentType: 'full',
  };
}

/**
 * Create a default Review Agent configuration
 */
export function createReviewAgentConfig(
  id: string,
  name: string,
  reviewScope: ReviewScope = 'uncommitted'
): ReviewAgentTypeConfig {
  return {
    id,
    name,
    agentType: 'review',
    reviewScope,
    baseBranch: 'main',
  };
}

/**
 * Create a default Plan Agent configuration
 */
export function createPlanAgentConfig(id: string, name: string): PlanAgentTypeConfig {
  return {
    id,
    name,
    agentType: 'plan',
  };
}

/**
 * Create agent type config based on type
 */
export function createAgentTypeConfig(type: AgentType, id: string, name: string): AgentTypeConfig {
  switch (type) {
    case 'full':
      return createFullAgentConfig(id, name);
    case 'review':
      return createReviewAgentConfig(id, name);
    case 'plan':
      return createPlanAgentConfig(id, name);
  }
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get display configuration for an agent type
 */
export function getAgentTypeDisplayConfig(type: AgentType): AgentTypeDisplayConfig {
  return AGENT_TYPE_CONFIGS[type];
}

/**
 * Get display configuration for a review scope
 */
export function getReviewScopeConfig(scope: ReviewScope): ReviewScopeConfig {
  return REVIEW_SCOPE_CONFIGS[scope];
}

/**
 * Get available review scopes as an array
 */
export function getReviewScopeOptions(): ReviewScopeConfig[] {
  return Object.values(REVIEW_SCOPE_CONFIGS);
}

/**
 * Get available agent types as an array
 */
export function getAgentTypeOptions(): AgentTypeDisplayConfig[] {
  return Object.values(AGENT_TYPE_CONFIGS);
}
