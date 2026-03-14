import { create } from 'zustand';

import type { OcProviderAuthMethod } from '@/types/opencode';

export interface OcProviderModel {
  readonly id: string;
  readonly name: string;
  readonly reasoning?: boolean;
  readonly variants?: Record<string, Record<string, unknown>>;
  readonly limit?: {
    readonly context: number;
    readonly input?: number;
    readonly output: number;
  };
}

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
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
  variantSelections: Record<string, string | undefined>;
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
  setSelectedVariant: (providerId: string, modelId: string, variant: string | undefined) => void;
  setSelectedAgent: (agent: 'build' | 'plan' | 'explore') => void;
  clear: () => void;
}

export const useOcProviderStore = create<OcProviderState>((set) => ({
  providers: [],
  connectedProviders: [],
  defaultModels: {},
  authMethods: {},
  variantSelections: {},
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
      const currentModelStillExists =
        fallbackProvider?.id === state.selectedProviderId &&
        state.selectedModelId !== null &&
        fallbackProvider.models[state.selectedModelId] !== undefined;
      const fallbackModelId = currentModelStillExists
        ? state.selectedModelId
        : fallbackProvider
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
  setSelectedVariant: (providerId, modelId, variant) => {
    set((state) => ({
      variantSelections: {
        ...state.variantSelections,
        [modelKey(providerId, modelId)]: variant,
      },
    }));
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
      variantSelections: {},
      selectedProviderId: null,
      selectedModelId: null,
      selectedAgent: 'build',
      isLoading: false,
    });
  },
}));

/**
 * Returns the context window size (in tokens) for the currently selected
 * OpenCode model, or 0 if no model is selected or limit data is unavailable.
 */
export const useOcSelectedModelContextLimit = (): number =>
  useOcProviderStore((state) => {
    if (state.selectedProviderId === null || state.selectedModelId === null) {
      return 0;
    }
    const provider = state.providers.find((p) => p.id === state.selectedProviderId);
    const model = provider?.models[state.selectedModelId];
    return model?.limit?.context ?? 0;
  });
