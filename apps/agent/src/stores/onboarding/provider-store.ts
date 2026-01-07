import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

/**
 * AI provider type.
 * For MVP, only 'claude' is fully supported.
 */
export type ProviderType = 'claude' | 'openai' | 'google';

/**
 * Provider connection status.
 */
export type ProviderStatus = 'connected' | 'disconnected' | 'error' | 'validating';

/**
 * How the provider was authenticated.
 */
export type AuthMethod = 'keychain' | 'apikey';

/**
 * AI provider configuration.
 */
export interface Provider {
  /** Unique provider ID */
  id: string;
  /** Provider type */
  type: ProviderType;
  /** Display name */
  name: string;
  /** Connection status */
  status: ProviderStatus;
  /** How the user authenticated */
  authMethod: AuthMethod;
  /** Whether the CLI is installed (for CLI-based providers) */
  cliInstalled: boolean;
  /** Last time credentials were validated */
  lastValidated?: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

/**
 * Provider store state.
 */
interface ProviderState {
  /** Configured providers */
  providers: Provider[];
  /** Currently active provider ID */
  activeProviderId: string | null;
}

/**
 * Provider store actions.
 */
interface ProviderActions {
  /** Add a new provider */
  addProvider: (provider: Omit<Provider, 'id'>) => string;
  /** Remove a provider by ID */
  removeProvider: (id: string) => void;
  /** Update a provider's status */
  updateProviderStatus: (id: string, status: ProviderStatus, errorMessage?: string) => void;
  /** Set the active provider */
  setActiveProvider: (id: string | null) => void;
  /** Update a provider's last validated timestamp */
  markValidated: (id: string) => void;
  /** Get the active provider */
  getActiveProvider: () => Provider | null;
  /** Check if any provider is connected */
  hasConnectedProvider: () => boolean;
  /** Reset all providers */
  resetProviders: () => void;
}

const initialState: ProviderState = {
  providers: [],
  activeProviderId: null,
};

/**
 * Generate a unique ID for a provider.
 */
function generateProviderId(): string {
  return `provider-${Date.now().toString()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Store for managing AI provider configurations.
 * Persisted to localStorage to remember user's provider setup.
 */
export const useProviderStore = create<ProviderState & ProviderActions>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      addProvider: (providerData): string => {
        const id = generateProviderId();
        set((state) => {
          const provider: Provider = {
            ...providerData,
            id,
          };
          state.providers.push(provider);
          // Auto-set as active if it's the first connected provider
          if (provider.status === 'connected' && state.activeProviderId === null) {
            state.activeProviderId = id;
          }
        });
        return id;
      },

      removeProvider: (id): void => {
        set((state) => {
          const index = state.providers.findIndex((p) => p.id === id);
          if (index !== -1) {
            state.providers.splice(index, 1);
          }
          // Clear active if we removed the active provider
          if (state.activeProviderId === id) {
            const connectedProvider = state.providers.find((p) => p.status === 'connected');
            state.activeProviderId = connectedProvider !== undefined ? connectedProvider.id : null;
          }
        });
      },

      updateProviderStatus: (id, status, errorMessage): void => {
        set((state) => {
          const provider = state.providers.find((p) => p.id === id);
          if (provider !== undefined) {
            provider.status = status;
            if (errorMessage !== undefined) {
              provider.errorMessage = errorMessage;
            } else {
              delete provider.errorMessage;
            }
          }
        });
      },

      setActiveProvider: (id): void => {
        set((state) => {
          state.activeProviderId = id;
        });
      },

      markValidated: (id): void => {
        set((state) => {
          const provider = state.providers.find((p) => p.id === id);
          if (provider !== undefined) {
            provider.lastValidated = Date.now();
          }
        });
      },

      getActiveProvider: (): Provider | null => {
        const { providers, activeProviderId } = get();
        if (activeProviderId === null) return null;
        return providers.find((p) => p.id === activeProviderId) ?? null;
      },

      hasConnectedProvider: (): boolean => {
        const { providers } = get();
        return providers.some((p) => p.status === 'connected');
      },

      resetProviders: (): void => {
        set((state) => {
          state.providers = [];
          state.activeProviderId = null;
        });
      },
    })),
    {
      name: 'orbit-providers',
    }
  )
);
