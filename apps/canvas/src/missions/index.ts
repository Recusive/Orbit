/**
 * Missions Module
 * AI Agent Orchestration mode for the Canvas app
 *
 * This module provides:
 * - MissionsCanvas: Main ReactFlow canvas with agent cards
 * - Zustand stores for missions and UI state
 * - Type definitions for agents, missions, and connections
 */

// Main canvas component
export { MissionsCanvas } from './components';

// Stores
export {
  useMissionsStore,
  useMissionsUIStore,
  selectActiveRightPanel,
  selectFocusedAgentId,
} from './stores';

// Types
export type {
  AgentCard,
  AgentCardNodeData,
  AgentConfig,
  AgentExecutionResult,
  AgentExecutionState,
  AgentModel,
  AgentModelConfig,
  AgentStatus,
  Mission,
  MissionConnection,
  MissionEdgeData,
  MissionRightPanelTab,
  MissionStatus,
} from './types';

// Type helpers
export {
  AGENT_MODEL_CONFIGS,
  createAgentCard,
  createMission,
  createMissionConnection,
  getAgentModelConfig,
} from './types';
