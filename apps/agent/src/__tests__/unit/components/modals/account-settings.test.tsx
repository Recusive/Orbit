import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@orbit/common/lib', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import { AccountSettings } from '@/components/modals/settings/pages/AccountSettings';
import { useAuthStore } from '@/stores/agent/auth-store';
import { useBackendStore } from '@/stores/backend';

interface MockState {
  preferredMethod: 'oauth' | 'apikey' | null;
  apiKey: string | null;
  keychainStatus: {
    hasCredentials: boolean;
    credentialType: string | null;
    expiresAt: number | null;
    entryExists: boolean;
    error: string | null;
  };
  validateResult: {
    valid: boolean;
    error: string | null;
  };
  setPreferredResult: {
    success: boolean;
    error: string | null;
  };
}

const mockState: MockState = {
  preferredMethod: 'oauth',
  apiKey: null,
  keychainStatus: {
    hasCredentials: true,
    credentialType: 'oauth',
    expiresAt: Date.now() + 60_000,
    entryExists: true,
    error: null,
  },
  validateResult: {
    valid: true,
    error: null,
  },
  setPreferredResult: {
    success: true,
    error: null,
  },
};

function resetStores(): void {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useBackendStore.setState({
    activeBackend: 'claude',
    opencodePort: null,
    opencodeHealthy: false,
    switchingBackend: false,
  });
}

function renderAccountSettings(): void {
  render(<AccountSettings />);
}

function getMethodCard(name: string): HTMLElement {
  return screen.getByRole('radio', { name: new RegExp(name, 'i') });
}

describe('AccountSettings', () => {
  beforeEach(() => {
    resetStores();
    mockState.preferredMethod = 'oauth';
    mockState.apiKey = null;
    mockState.keychainStatus = {
      hasCredentials: true,
      credentialType: 'oauth',
      expiresAt: Date.now() + 60_000,
      entryExists: true,
      error: null,
    };
    mockState.validateResult = {
      valid: true,
      error: null,
    };
    mockState.setPreferredResult = {
      success: true,
      error: null,
    };

    mockInvoke.mockReset();
    mockInvoke.mockImplementation(
      (command: string, args?: Record<string, unknown>): Promise<unknown> => {
        switch (command) {
          case 'check_claude_keychain':
            return Promise.resolve(mockState.keychainStatus);
          case 'retrieve_api_key':
            return Promise.resolve({ key: mockState.apiKey, error: null });
          case 'get_preferred_auth_method':
            return Promise.resolve(mockState.preferredMethod);
          case 'set_preferred_auth_method':
            if (mockState.setPreferredResult.success) {
              mockState.preferredMethod = args?.['method'] as MockState['preferredMethod'];
            }
            return Promise.resolve(mockState.setPreferredResult);
          case 'validate_api_key':
            return Promise.resolve(mockState.validateResult);
          case 'store_api_key':
            mockState.apiKey = args?.['key'] as string;
            return Promise.resolve({ success: true, error: null });
          case 'delete_api_key':
            mockState.apiKey = null;
            return Promise.resolve({ success: true, error: null });
          case 'trigger_claude_auth':
            return Promise.resolve({ success: true, error: null });
          default:
            return Promise.reject(new Error(`Unexpected command: ${command}`));
        }
      }
    );
  });

  it('renders radio cards for oauth and apikey', async () => {
    renderAccountSettings();

    expect(await screen.findByRole('radio', { name: /OAuth/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /API Key/i })).toBeInTheDocument();
  });

  it('shows the Preferred badge on the selected method', async () => {
    renderAccountSettings();

    const oauthCard = await screen.findByRole('radio', { name: /OAuth/i });
    expect(within(oauthCard).getByText('Preferred')).toBeInTheDocument();
    expect(screen.queryAllByText('Preferred')).toHaveLength(1);
  });

  it('shows a Using indicator when the preferred method differs from the active credential type', async () => {
    mockState.preferredMethod = 'apikey';
    mockState.apiKey = null;

    renderAccountSettings();

    const apiKeyCard = await screen.findByRole('radio', { name: /API Key/i });
    expect(
      within(apiKeyCard).getByText('Using OAuth because no API key is configured')
    ).toBeInTheDocument();
  });

  it('calls set_preferred_auth_method when the user switches methods', async () => {
    const user = userEvent.setup();
    mockState.apiKey = 'sk-ant-123456';

    renderAccountSettings();
    await screen.findByRole('radio', { name: /OAuth/i });

    await user.click(getMethodCard('API Key'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_preferred_auth_method', { method: 'apikey' });
    });
  });

  it('hides the auth method picker when the OpenCode backend is active', async () => {
    useBackendStore.setState({
      activeBackend: 'opencode',
      opencodePort: 4173,
      opencodeHealthy: true,
      switchingBackend: false,
    });

    renderAccountSettings();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_preferred_auth_method');
    });

    expect(screen.queryByRole('radiogroup', { name: /Claude authentication method/i })).toBeNull();
  });
});
