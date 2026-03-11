import { create } from 'zustand';

import type { OcProviderAuthMethod } from '@/types/opencode';

export interface OcProviderModel {
  readonly id: string;
  readonly name: string;
}

export interface OcProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly env: string[];
  readonly models: Record<string, OcProviderModel>;
}

interface OcProviderState {
  providers: OcProviderInfo[];
  connectedProviders: string[];
  defaultModels: Record<string, string>;
  authMethods: Record<string, OcProviderAuthMethod[]>;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  selectedAgent: 'build' | 'plan' | 'explore';
  isLoading: boolean;
  setLoading: (isLoading: boolean) => void;
  setProviders: (input: {
    providers: OcProviderInfo[];
    connectedProviders: string[];
    defaultModels: Record<string, string>;
  }) => void;
  setAuthMethods: (authMethods: Record<string, OcProviderAuthMethod[]>) => void;
  setSelectedProviderId: (providerId: string) => void;
  setSelectedModelId: (modelId: string | null) => void;
  setSelectedAgent: (agent: 'build' | 'plan' | 'explore') => void;
  clear: () => void;
}

export const useOcProviderStore = create<OcProviderState>((set) => ({
  providers: [],
  connectedProviders: [],
  defaultModels: {},
  authMethods: {},
  selectedProviderId: null,
  selectedModelId: null,
  selectedAgent: 'build',
  isLoading: false,
  setLoading: (isLoading) => {
    set({ isLoading });
  },
  setProviders: ({ providers, connectedProviders, defaultModels }) => {
    set((state) => {
      const fallbackProvider =
        providers.find((provider) => provider.id === state.selectedProviderId) ??
        providers.find((provider) => connectedProviders.includes(provider.id)) ??
        providers[0];
      const fallbackModelId = fallbackProvider
        ? (defaultModels[fallbackProvider.id] ?? Object.keys(fallbackProvider.models)[0] ?? null)
        : null;

      return {
        providers,
        connectedProviders,
        defaultModels,
        selectedProviderId: fallbackProvider?.id ?? null,
        selectedModelId: fallbackModelId,
      };
    });
  },
  setAuthMethods: (authMethods) => {
    set({ authMethods });
  },
  setSelectedProviderId: (providerId) => {
    set((state) => {
      const provider = state.providers.find((item) => item.id === providerId);
      return {
        selectedProviderId: providerId,
        selectedModelId: provider
          ? (state.defaultModels[providerId] ?? Object.keys(provider.models)[0] ?? null)
          : null,
      };
    });
  },
  setSelectedModelId: (selectedModelId) => {
    set({ selectedModelId });
  },
  setSelectedAgent: (selectedAgent) => {
    set({ selectedAgent });
  },
  clear: () => {
    set({
      providers: [],
      connectedProviders: [],
      defaultModels: {},
      authMethods: {},
      selectedProviderId: null,
      selectedModelId: null,
      selectedAgent: 'build',
      isLoading: false,
    });
  },
}));
