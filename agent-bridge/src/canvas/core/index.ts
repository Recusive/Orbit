/**
 * Canvas Core Module
 */
export { CanvasAgent, createCanvasAgent } from './canvas-agent.js';
export type { CanvasAgentEvents } from './canvas-agent.js';

// Mission Agent Factory for multi-agent canvas
export {
  createMissionAgentSession,
  buildReviewContextMessage,
  buildPlanModeMessage,
  isFullAgentConfig,
  isReviewAgentConfig,
  isPlanAgentConfig,
} from './mission-agent-factory.js';
export type {
  AgentType,
  ReviewScope,
  FullAgentTypeConfig,
  ReviewAgentTypeConfig,
  PlanAgentTypeConfig,
  AgentTypeConfig,
  MissionAgentOptions,
  DiffResult,
  ReviewInitContext,
  MissionAgent,
} from './mission-agent-factory.js';
