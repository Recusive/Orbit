import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { OcProviderInfo } from '@/stores/opencode';
import type { OcProviderAuthAuthorization, OcProviderAuthMethod } from '@/types/opencode';

import { ProvidersSettings } from '@/components/modals/settings/pages/ProvidersSettings';
import { useBackendStore } from '@/stores/backend';
import { useOcProviderStore } from '@/stores/opencode';

const {
  mockAuthorizeProvider,
  mockCompleteProviderAuthorization,
  mockLoadProviders,
  mockOpen,
  mockSetProviderApiKey,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockAuthorizeProvider: vi.fn(),
  mockCompleteProviderAuthorization: vi.fn(),
  mockLoadProviders: vi.fn(),
  mockOpen: vi.fn(),
  mockSetProviderApiKey: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('@orbit/common/lib', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@opencode-ai/sdk/v2/client', () => ({
  createOrbitClient: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: mockOpen,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
  },
}));

vi.mock('@/services/opencode', () => ({
  ocSessionService: {
    authorizeProvider: mockAuthorizeProvider,
    completeProviderAuthorization: mockCompleteProviderAuthorization,
    loadProviders: mockLoadProviders,
    setProviderApiKey: mockSetProviderApiKey,
  },
}));

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createProvider(
  id: string,
  name: string,
  models: readonly { readonly id: string; readonly name: string }[]
): OcProviderInfo {
  return {
    id,
    name,
    env: [],
    models: Object.fromEntries(
      models.map((model) => [model.id, { id: model.id, name: model.name }])
    ),
  };
}

const API_KEY_METHOD: OcProviderAuthMethod = { type: 'api', label: 'API key' };
const OAUTH_METHOD: OcProviderAuthMethod = { type: 'oauth', label: 'Sign in' };

const OPENAI_PROVIDER = createProvider('openai', 'OpenAI', [{ id: 'gpt-5', name: 'GPT-5' }]);
const ANTHROPIC_PROVIDER = createProvider('anthropic', 'Anthropic', [
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
  { id: 'claude-opus-4', name: 'Claude Opus 4' },
]);
const GOOGLE_PROVIDER = createProvider('google', 'Google', [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
]);
const EMPTY_PROVIDER = createProvider('emptyco', 'EmptyCo', []);

interface ProviderStoreSeed {
  readonly authMethods?: Record<string, OcProviderAuthMethod[]>;
  readonly connectedProviders?: string[];
  readonly defaultModels?: Record<string, string>;
  readonly providers?: OcProviderInfo[];
}

function seedProviderStore({
  authMethods = {
    anthropic: [API_KEY_METHOD],
    google: [API_KEY_METHOD],
    openai: [API_KEY_METHOD],
  },
  connectedProviders = ['openai'],
  defaultModels = {
    anthropic: 'claude-sonnet-4',
    google: 'gemini-2.5-pro',
    openai: 'gpt-5',
  },
  providers = [OPENAI_PROVIDER, ANTHROPIC_PROVIDER, GOOGLE_PROVIDER],
}: ProviderStoreSeed = {}): void {
  useOcProviderStore.getState().clear();
  useOcProviderStore.getState().setProviders({
    providers,
    connectedProviders,
    defaultModels,
  });
  useOcProviderStore.getState().setAuthMethods(authMethods);
}

function resetStores(): void {
  localStorage.clear();
  useBackendStore.setState({
    activeBackend: 'opencode',
    opencodeHealthy: true,
    opencodePort: 4173,
    switchingBackend: false,
  });
  useOcProviderStore.getState().clear();
}

function getProviderRow(providerName: string): HTMLElement {
  const label = screen.getByText(providerName);
  const row = label.parentElement?.parentElement?.parentElement;
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Could not find provider row for ${providerName}`);
  }
  return row;
}

function renderProvidersSettings(): void {
  render(<ProvidersSettings />);
}

async function clickProviderPill(
  user: ReturnType<typeof userEvent.setup>,
  providerName: string,
  pillName: string
): Promise<void> {
  await user.click(within(getProviderRow(providerName)).getByRole('button', { name: pillName }));
}

async function resolveDeferred<T>(deferred: Deferred<T>, value: T): Promise<void> {
  await act(async () => {
    deferred.resolve(value);
    await Promise.resolve();
  });
}

describe('ProvidersSettings', () => {
  beforeEach(() => {
    resetStores();
    seedProviderStore();
    mockAuthorizeProvider.mockReset();
    mockCompleteProviderAuthorization.mockReset();
    mockLoadProviders.mockReset();
    mockOpen.mockReset();
    mockSetProviderApiKey.mockReset();
    mockToastSuccess.mockReset();

    mockAuthorizeProvider.mockResolvedValue({
      instructions: 'Open the provider URL and complete the sign-in flow.',
      method: 'code',
      url: 'https://example.com/oauth',
    } satisfies OcProviderAuthAuthorization);
    mockCompleteProviderAuthorization.mockResolvedValue(undefined);
    mockLoadProviders.mockResolvedValue(undefined);
    mockOpen.mockResolvedValue(undefined);
    mockSetProviderApiKey.mockResolvedValue(undefined);
  });

  it('shows loading feedback and the inline model picker after a successful API key save', async () => {
    const user = userEvent.setup();
    const saveDeferred = createDeferred<undefined>();
    mockSetProviderApiKey.mockImplementation(() => saveDeferred.promise);
    mockLoadProviders.mockImplementation(() => {
      seedProviderStore({ connectedProviders: ['openai', 'anthropic'] });
      return Promise.resolve();
    });

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'API key');
    await user.type(screen.getByPlaceholderText('Paste API key'), 'sk-ant-123');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled();

    await resolveDeferred(saveDeferred, undefined);

    expect(await screen.findByText('Pick a model to start chatting')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Paste API key')).not.toBeInTheDocument();
  });

  it('shows an inline error for a failed API key save and lets the user retry successfully', async () => {
    const user = userEvent.setup();
    mockSetProviderApiKey
      .mockRejectedValueOnce(new Error('Invalid API key'))
      .mockResolvedValueOnce(undefined);
    mockLoadProviders.mockImplementation(() => {
      seedProviderStore({ connectedProviders: ['openai', 'anthropic'] });
      return Promise.resolve();
    });

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'API key');
    const input = screen.getByPlaceholderText('Paste API key');
    await user.type(input, 'bad-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Invalid API key')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'good-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Pick a model to start chatting')).toBeInTheDocument();
    expect(screen.queryByText('Invalid API key')).not.toBeInTheDocument();
  });

  it('shows a dismissible banner when the API key saves but the provider refresh fails', async () => {
    const user = userEvent.setup();
    mockLoadProviders.mockRejectedValueOnce(new Error('refresh failed'));

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'API key');
    await user.type(screen.getByPlaceholderText('Paste API key'), 'sk-ant-123');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'API key saved, but failed to refresh providers. Please reopen settings.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Paste API key')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(
      screen.queryByText('API key saved, but failed to refresh providers. Please reopen settings.')
    ).not.toBeInTheDocument();
  });

  it('shows a banner when an OAuth auto-flow callback fails instead of leaving the waiting state stuck', async () => {
    const user = userEvent.setup();
    mockAuthorizeProvider.mockResolvedValueOnce({
      instructions: 'Continue in your browser.',
      method: 'auto',
      url: 'https://example.com/oauth',
    } satisfies OcProviderAuthAuthorization);
    mockCompleteProviderAuthorization.mockRejectedValueOnce(new Error('OAuth callback failed'));
    seedProviderStore({
      authMethods: {
        anthropic: [OAUTH_METHOD],
        google: [API_KEY_METHOD],
        openai: [API_KEY_METHOD],
      },
    });

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'Sign in');

    expect(await screen.findByText('OAuth callback failed')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for provider callback…')).not.toBeInTheDocument();
  });

  it('drops a late API key completion when the user cancels the form mid-save', async () => {
    const user = userEvent.setup();
    const saveDeferred = createDeferred<undefined>();
    mockSetProviderApiKey.mockImplementation(() => saveDeferred.promise);
    mockLoadProviders.mockImplementation(() => {
      seedProviderStore({ connectedProviders: ['openai', 'anthropic'] });
      return Promise.resolve();
    });

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'API key');
    await user.type(screen.getByPlaceholderText('Paste API key'), 'sk-ant-123');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await resolveDeferred(saveDeferred, undefined);
    await waitFor(() => {
      expect(mockLoadProviders).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText('Pick a model to start chatting')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Paste API key')).not.toBeInTheDocument();
  });

  it('keeps the new provider flow active when a different provider is opened during a stale save', async () => {
    const user = userEvent.setup();
    const saveDeferred = createDeferred<undefined>();
    mockSetProviderApiKey.mockImplementation(() => saveDeferred.promise);
    mockLoadProviders.mockImplementation(() => {
      seedProviderStore({ connectedProviders: ['openai', 'anthropic'] });
      return Promise.resolve();
    });

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'API key');
    await user.type(screen.getByPlaceholderText('Paste API key'), 'sk-ant-123');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await clickProviderPill(user, 'Google', 'API key');

    await resolveDeferred(saveDeferred, undefined);

    expect(screen.getByPlaceholderText('Paste API key')).toBeInTheDocument();
    expect(screen.queryByText('Pick a model to start chatting')).not.toBeInTheDocument();
    expect(within(getProviderRow('Google')).queryByRole('button', { name: 'API key' })).toBeNull();
  });

  it('updates the selected provider and model when the user picks a just-connected model', async () => {
    const user = userEvent.setup();
    mockLoadProviders.mockImplementation(() => {
      seedProviderStore({ connectedProviders: ['openai', 'anthropic'] });
      return Promise.resolve();
    });

    renderProvidersSettings();

    expect(useOcProviderStore.getState().selectedProviderId).toBe('openai');
    expect(useOcProviderStore.getState().selectedModelId).toBe('gpt-5');

    await clickProviderPill(user, 'Anthropic', 'API key');
    await user.type(screen.getByPlaceholderText('Paste API key'), 'sk-ant-123');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const modelButton = await screen.findByRole('button', { name: /Claude Opus 4/i });
    await user.click(modelButton);

    expect(useOcProviderStore.getState().selectedProviderId).toBe('anthropic');
    expect(useOcProviderStore.getState().selectedModelId).toBe('claude-opus-4');
    expect(mockToastSuccess).toHaveBeenCalledWith('Ready to chat with Claude Opus 4');
    expect(screen.queryByText('Pick a model to start chatting')).not.toBeInTheDocument();
  });

  it('shows the no-models edge case and allows dismissing the picker', async () => {
    const user = userEvent.setup();
    seedProviderStore({
      providers: [OPENAI_PROVIDER, EMPTY_PROVIDER],
      authMethods: {
        emptyco: [API_KEY_METHOD],
        openai: [API_KEY_METHOD],
      },
    });
    mockLoadProviders.mockImplementation(() => {
      seedProviderStore({
        providers: [OPENAI_PROVIDER, EMPTY_PROVIDER],
        authMethods: {
          emptyco: [API_KEY_METHOD],
          openai: [API_KEY_METHOD],
        },
        connectedProviders: ['openai', 'emptyco'],
        defaultModels: {
          openai: 'gpt-5',
        },
      });
      return Promise.resolve();
    });

    renderProvidersSettings();

    await clickProviderPill(user, 'EmptyCo', 'API key');
    await user.type(screen.getByPlaceholderText('Paste API key'), 'empty-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('No models available.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('No models available.')).not.toBeInTheDocument();
  });

  it('trims surrounding whitespace before saving an API key', async () => {
    const user = userEvent.setup();

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'API key');
    await user.type(screen.getByPlaceholderText('Paste API key'), '  sk-ant-trimmed  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockSetProviderApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-trimmed');
    });
  });

  it('shows the manual browser fallback during an OAuth auto-flow when opening the browser fails', async () => {
    const user = userEvent.setup();
    const callbackDeferred = createDeferred<undefined>();
    mockAuthorizeProvider.mockResolvedValueOnce({
      instructions: 'Continue in your browser.',
      method: 'auto',
      url: 'https://example.com/oauth',
    } satisfies OcProviderAuthAuthorization);
    mockCompleteProviderAuthorization.mockImplementation(() => callbackDeferred.promise);
    mockOpen.mockRejectedValueOnce(new Error('Browser blocked'));
    seedProviderStore({
      authMethods: {
        anthropic: [OAUTH_METHOD],
        google: [API_KEY_METHOD],
        openai: [API_KEY_METHOD],
      },
    });

    renderProvidersSettings();

    await clickProviderPill(user, 'Anthropic', 'Sign in');

    expect(await screen.findByText('Waiting for provider callback…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open browser manually' })).toBeInTheDocument();
    expect(mockOpen).toHaveBeenCalledWith('https://example.com/oauth');

    await user.click(screen.getByRole('button', { name: 'Open browser manually' }));
    expect(mockOpen).toHaveBeenCalledTimes(2);

    await resolveDeferred(callbackDeferred, undefined);
  });

  it('disables the OAuth pill while authorization is in flight to prevent duplicate requests', async () => {
    const user = userEvent.setup();
    const authorizeDeferred = createDeferred<OcProviderAuthAuthorization>();
    mockAuthorizeProvider.mockImplementation(() => authorizeDeferred.promise);
    seedProviderStore({
      authMethods: {
        anthropic: [OAUTH_METHOD],
        google: [API_KEY_METHOD],
        openai: [API_KEY_METHOD],
      },
    });

    renderProvidersSettings();

    const oauthButton = within(getProviderRow('Anthropic')).getByRole('button', {
      name: 'Sign in',
    });
    await user.click(oauthButton);

    await waitFor(() => {
      expect(oauthButton).toBeDisabled();
    });

    await user.click(oauthButton);

    expect(mockAuthorizeProvider).toHaveBeenCalledTimes(1);

    await act(async () => {
      authorizeDeferred.reject(new Error('stopped'));
      await Promise.resolve();
    });
  });
});
