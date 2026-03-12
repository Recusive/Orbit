import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { SubagentDefinition, WebviewMessage } from '@/types/protocol';

const logger = createLogger('SubagentsStore');

type PostMessage = (message: WebviewMessage) => void;

export interface SubagentsState {
  agents: SubagentDefinition[];
  isLoading: boolean;
  hasFetched: boolean;
  error: string | null;
  setAgents: (agents: SubagentDefinition[]) => void;
  addAgent: (agent: SubagentDefinition) => void;
  updateAgent: (agent: SubagentDefinition) => void;
  removeAgent: (name: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  markFetched: () => void;
  fetchSubagents: (postMessage: PostMessage) => void;
}

export const useSubagentsStore = create<SubagentsState>()(
  immer((set, get) => ({
    agents: [],
    isLoading: false,
    hasFetched: false,
    error: null,

    setAgents: (agents: SubagentDefinition[]) => {
      set((draft) => {
        draft.agents = agents;
      });
    },

    addAgent: (agent: SubagentDefinition) => {
      set((draft) => {
        draft.agents.push(agent);
      });
    },

    updateAgent: (agent: SubagentDefinition) => {
      set((draft) => {
        const index = draft.agents.findIndex((existing) => existing.name === agent.name);
        if (index >= 0) {
          draft.agents[index] = agent;
        }
      });
    },

    removeAgent: (name: string) => {
      set((draft) => {
        draft.agents = draft.agents.filter((agent) => agent.name !== name);
      });
    },

    setLoading: (loading: boolean) => {
      set((draft) => {
        draft.isLoading = loading;
      });
    },

    setError: (error: string | null) => {
      set((draft) => {
        draft.error = error;
        draft.isLoading = false;
      });
    },

    markFetched: () => {
      set((draft) => {
        draft.hasFetched = true;
        draft.isLoading = false;
        draft.error = null;
      });
    },

    fetchSubagents: (postMessage: PostMessage) => {
      const state = get();
      if (state.hasFetched || state.isLoading) {
        logger.debug('Subagents already fetched or loading, skipping');
        return;
      }

      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
      });

      postMessage({
        type: 'subagents:list',
        uuid: crypto.randomUUID(),
      });
    },
  }))
);

export const useSubagents = (): SubagentDefinition[] => useSubagentsStore((state) => state.agents);

export const useSubagentsLoading = (): boolean => useSubagentsStore((state) => state.isLoading);

export const useSubagentsHasFetched = (): boolean => useSubagentsStore((state) => state.hasFetched);

export const useSubagentsError = (): string | null => useSubagentsStore((state) => state.error);
