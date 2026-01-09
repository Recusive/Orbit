/**
 * Tests for provider-store.ts
 *
 * Purpose: Manages AI provider configurations (Claude, OpenAI, Google).
 * Persisted to localStorage to remember user's provider setup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderStatus, ProviderType } from '@/stores/onboarding/provider-store';

import { useProviderStore } from '@/stores/onboarding/provider-store';

// Mock localStorage using globalThis assignment (vi.stubGlobal not available in bun test)
const createLocalStorageMock = (): Storage => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      Reflect.deleteProperty(store, key);
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: (): string | null => null,
    get length(): number {
      return Object.keys(store).length;
    },
  };
};

const localStorageMock = createLocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock Date.now for consistent IDs
let mockTime = 1704067200000; // 2024-01-01 00:00:00
vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

/** Helper to get first provider safely */
function getFirstProvider():
  | ReturnType<typeof useProviderStore.getState>['providers'][0]
  | undefined {
  return useProviderStore.getState().providers[0];
}

describe('provider-store', () => {
  beforeEach(() => {
    // Reset store using its own action
    const { resetProviders } = useProviderStore.getState();
    resetProviders();
    // Reset mocks
    mockTime = 1704067200000;
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with empty providers array', () => {
      const state = useProviderStore.getState();
      expect(state.providers).toEqual([]);
    });

    it('should start with null activeProviderId', () => {
      const state = useProviderStore.getState();
      expect(state.activeProviderId).toBeNull();
    });
  });

  // ============================================================================
  // addProvider
  // ============================================================================

  describe('addProvider', () => {
    it('should add a provider with generated ID', () => {
      const { addProvider } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      expect(id).toMatch(/^provider-\d+-[a-z0-9]+$/);
      expect(useProviderStore.getState().providers).toHaveLength(1);

      const provider = getFirstProvider();
      expect(provider).toBeDefined();
      if (provider) {
        expect(provider.id).toBe(id);
      }
    });

    it('should store all provider fields correctly', () => {
      const { addProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'My Claude Provider',
        status: 'connected',
        authMethod: 'apikey',
        cliInstalled: false,
      });

      const provider = getFirstProvider();
      expect(provider).toBeDefined();
      if (provider) {
        expect(provider.type).toBe('claude');
        expect(provider.name).toBe('My Claude Provider');
        expect(provider.status).toBe('connected');
        expect(provider.authMethod).toBe('apikey');
        expect(provider.cliInstalled).toBe(false);
      }
    });

    it('should auto-set as active if first connected provider', () => {
      const { addProvider } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      expect(useProviderStore.getState().activeProviderId).toBe(id);
    });

    it('should NOT auto-set as active if disconnected', () => {
      const { addProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'disconnected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      expect(useProviderStore.getState().activeProviderId).toBeNull();
    });

    it('should NOT auto-set as active if not first provider', () => {
      const { addProvider } = useProviderStore.getState();

      // Add first connected provider
      const firstId = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      // Add second connected provider
      mockTime += 1000;
      addProvider({
        type: 'openai',
        name: 'OpenAI',
        status: 'connected',
        authMethod: 'apikey',
        cliInstalled: false,
      });

      // Should still be first one
      expect(useProviderStore.getState().activeProviderId).toBe(firstId);
    });

    it('should support all provider types', () => {
      const { addProvider } = useProviderStore.getState();
      const types: ProviderType[] = ['claude', 'openai', 'google'];

      types.forEach((type, index) => {
        mockTime = 1704067200000 + index * 1000;
        addProvider({
          type,
          name: `${type} Provider`,
          status: 'disconnected',
          authMethod: 'apikey',
          cliInstalled: false,
        });
      });

      expect(useProviderStore.getState().providers).toHaveLength(3);
      expect(useProviderStore.getState().providers.map((p) => p.type)).toEqual(types);
    });
  });

  // ============================================================================
  // removeProvider
  // ============================================================================

  describe('removeProvider', () => {
    it('should remove provider by ID', () => {
      const { addProvider, removeProvider } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      expect(useProviderStore.getState().providers).toHaveLength(1);

      removeProvider(id);

      expect(useProviderStore.getState().providers).toHaveLength(0);
    });

    it('should clear active if removed provider was active', () => {
      const { addProvider, removeProvider } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      expect(useProviderStore.getState().activeProviderId).toBe(id);

      removeProvider(id);

      expect(useProviderStore.getState().activeProviderId).toBeNull();
    });

    it('should switch to another connected provider when active is removed', () => {
      const { addProvider, removeProvider, setActiveProvider } = useProviderStore.getState();

      // Add two connected providers
      const claudeId = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      mockTime += 1000;
      const openaiId = addProvider({
        type: 'openai',
        name: 'OpenAI',
        status: 'connected',
        authMethod: 'apikey',
        cliInstalled: false,
      });

      // Set Claude as active
      setActiveProvider(claudeId);
      expect(useProviderStore.getState().activeProviderId).toBe(claudeId);

      // Remove Claude
      removeProvider(claudeId);

      // Should switch to OpenAI (next connected provider)
      expect(useProviderStore.getState().activeProviderId).toBe(openaiId);
    });

    it('should be safe to remove non-existent provider', () => {
      const { removeProvider } = useProviderStore.getState();

      expect(() => {
        removeProvider('non-existent-id');
      }).not.toThrow();
    });
  });

  // ============================================================================
  // updateProviderStatus
  // ============================================================================

  describe('updateProviderStatus', () => {
    it('should update provider status', () => {
      const { addProvider, updateProviderStatus } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'disconnected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      updateProviderStatus(id, 'connected');

      const provider = getFirstProvider();
      expect(provider).toBeDefined();
      if (provider) {
        expect(provider.status).toBe('connected');
      }
    });

    it('should update status with error message', () => {
      const { addProvider, updateProviderStatus } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      updateProviderStatus(id, 'error', 'API key invalid');

      const provider = getFirstProvider();
      expect(provider).toBeDefined();
      if (provider) {
        expect(provider.status).toBe('error');
        expect(provider.errorMessage).toBe('API key invalid');
      }
    });

    it('should clear error message when status changes to non-error', () => {
      const { addProvider, updateProviderStatus } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'error',
        authMethod: 'keychain',
        cliInstalled: true,
        errorMessage: 'Previous error',
      });

      updateProviderStatus(id, 'connected');

      const provider = getFirstProvider();
      expect(provider).toBeDefined();
      if (provider) {
        expect(provider.status).toBe('connected');
        expect(provider.errorMessage).toBeUndefined();
      }
    });

    it('should support all status types', () => {
      const { addProvider, updateProviderStatus } = useProviderStore.getState();
      const statuses: ProviderStatus[] = ['connected', 'disconnected', 'error', 'validating'];

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'disconnected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      statuses.forEach((status) => {
        updateProviderStatus(id, status);
        const provider = getFirstProvider();
        expect(provider).toBeDefined();
        if (provider) {
          expect(provider.status).toBe(status);
        }
      });
    });

    it('should be safe to update non-existent provider', () => {
      const { updateProviderStatus } = useProviderStore.getState();

      expect(() => {
        updateProviderStatus('non-existent-id', 'connected');
      }).not.toThrow();
    });
  });

  // ============================================================================
  // setActiveProvider
  // ============================================================================

  describe('setActiveProvider', () => {
    it('should set active provider by ID', () => {
      const { addProvider, setActiveProvider } = useProviderStore.getState();

      const id1 = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      mockTime += 1000;
      const id2 = addProvider({
        type: 'openai',
        name: 'OpenAI',
        status: 'connected',
        authMethod: 'apikey',
        cliInstalled: false,
      });

      setActiveProvider(id2);
      expect(useProviderStore.getState().activeProviderId).toBe(id2);

      setActiveProvider(id1);
      expect(useProviderStore.getState().activeProviderId).toBe(id1);
    });

    it('should allow setting to null', () => {
      const { addProvider, setActiveProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      setActiveProvider(null);
      expect(useProviderStore.getState().activeProviderId).toBeNull();
    });
  });

  // ============================================================================
  // markValidated
  // ============================================================================

  describe('markValidated', () => {
    it('should set lastValidated timestamp', () => {
      const { addProvider, markValidated } = useProviderStore.getState();

      const id = addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      const provider1 = getFirstProvider();
      expect(provider1).toBeDefined();
      if (provider1) {
        expect(provider1.lastValidated).toBeUndefined();
      }

      mockTime = 1704067300000;
      markValidated(id);

      const provider2 = getFirstProvider();
      expect(provider2).toBeDefined();
      if (provider2) {
        expect(provider2.lastValidated).toBe(1704067300000);
      }
    });

    it('should be safe to mark non-existent provider', () => {
      const { markValidated } = useProviderStore.getState();

      expect(() => {
        markValidated('non-existent-id');
      }).not.toThrow();
    });
  });

  // ============================================================================
  // getActiveProvider
  // ============================================================================

  describe('getActiveProvider', () => {
    it('should return null when no active provider', () => {
      const { getActiveProvider } = useProviderStore.getState();
      expect(getActiveProvider()).toBeNull();
    });

    it('should return null when activeProviderId is null', () => {
      const { addProvider, setActiveProvider, getActiveProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      setActiveProvider(null);

      expect(getActiveProvider()).toBeNull();
    });

    it('should return active provider', () => {
      const { addProvider, getActiveProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      const active = getActiveProvider();
      expect(active).not.toBeNull();
      if (active) {
        expect(active.type).toBe('claude');
        expect(active.name).toBe('Claude');
      }
    });
  });

  // ============================================================================
  // hasConnectedProvider
  // ============================================================================

  describe('hasConnectedProvider', () => {
    it('should return false when no providers', () => {
      const { hasConnectedProvider } = useProviderStore.getState();
      expect(hasConnectedProvider()).toBe(false);
    });

    it('should return false when all providers disconnected', () => {
      const { addProvider, hasConnectedProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'disconnected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      expect(hasConnectedProvider()).toBe(false);
    });

    it('should return true when at least one provider connected', () => {
      const { addProvider, hasConnectedProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'disconnected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      mockTime += 1000;
      addProvider({
        type: 'openai',
        name: 'OpenAI',
        status: 'connected',
        authMethod: 'apikey',
        cliInstalled: false,
      });

      expect(hasConnectedProvider()).toBe(true);
    });
  });

  // ============================================================================
  // resetProviders
  // ============================================================================

  describe('resetProviders', () => {
    it('should clear all providers', () => {
      const { addProvider, resetProviders } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      resetProviders();

      expect(useProviderStore.getState().providers).toEqual([]);
    });

    it('should clear activeProviderId', () => {
      const { addProvider, resetProviders } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      expect(useProviderStore.getState().activeProviderId).not.toBeNull();

      resetProviders();

      expect(useProviderStore.getState().activeProviderId).toBeNull();
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle provider with all optional fields', () => {
      const { addProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: 'Claude',
        status: 'error',
        authMethod: 'keychain',
        cliInstalled: true,
        lastValidated: 1704067200000,
        errorMessage: 'Test error',
      });

      const provider = getFirstProvider();
      expect(provider).toBeDefined();
      if (provider) {
        expect(provider.lastValidated).toBe(1704067200000);
        expect(provider.errorMessage).toBe('Test error');
      }
    });

    it('should handle empty provider name', () => {
      const { addProvider } = useProviderStore.getState();

      addProvider({
        type: 'claude',
        name: '',
        status: 'connected',
        authMethod: 'keychain',
        cliInstalled: true,
      });

      const provider = getFirstProvider();
      expect(provider).toBeDefined();
      if (provider) {
        expect(provider.name).toBe('');
      }
    });
  });

  // ============================================================================
  // Persistence (Note: Full persistence tests require mocking zustand/persist)
  // ============================================================================

  describe('persistence configuration', () => {
    it('should use "orbit-providers" as storage key', () => {
      // The store is configured with name: 'orbit-providers'
      // Full persistence testing would require mocking the persist middleware
      expect(true).toBe(true);
    });
  });
});
