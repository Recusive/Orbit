import {
  applyResolvedClaudeAuthState,
  resolveClaudeAuthState,
  sanitizePreferredAuthMethod,
} from '@/lib/claude-auth';
import { useAuthStore } from '@/stores/agent/auth-store';

function resetStore(): void {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
}

function applyBootstrapState(args: {
  preferredMethod: 'oauth' | 'apikey' | null;
  hasApiKey: boolean;
  keychainStatus: {
    hasCredentials: boolean;
    credentialType: string | null;
    expiresAt: number | null;
    entryExists: boolean;
    error: string | null;
  };
}): ReturnType<typeof useAuthStore.getState> {
  const resolved = resolveClaudeAuthState(args);
  applyResolvedClaudeAuthState(useAuthStore.getState(), resolved);
  return useAuthStore.getState();
}

describe('tauri-provider auth bootstrap', () => {
  beforeEach(() => {
    resetStore();
  });

  it('uses the API key when apikey is preferred and a key exists', () => {
    const state = applyBootstrapState({
      preferredMethod: 'apikey',
      hasApiKey: true,
      keychainStatus: {
        hasCredentials: true,
        credentialType: 'oauth',
        expiresAt: Date.now() + 60_000,
        entryExists: true,
        error: null,
      },
    });

    expect(state.preferredMethod).toBe('apikey');
    expect(state.status).toBe('authenticated');
    expect(state.credentialType).toBe('apikey');
  });

  it('falls back to oauth when apikey is preferred but no key exists', () => {
    const expiresAt = Date.now() + 60_000;
    const state = applyBootstrapState({
      preferredMethod: 'apikey',
      hasApiKey: false,
      keychainStatus: {
        hasCredentials: true,
        credentialType: 'oauth',
        expiresAt,
        entryExists: true,
        error: null,
      },
    });

    expect(state.preferredMethod).toBe('apikey');
    expect(state.status).toBe('authenticated');
    expect(state.credentialType).toBe('oauth');
    expect(state.expiresAt).toBe(expiresAt);
  });

  it('reports expired oauth when apikey is preferred but oauth is the only fallback', () => {
    const expiresAt = Date.now() - 60_000;
    const state = applyBootstrapState({
      preferredMethod: 'apikey',
      hasApiKey: false,
      keychainStatus: {
        hasCredentials: false,
        credentialType: 'oauth',
        expiresAt,
        entryExists: true,
        error: 'OAuth expired',
      },
    });

    expect(state.preferredMethod).toBe('apikey');
    expect(state.status).toBe('expired');
    expect(state.credentialType).toBe('oauth');
    expect(state.lastError).toBe('OAuth expired');
  });

  it('sanitizes invalid stored preferences to the legacy null state', () => {
    expect(sanitizePreferredAuthMethod('garbage')).toBeNull();
    expect(sanitizePreferredAuthMethod('oauth')).toBe('oauth');
  });
});
