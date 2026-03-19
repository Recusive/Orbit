import { useAuthStore } from '@/stores/agent/auth-store';

function resetStore(): void {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
}

describe('auth-store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('prefers explicit authentication state when an API key is present', () => {
    useAuthStore.getState().setAuthenticated('apikey', null);

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.credentialType).toBe('apikey');
    expect(state.preferredMethod).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(state.lastError).toBeNull();
  });

  it('tracks recoverable OAuth expiry separately from missing credentials', () => {
    useAuthStore.getState().setExpired('Claude authentication expired.', true, Date.now() - 1_000);

    const state = useAuthStore.getState();
    expect(state.status).toBe('expired');
    expect(state.credentialType).toBe('oauth');
    expect(state.lastErrorCategory).toBe('REFRESH_FAILED');
    expect(state.recoverable).toBe(true);
  });

  it('tracks the preferred auth method separately from the active credential type', () => {
    useAuthStore.getState().setPreferredMethod('apikey');
    useAuthStore.getState().setAuthenticated('oauth', Date.now() + 60_000);

    const state = useAuthStore.getState();
    expect(state.preferredMethod).toBe('apikey');
    expect(state.credentialType).toBe('oauth');
  });

  it('records the no-credentials state without inventing a credential type', () => {
    useAuthStore.getState().setError('NO_CREDENTIALS', 'No credentials configured.', true, null);

    const state = useAuthStore.getState();
    expect(state.status).toBe('no_credentials');
    expect(state.credentialType).toBeNull();
    expect(state.lastErrorCategory).toBe('NO_CREDENTIALS');
  });
});
