/**
 * Orchestrator module exports
 *
 * Provides types and hooks for sub-agent orchestration
 */

// Types
export type {
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
  ConflictType,
  ConflictSeverity,
  ConflictStrategy,
  Conflict,
  Resolution,
  OrchestratorControlAction,
  CanvasSnapshot,
  NodeSnapshot,
  EdgeSnapshot,
  ViewportState,
  BlackboardSlice,
  Constraint,
} from './types';

// Hooks
export { useOrchestratorStatus } from './useOrchestratorStatus';

export type { OrchestratorCallbacks, UseOrchestratorStatusReturn } from './useOrchestratorStatus';

// UI Components
export { OrchestratorProgress } from './OrchestratorProgress';
export type { OrchestratorProgressProps } from './OrchestratorProgress';

export { SubAgentStatusBadge, SubAgentStatusList } from './SubAgentStatusBadge';
export type { SubAgentStatusBadgeProps, SubAgentStatusListProps } from './SubAgentStatusBadge';

export { ConflictResolutionDialog } from './ConflictResolutionDialog';
export type { ConflictResolutionDialogProps, ResolutionOption } from './ConflictResolutionDialog';
