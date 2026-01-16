/**
 * Missions Store
 * Zustand store for missions state management with execution tracking
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { omit } from '../../lib/utils';
import { createAgentCard, createMission, createMissionConnection } from '../types';

import type {
  AgentCard,
  AgentExecutionResult,
  AgentExecutionState,
  AgentStatus,
  Mission,
  MissionConnection,
  MissionMetadata,
  MissionRun,
  MissionStatus,
} from '../types';

const logger = createLogger('MissionsStore');

// ============================================================================
// Sync State Types
// ============================================================================

type SyncStatus = 'idle' | 'saving' | 'loading' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSaveTime: number | null;
  lastError: string | null;
  isDirty: boolean;
}

// ============================================================================
// State Types
// ============================================================================

interface MissionsState {
  // Active mission
  activeMission: Mission | null;

  // Agents and connections (keyed by ID for fast lookup)
  agents: Record<string, AgentCard>;
  connections: Record<string, MissionConnection>;

  // Mission list (for sidebar)
  missionList: MissionMetadata[];
  missionListLoading: boolean;
  missionListError: string | null;

  // Selection state
  selectedAgentIds: string[];
  selectedConnectionIds: string[];
  focusedAgentId: string | null;

  // Execution tracking
  runningAgentIds: string[];
  pendingAgentIds: string[];
  completedAgentIds: string[];

  // UI state
  configPanelAgentId: string | null;

  // Sync state
  sync: SyncState;
}

interface MissionsActions {
  // Mission lifecycle
  createNewMission: (name: string, userId: string) => void;
  loadMission: (mission: Mission, agents: AgentCard[], connections: MissionConnection[]) => void;
  updateMission: (updates: Partial<Mission>) => void;
  clearMission: () => void;

  // Agent CRUD
  addAgent: (agent: Partial<AgentCard> & { id: string; createdBy: string }) => AgentCard;
  updateAgent: (agentId: string, updates: Partial<AgentCard>) => void;
  deleteAgent: (agentId: string) => void;
  duplicateAgent: (agentId: string) => AgentCard | null;

  // Agent execution state
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  appendAgentOutput: (agentId: string, chunk: string) => void;
  setAgentResult: (agentId: string, result: AgentExecutionResult) => void;
  setAgentError: (agentId: string, error: string) => void;
  clearAgentOutput: (agentId: string) => void;
  resetAgentExecution: (agentId: string) => void;

  // Connection CRUD
  addConnection: (
    connection: Partial<MissionConnection> & {
      id: string;
      sourceAgentId: string;
      targetAgentId: string;
      createdBy: string;
    }
  ) => MissionConnection;
  updateConnection: (connectionId: string, updates: Partial<MissionConnection>) => void;
  deleteConnection: (connectionId: string) => void;

  // Mission execution
  startMissionRun: () => MissionRun | null;
  completeMissionRun: (status: MissionStatus, error?: string) => void;
  setExecutionTracking: (running: string[], pending: string[], completed: string[]) => void;

  // Selection
  setSelectedAgents: (agentIds: string[]) => void;
  toggleAgentSelection: (agentId: string) => void;
  setSelectedConnections: (connectionIds: string[]) => void;
  clearSelection: () => void;
  setFocusedAgent: (agentId: string | null) => void;

  // UI actions
  setConfigPanelAgent: (agentId: string | null) => void;

  // Computed helpers
  getAgentsArray: () => AgentCard[];
  getConnectionsArray: () => MissionConnection[];
  getSelectedAgents: () => AgentCard[];
  getAgentDependencies: (agentId: string) => string[];
  getAgentDependents: (agentId: string) => string[];
  getEntryAgents: () => AgentCard[];
  getExecutionOrder: () => string[];
  buildAgentContext: (agentId: string) => string;

  // Sync actions
  setSyncStatus: (status: SyncStatus) => void;
  setSyncError: (error: string | null) => void;
  markSaved: () => void;
  markDirty: () => void;

  // Mission list actions
  setMissionList: (missions: MissionMetadata[]) => void;
  setMissionListLoading: (loading: boolean) => void;
  setMissionListError: (error: string | null) => void;
  removeMissionFromList: (missionId: string) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialSyncState: SyncState = {
  status: 'idle',
  lastSaveTime: null,
  lastError: null,
  isDirty: false,
};

const initialState: MissionsState = {
  activeMission: null,
  agents: {},
  connections: {},
  missionList: [],
  missionListLoading: false,
  missionListError: null,
  selectedAgentIds: [],
  selectedConnectionIds: [],
  focusedAgentId: null,
  runningAgentIds: [],
  pendingAgentIds: [],
  completedAgentIds: [],
  configPanelAgentId: null,
  sync: initialSyncState,
};

// ============================================================================
// Helper: Topological Sort for DAG Execution Order
// ============================================================================

function topologicalSort(
  agents: Record<string, AgentCard>,
  connections: Record<string, MissionConnection>
): string[] {
  const agentIds = Object.keys(agents);
  const inDegree: Record<string, number> = {};
  const adjacencyList: Record<string, string[]> = {};

  // Initialize
  for (const id of agentIds) {
    inDegree[id] = 0;
    adjacencyList[id] = [];
  }

  // Build graph
  for (const conn of Object.values(connections)) {
    if (agents[conn.sourceAgentId] !== undefined && agents[conn.targetAgentId] !== undefined) {
      const sourceList = adjacencyList[conn.sourceAgentId];
      if (sourceList !== undefined) {
        sourceList.push(conn.targetAgentId);
      }
      const targetDegree = inDegree[conn.targetAgentId];
      if (targetDegree !== undefined) {
        inDegree[conn.targetAgentId] = targetDegree + 1;
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const id of agentIds) {
    if (inDegree[id] === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    result.push(current);

    const neighbors = adjacencyList[current] ?? [];
    for (const neighbor of neighbors) {
      const currentDegree = inDegree[neighbor];
      if (currentDegree !== undefined) {
        inDegree[neighbor] = currentDegree - 1;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  // Check for cycles
  if (result.length !== agentIds.length) {
    // Has cycles - identify and warn about cyclic agents
    const processedSet = new Set(result);
    const cyclicAgentIds = agentIds.filter((id) => !processedSet.has(id));
    const cyclicAgentNames = cyclicAgentIds.map((id) => agents[id]?.name ?? id).join(', ');

    logger.warn(
      `Cycle detected in agent graph. The following agents are in a cycle and will be skipped: ${cyclicAgentNames}`,
      { cyclicAgentIds, totalAgents: agentIds.length, processedAgents: result.length }
    );

    return result;
  }

  return result;
}

// ============================================================================
// Store
// ============================================================================

export const useMissionsStore = create<MissionsState & MissionsActions>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ================================================================
    // Mission Lifecycle
    // ================================================================

    createNewMission: (name: string, userId: string): void => {
      const mission = createMission({
        id: `mission-${String(Date.now())}`,
        name,
        owner: userId,
      });
      set({
        activeMission: mission,
        agents: {},
        connections: {},
        selectedAgentIds: [],
        selectedConnectionIds: [],
        focusedAgentId: null,
        runningAgentIds: [],
        pendingAgentIds: [],
        completedAgentIds: [],
        sync: { ...get().sync, isDirty: true },
      });
    },

    loadMission: (
      mission: Mission,
      agents: AgentCard[],
      connections: MissionConnection[]
    ): void => {
      const agentsMap: Record<string, AgentCard> = {};
      for (const agent of agents) {
        agentsMap[agent.id] = agent;
      }

      const connectionsMap: Record<string, MissionConnection> = {};
      for (const connection of connections) {
        connectionsMap[connection.id] = connection;
      }

      set({
        activeMission: mission,
        agents: agentsMap,
        connections: connectionsMap,
        selectedAgentIds: [],
        selectedConnectionIds: [],
        focusedAgentId: null,
        runningAgentIds: [],
        pendingAgentIds: [],
        completedAgentIds: [],
        sync: { ...initialSyncState, status: 'idle' },
      });
    },

    updateMission: (updates: Partial<Mission>): void => {
      const { activeMission, sync } = get();
      if (activeMission === null) return;

      set({
        activeMission: {
          ...activeMission,
          ...updates,
          updatedAt: Date.now(),
        },
        sync: { ...sync, isDirty: true },
      });
    },

    clearMission: (): void => {
      set({
        activeMission: null,
        agents: {},
        connections: {},
        selectedAgentIds: [],
        selectedConnectionIds: [],
        focusedAgentId: null,
        runningAgentIds: [],
        pendingAgentIds: [],
        completedAgentIds: [],
        sync: initialSyncState,
      });
    },

    // ================================================================
    // Agent CRUD
    // ================================================================

    addAgent: (agentData): AgentCard => {
      const agent = createAgentCard(agentData);
      const { activeMission, sync } = get();

      set((state) => ({
        agents: { ...state.agents, [agent.id]: agent },
        activeMission:
          activeMission !== null
            ? {
                ...activeMission,
                agentIds: [...activeMission.agentIds, agent.id],
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      }));

      return agent;
    },

    updateAgent: (agentId: string, updates: Partial<AgentCard>): void => {
      const { agents, sync } = get();
      const agent = agents[agentId];
      if (agent === undefined) return;

      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            ...updates,
            updatedAt: Date.now(),
          },
        },
        sync: { ...sync, isDirty: true },
      }));
    },

    deleteAgent: (agentId: string): void => {
      const { agents, connections, activeMission, selectedAgentIds, sync } = get();

      // Remove agent
      const newAgents = Object.fromEntries(Object.entries(agents).filter(([id]) => id !== agentId));

      // Remove connections involving this agent
      const removedConnectionIds: string[] = [];
      const newConnections = Object.fromEntries(
        Object.entries(connections).filter(([connId, conn]) => {
          const shouldRemove = conn.sourceAgentId === agentId || conn.targetAgentId === agentId;
          if (shouldRemove) {
            removedConnectionIds.push(connId);
          }
          return !shouldRemove;
        })
      );

      set({
        agents: newAgents,
        connections: newConnections,
        selectedAgentIds: selectedAgentIds.filter((id) => id !== agentId),
        activeMission:
          activeMission !== null
            ? {
                ...activeMission,
                agentIds: activeMission.agentIds.filter((id) => id !== agentId),
                connectionIds: activeMission.connectionIds.filter(
                  (id) => !removedConnectionIds.includes(id)
                ),
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      });
    },

    duplicateAgent: (agentId: string): AgentCard | null => {
      const { agents } = get();
      const original = agents[agentId];
      if (original === undefined) return null;

      const newAgent = get().addAgent({
        id: `${agentId}-copy-${String(Date.now())}`,
        createdBy: original.createdBy,
        name: `${original.name} (Copy)`,
        prompt: original.prompt,
        promptMode: original.promptMode,
        config: { ...original.config },
        tags: [...original.tags],
        position: {
          x: original.position.x + 50,
          y: original.position.y + 50,
        },
      });

      return newAgent;
    },

    // ================================================================
    // Agent Execution State
    // ================================================================

    setAgentStatus: (agentId: string, status: AgentStatus): void => {
      const { agents } = get();
      const agent = agents[agentId];
      if (agent === undefined) return;

      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            execution: {
              ...agent.execution,
              status,
            },
          },
        },
      }));
    },

    appendAgentOutput: (agentId: string, chunk: string): void => {
      const { agents } = get();
      const agent = agents[agentId];
      if (agent === undefined) return;

      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            execution: {
              ...agent.execution,
              currentOutput: agent.execution.currentOutput + chunk,
              status: 'streaming',
            },
          },
        },
      }));
    },

    setAgentResult: (agentId: string, result: AgentExecutionResult): void => {
      const { agents } = get();
      const agent = agents[agentId];
      if (agent === undefined) return;

      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            execution: {
              ...agent.execution,
              status: 'complete',
              currentOutput: result.output,
              lastResult: result,
              executionHistory: [...agent.execution.executionHistory, result],
            },
          },
        },
      }));
    },

    setAgentError: (agentId: string, error: string): void => {
      const { agents } = get();
      const agent = agents[agentId];
      if (agent === undefined) return;

      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            execution: {
              ...agent.execution,
              status: 'error',
              errorMessage: error,
            },
          },
        },
      }));
    },

    clearAgentOutput: (agentId: string): void => {
      const { agents } = get();
      const agent = agents[agentId];
      if (agent === undefined) return;

      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            execution: {
              ...agent.execution,
              currentOutput: '',
            },
          },
        },
      }));
    },

    resetAgentExecution: (agentId: string): void => {
      const { agents } = get();
      const agent = agents[agentId];
      if (agent === undefined) return;

      // Build new execution state explicitly (required by exactOptionalPropertyTypes)
      const newExecution: AgentExecutionState = {
        status: 'idle',
        currentOutput: '',
        executionHistory: agent.execution.executionHistory,
      };
      // Only copy lastResult if it exists
      if (agent.execution.lastResult !== undefined) {
        newExecution.lastResult = agent.execution.lastResult;
      }

      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            execution: newExecution,
          },
        },
      }));
    },

    // ================================================================
    // Connection CRUD
    // ================================================================

    addConnection: (connectionData): MissionConnection => {
      const connection = createMissionConnection(connectionData);
      const { activeMission, sync } = get();

      set((state) => ({
        connections: { ...state.connections, [connection.id]: connection },
        activeMission:
          activeMission !== null
            ? {
                ...activeMission,
                connectionIds: [...activeMission.connectionIds, connection.id],
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      }));

      return connection;
    },

    updateConnection: (connectionId: string, updates: Partial<MissionConnection>): void => {
      const { connections, sync } = get();
      const connection = connections[connectionId];
      if (connection === undefined) return;

      set((state) => ({
        connections: {
          ...state.connections,
          [connectionId]: {
            ...connection,
            ...updates,
          },
        },
        sync: { ...sync, isDirty: true },
      }));
    },

    deleteConnection: (connectionId: string): void => {
      const { connections, activeMission, selectedConnectionIds, sync } = get();

      const newConnections = Object.fromEntries(
        Object.entries(connections).filter(([id]) => id !== connectionId)
      );

      set({
        connections: newConnections,
        selectedConnectionIds: selectedConnectionIds.filter((id) => id !== connectionId),
        activeMission:
          activeMission !== null
            ? {
                ...activeMission,
                connectionIds: activeMission.connectionIds.filter((id) => id !== connectionId),
                updatedAt: Date.now(),
              }
            : null,
        sync: { ...sync, isDirty: true },
      });
    },

    // ================================================================
    // Mission Execution
    // ================================================================

    startMissionRun: (): MissionRun | null => {
      const { activeMission, agents, connections, sync } = get();
      if (activeMission === null) return null;

      const run: MissionRun = {
        id: `run-${String(Date.now())}`,
        startedAt: Date.now(),
        status: 'running',
        agentResults: {},
        executionOrder: topologicalSort(agents, connections),
        totalTokensUsed: 0,
        totalDurationMs: 0,
      };

      // Reset all agent execution states
      const resetAgents: Record<string, AgentCard> = {};
      for (const [id, agent] of Object.entries(agents)) {
        // Build new execution state explicitly (required by exactOptionalPropertyTypes)
        const newExecution: AgentExecutionState = {
          status: 'pending',
          currentOutput: '',
          executionHistory: agent.execution.executionHistory,
        };
        // Only copy lastResult if it exists
        if (agent.execution.lastResult !== undefined) {
          newExecution.lastResult = agent.execution.lastResult;
        }
        resetAgents[id] = {
          ...agent,
          execution: newExecution,
        };
      }

      // Find entry agents (no dependencies)
      const entryAgentIds = get()
        .getEntryAgents()
        .map((a) => a.id);

      set({
        agents: resetAgents,
        activeMission: {
          ...activeMission,
          status: 'running',
          currentRun: run,
          entryAgentIds,
          updatedAt: Date.now(),
        },
        runningAgentIds: [],
        pendingAgentIds: run.executionOrder,
        completedAgentIds: [],
        sync: { ...sync, isDirty: true },
      });

      return run;
    },

    completeMissionRun: (status: MissionStatus, error?: string): void => {
      const { activeMission, agents, sync } = get();
      if (activeMission?.currentRun === undefined) return;

      // Collect all agent results
      const agentResults: Record<string, AgentExecutionResult> = {};
      let totalTokens = 0;
      for (const agent of Object.values(agents)) {
        if (agent.execution.lastResult !== undefined) {
          agentResults[agent.id] = agent.execution.lastResult;
          totalTokens += agent.execution.lastResult.tokensUsed;
        }
      }

      // Build completedRun explicitly (required by exactOptionalPropertyTypes)
      const completedRun: MissionRun = {
        id: activeMission.currentRun.id,
        startedAt: activeMission.currentRun.startedAt,
        completedAt: Date.now(),
        status,
        agentResults,
        executionOrder: activeMission.currentRun.executionOrder,
        totalTokensUsed: totalTokens,
        totalDurationMs: Date.now() - activeMission.currentRun.startedAt,
      };
      // Only add error if it exists
      if (error !== undefined) {
        completedRun.error = error;
      }

      // Build new mission without currentRun (required by exactOptionalPropertyTypes)
      const missionWithoutRun = omit(activeMission, 'currentRun');
      const updatedMission: Mission = {
        ...missionWithoutRun,
        status,
        runHistory: [...activeMission.runHistory, completedRun],
        updatedAt: Date.now(),
      };

      set({
        activeMission: updatedMission,
        runningAgentIds: [],
        pendingAgentIds: [],
        sync: { ...sync, isDirty: true },
      });
    },

    setExecutionTracking: (running: string[], pending: string[], completed: string[]): void => {
      set({
        runningAgentIds: running,
        pendingAgentIds: pending,
        completedAgentIds: completed,
      });
    },

    // ================================================================
    // Selection
    // ================================================================

    setSelectedAgents: (agentIds: string[]): void => {
      set({ selectedAgentIds: agentIds });
    },

    toggleAgentSelection: (agentId: string): void => {
      const { selectedAgentIds } = get();
      if (selectedAgentIds.includes(agentId)) {
        set({ selectedAgentIds: selectedAgentIds.filter((id) => id !== agentId) });
      } else {
        set({ selectedAgentIds: [...selectedAgentIds, agentId] });
      }
    },

    setSelectedConnections: (connectionIds: string[]): void => {
      set({ selectedConnectionIds: connectionIds });
    },

    clearSelection: (): void => {
      set({
        selectedAgentIds: [],
        selectedConnectionIds: [],
        focusedAgentId: null,
      });
    },

    setFocusedAgent: (agentId: string | null): void => {
      set({ focusedAgentId: agentId });
    },

    // ================================================================
    // UI Actions
    // ================================================================

    setConfigPanelAgent: (agentId: string | null): void => {
      set({ configPanelAgentId: agentId });
    },

    // ================================================================
    // Computed Helpers
    // ================================================================

    getAgentsArray: (): AgentCard[] => {
      return Object.values(get().agents);
    },

    getConnectionsArray: (): MissionConnection[] => {
      return Object.values(get().connections);
    },

    getSelectedAgents: (): AgentCard[] => {
      const { agents, selectedAgentIds } = get();
      return selectedAgentIds
        .map((id) => agents[id])
        .filter((agent): agent is AgentCard => agent !== undefined);
    },

    getAgentDependencies: (agentId: string): string[] => {
      const { connections } = get();
      return Object.values(connections)
        .filter((conn) => conn.targetAgentId === agentId)
        .sort((a, b) => a.priority - b.priority)
        .map((conn) => conn.sourceAgentId);
    },

    getAgentDependents: (agentId: string): string[] => {
      const { connections } = get();
      return Object.values(connections)
        .filter((conn) => conn.sourceAgentId === agentId)
        .map((conn) => conn.targetAgentId);
    },

    getEntryAgents: (): AgentCard[] => {
      const { agents, connections } = get();
      const hasIncoming = new Set(Object.values(connections).map((conn) => conn.targetAgentId));
      return Object.values(agents).filter((agent) => !hasIncoming.has(agent.id));
    },

    getExecutionOrder: (): string[] => {
      const { agents, connections } = get();
      return topologicalSort(agents, connections);
    },

    buildAgentContext: (agentId: string): string => {
      const { agents, connections } = get();
      const dependencies = get().getAgentDependencies(agentId);

      if (dependencies.length === 0) {
        return '';
      }

      const contextParts: string[] = [];
      for (const depId of dependencies) {
        const depAgent = agents[depId];
        const conn = Object.values(connections).find(
          (c) => c.sourceAgentId === depId && c.targetAgentId === agentId
        );

        if (depAgent === undefined || conn === undefined) continue;
        if (conn.contextFlow === 'none') continue;

        const output = depAgent.execution.currentOutput || depAgent.execution.lastResult?.output;
        if (output === undefined || output === '') continue;

        // Apply context flow settings
        let contextText = output;
        if (conn.contextFlow === 'filtered' && conn.contextFilter !== undefined) {
          // Limit regex pattern length to prevent ReDoS attacks
          const MAX_REGEX_LENGTH = 500;
          if (conn.contextFilter.length > MAX_REGEX_LENGTH) {
            // Pattern too long - fall back to full output
            contextText = output;
          } else {
            try {
              const regex = new RegExp(conn.contextFilter, 'g');
              const matches = output.match(regex);
              contextText = matches !== null ? matches.join('\n') : '';
            } catch {
              // Invalid regex - fall back to full output
              contextText = output;
            }
          }
        }

        if (conn.contextTransform !== undefined) {
          contextText = conn.contextTransform.replace('{{output}}', contextText);
        } else {
          contextText = `[From ${depAgent.name}]:\n${contextText}`;
        }

        contextParts.push(contextText);
      }

      return contextParts.join('\n\n---\n\n');
    },

    // ================================================================
    // Sync Actions
    // ================================================================

    setSyncStatus: (status: SyncStatus): void => {
      set((state) => ({
        sync: { ...state.sync, status },
      }));
    },

    setSyncError: (error: string | null): void => {
      set((state) => ({
        sync: {
          ...state.sync,
          status: error !== null ? 'error' : state.sync.status,
          lastError: error,
        },
      }));
    },

    markSaved: (): void => {
      set((state) => ({
        sync: {
          ...state.sync,
          status: 'idle',
          isDirty: false,
          lastSaveTime: Date.now(),
          lastError: null,
        },
      }));
    },

    markDirty: (): void => {
      set((state) => ({
        sync: { ...state.sync, isDirty: true },
      }));
    },

    // ================================================================
    // Mission List Actions
    // ================================================================

    setMissionList: (missions: MissionMetadata[]): void => {
      set({
        missionList: missions,
        missionListLoading: false,
        missionListError: null,
      });
    },

    setMissionListLoading: (loading: boolean): void => {
      set({ missionListLoading: loading });
    },

    setMissionListError: (error: string | null): void => {
      set({
        missionListError: error,
        missionListLoading: false,
      });
    },

    removeMissionFromList: (missionId: string): void => {
      set((state) => ({
        missionList: state.missionList.filter((m) => m.id !== missionId),
      }));
    },
  }))
);

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveMission = (state: MissionsState): Mission | null => state.activeMission;
export const selectAgents = (state: MissionsState): Record<string, AgentCard> => state.agents;
export const selectConnections = (state: MissionsState): Record<string, MissionConnection> =>
  state.connections;
export const selectSelectedAgentIds = (state: MissionsState): string[] => state.selectedAgentIds;
export const selectFocusedAgentId = (state: MissionsState): string | null => state.focusedAgentId;
export const selectRunningAgentIds = (state: MissionsState): string[] => state.runningAgentIds;
export const selectMissionList = (state: MissionsState): MissionMetadata[] => state.missionList;
export const selectSyncState = (state: MissionsState): SyncState => state.sync;

export type { SyncStatus, SyncState };
