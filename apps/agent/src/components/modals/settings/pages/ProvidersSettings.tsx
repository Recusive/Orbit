import { createLogger } from '@orbit/common/lib';
import { open } from '@tauri-apps/plugin-shell';
import { Check, ExternalLink, KeyRound, Loader2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { SectionHeader } from '../components';

import type { OcProviderAuthMethod } from '@/types/opencode';
import type { Dispatch, FC, ReactNode, SetStateAction } from 'react';

import staticProviders from '@/data/opencode-providers.json';
import { ocSessionService } from '@/services/opencode';
import { useActiveBackend, useOpencodeHealthy } from '@/stores/backend';
import { useOcProviderStore } from '@/stores/opencode';

const logger = createLogger('ProvidersSettings');

interface ProviderAuthState {
  readonly providerId: string | null;
  readonly methodIndex: number | null;
  readonly mode: 'api' | 'oauth-code' | 'oauth-auto' | null;
  readonly instructions: string | null;
  readonly url: string | null;
}

const EMPTY_AUTH: ProviderAuthState = {
  providerId: null,
  methodIndex: null,
  mode: null,
  instructions: null,
  url: null,
};

function renderAuthFlow(
  authState: ProviderAuthState,
  apiKey: string,
  setApiKey: Dispatch<SetStateAction<string>>,
  oauthCode: string,
  setOauthCode: Dispatch<SetStateAction<string>>,
  handleSaveApiKey: () => Promise<void>,
  handleSubmitOauth: () => Promise<void>,
  dismissAuth: () => void,
  isSaving: boolean,
  inlineError: string | null
): ReactNode {
  if (authState.mode === 'api') {
    return (
      <div className="space-y-2.5">
        <input
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && apiKey.trim().length > 0 && !isSaving) {
              event.preventDefault();
              void handleSaveApiKey();
            }
            if (event.key === 'Escape') dismissAuth();
          }}
          autoFocus
          placeholder="Paste API key"
          className="liquid-glass-textarea w-full text-[12px]"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={dismissAuth}
            className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer text-[12px] transition-transform duration-75 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || apiKey.trim().length === 0}
            onClick={handleSaveApiKey}
            className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer text-[12px] transition-transform duration-75 active:scale-[0.97]"
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Saving...
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
        {inlineError !== null ? (
          <p className="text-[11px] leading-relaxed text-destructive">{inlineError}</p>
        ) : null}
      </div>
    );
  }

  if (authState.mode === 'oauth-code') {
    return (
      <div className="space-y-2.5">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {authState.instructions ?? 'Open the provider URL and paste the returned code.'}
        </p>
        {authState.url ? (
          <button
            type="button"
            onClick={() => {
              if (authState.url) void open(authState.url);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-control-fill px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97]"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Open browser
          </button>
        ) : null}
        <input
          value={oauthCode}
          onChange={(event) => {
            setOauthCode(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && oauthCode.trim().length > 0 && !isSaving) {
              event.preventDefault();
              void handleSubmitOauth();
            }
            if (event.key === 'Escape') dismissAuth();
          }}
          autoFocus
          placeholder="Paste authorization code"
          className="liquid-glass-textarea w-full text-[12px]"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={dismissAuth}
            className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer text-[12px] transition-transform duration-75 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || oauthCode.trim().length === 0}
            onClick={handleSubmitOauth}
            className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer text-[12px] transition-transform duration-75 active:scale-[0.97]"
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Saving...
              </span>
            ) : (
              'Submit'
            )}
          </button>
        </div>
        {inlineError !== null ? (
          <p className="text-[11px] leading-relaxed text-destructive">{inlineError}</p>
        ) : null}
      </div>
    );
  }

  if (authState.mode === 'oauth-auto') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
          <span className="text-[11px] text-muted-foreground">Waiting for provider callback…</span>
          <button
            type="button"
            onClick={dismissAuth}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        {authState.url !== null ? (
          <button
            type="button"
            onClick={() => {
              if (authState.url) void open(authState.url);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-control-fill px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97]"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Open browser manually
          </button>
        ) : null}
        {authState.instructions !== null ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {authState.instructions}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}

interface JustConnectedModelPickerProps {
  readonly models: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly onDismiss: () => void;
  readonly onSelect: (modelId: string, modelName: string) => void;
}

function renderJustConnectedModelPicker({
  models,
  onDismiss,
  onSelect,
}: JustConnectedModelPickerProps): ReactNode {
  return (
    <div className="mt-3 ml-[1.625rem] rounded-xl bg-primary/5 px-3 py-3 ring-1 ring-primary/10">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-foreground">Pick a model to start chatting</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Your provider is connected. Choose the model you want in the chat input.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      {models.length === 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          No models available.
        </p>
      ) : (
        <div className="mt-3 max-h-[200px] space-y-1 overflow-y-auto pr-1">
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onSelect(model.id, model.name);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2 text-left transition-colors hover:bg-background"
            >
              <span className="truncate text-[12px] font-medium text-foreground">{model.name}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Select
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly modelCount: number;
}

export const ProvidersSettings: FC = () => {
  const activeBackend = useActiveBackend();
  const opencodeHealthy = useOpencodeHealthy();
  const providers = useOcProviderStore((state) => state.providers);
  const connectedProviders = useOcProviderStore((state) => state.connectedProviders);
  const authMethods = useOcProviderStore((state) => state.authMethods);
  const defaultModels = useOcProviderStore((state) => state.defaultModels);
  const isLoading = useOcProviderStore((state) => state.isLoading);
  const [authState, setAuthState] = useState<ProviderAuthState>(EMPTY_AUTH);
  const [apiKey, setApiKey] = useState('');
  const [oauthCode, setOauthCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [justConnectedId, setJustConnectedId] = useState<string | null>(null);
  const authRequestRef = useRef(0);

  const catalog = useMemo((): readonly CatalogEntry[] => {
    if (activeBackend === 'opencode') {
      return providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        modelCount: Object.keys(provider.models).length,
      }));
    }

    return staticProviders.providers as CatalogEntry[];
  }, [activeBackend, providers]);

  const connected = useMemo(
    () => catalog.filter((p) => connectedProviders.includes(p.id)),
    [catalog, connectedProviders]
  );
  const available = useMemo(
    () => catalog.filter((p) => !connectedProviders.includes(p.id)),
    [catalog, connectedProviders]
  );

  function beginAuthRequest(): number {
    authRequestRef.current += 1;
    return authRequestRef.current;
  }

  function invalidateAuthRequest(): void {
    authRequestRef.current += 1;
  }

  function isCurrentAuthRequest(id: number): boolean {
    return authRequestRef.current === id;
  }

  function dismissAuth(): void {
    invalidateAuthRequest();
    setApiKey('');
    setOauthCode('');
    setAuthState(EMPTY_AUTH);
    setInlineError(null);
    setIsSaving(false);
    setIsAuthorizing(false);
  }

  async function handleAuthMethod(
    providerId: string,
    method: OcProviderAuthMethod,
    index: number
  ): Promise<void> {
    invalidateAuthRequest();
    setIsSaving(false);
    setIsAuthorizing(false);
    setJustConnectedId(null);
    setInlineError(null);
    setBannerError(null);

    if (method.type === 'api') {
      setAuthState({ providerId, methodIndex: index, mode: 'api', instructions: null, url: null });
      return;
    }

    const requestId = beginAuthRequest();
    setIsAuthorizing(true);

    try {
      const auth = await ocSessionService.authorizeProvider(providerId, index);
      if (!isCurrentAuthRequest(requestId)) {
        return;
      }

      setIsAuthorizing(false);
      setAuthState({
        providerId,
        methodIndex: index,
        mode: auth.method === 'code' ? 'oauth-code' : 'oauth-auto',
        instructions: auth.instructions,
        url: auth.url,
      });

      if (auth.method === 'auto') {
        void open(auth.url).catch(() => {
          // Leave the inline URL visible if the browser launch fails.
        });

        try {
          await ocSessionService.completeProviderAuthorization(providerId, index);
          await ocSessionService.loadProviders();
          if (!isCurrentAuthRequest(requestId)) {
            return;
          }

          dismissAuth();
          setJustConnectedId(providerId);
        } catch (error: unknown) {
          if (!isCurrentAuthRequest(requestId)) {
            return;
          }

          const message = error instanceof Error ? error.message : 'OAuth authorization failed';
          dismissAuth();
          setBannerError(message);
          logger.error('OAuth auto-flow failed', { providerId, error });
        }
      }
    } catch (error: unknown) {
      if (!isCurrentAuthRequest(requestId)) {
        return;
      }

      setIsAuthorizing(false);
      const message = error instanceof Error ? error.message : 'Failed to start authorization';
      setBannerError(message);
      logger.error('Failed to authorize provider', { providerId, error });
    }
  }

  async function handleSaveApiKey(): Promise<void> {
    if (!authState.providerId || isSaving || apiKey.trim().length === 0) {
      return;
    }

    const requestId = beginAuthRequest();
    const targetProviderId = authState.providerId;
    setIsSaving(true);
    setInlineError(null);
    setBannerError(null);

    try {
      await ocSessionService.setProviderApiKey(targetProviderId, apiKey.trim());
    } catch (error: unknown) {
      if (!isCurrentAuthRequest(requestId)) {
        return;
      }

      setInlineError(error instanceof Error ? error.message : 'Failed to save API key');
      logger.error('Failed to save provider API key', { providerId: targetProviderId, error });
      setIsSaving(false);
      return;
    }

    try {
      await ocSessionService.loadProviders();
      if (!isCurrentAuthRequest(requestId)) {
        return;
      }

      dismissAuth();
      setJustConnectedId(targetProviderId);
    } catch (error: unknown) {
      if (!isCurrentAuthRequest(requestId)) {
        return;
      }

      dismissAuth();
      setBannerError('API key saved, but failed to refresh providers. Please reopen settings.');
      logger.error('Failed to refresh providers after key save', {
        providerId: targetProviderId,
        error,
      });
    } finally {
      if (isCurrentAuthRequest(requestId)) {
        setIsSaving(false);
      }
    }
  }

  async function handleSubmitOauth(): Promise<void> {
    if (
      !authState.providerId ||
      authState.methodIndex === null ||
      isSaving ||
      oauthCode.trim().length === 0
    ) {
      return;
    }

    const requestId = beginAuthRequest();
    const targetProviderId = authState.providerId;
    const targetMethodIndex = authState.methodIndex;
    setIsSaving(true);
    setInlineError(null);
    setBannerError(null);

    try {
      await ocSessionService.completeProviderAuthorization(
        targetProviderId,
        targetMethodIndex,
        oauthCode.trim()
      );
      await ocSessionService.loadProviders();
      if (!isCurrentAuthRequest(requestId)) {
        return;
      }

      dismissAuth();
      setJustConnectedId(targetProviderId);
    } catch (error: unknown) {
      if (!isCurrentAuthRequest(requestId)) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Failed to complete authorization';
      setInlineError(message);
      logger.error('Failed to complete OAuth', { providerId: targetProviderId, error });
    } finally {
      if (isCurrentAuthRequest(requestId)) {
        setIsSaving(false);
      }
    }
  }

  function handleModelSelect(providerId: string, modelId: string, modelName: string): void {
    const providerStore = useOcProviderStore.getState();
    providerStore.setSelectedProviderId(providerId);
    providerStore.setSelectedModelId(modelId);
    setJustConnectedId(null);
    toast.success(`Ready to chat with ${modelName}`);
  }

  return (
    <div>
      <SectionHeader title="Providers">
        {activeBackend === 'opencode'
          ? 'Connect model providers to use with OpenCode.'
          : 'Switch to OpenCode backend to connect and manage providers.'}
      </SectionHeader>

      {bannerError !== null ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5">
          <p className="flex-1 text-[11px] leading-relaxed text-destructive">{bannerError}</p>
          <button
            type="button"
            onClick={() => {
              setBannerError(null);
            }}
            className="shrink-0 text-[11px] text-destructive/70 hover:text-destructive"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {isLoading && activeBackend === 'opencode' ? (
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
          <span className="text-[12px] text-muted-foreground">Loading provider metadata…</span>
        </div>
      ) : null}

      {/* Connected providers */}
      {connected.length > 0 ? (
        <div className="mb-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Connected
          </div>
          <div className="rounded-xl ring-1 ring-foreground/6 divide-y divide-foreground/5">
            {connected.map((provider) => {
              const defaultModelId = defaultModels[provider.id];
              const providerInfo = providers.find((item) => item.id === provider.id);
              const defaultModelName =
                defaultModelId !== undefined && providerInfo !== undefined
                  ? (providerInfo.models[defaultModelId]?.name ?? defaultModelId)
                  : null;
              const providerMethods: OcProviderAuthMethod[] = authMethods[provider.id] ?? [
                { type: 'api', label: 'API key' },
              ];
              const isAuthActive = authState.providerId === provider.id;
              const isJustConnected =
                justConnectedId === provider.id && connectedProviders.includes(provider.id);
              const modelOptions = providerInfo ? Object.values(providerInfo.models) : [];

              return (
                <div key={provider.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {provider.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">
                        {provider.modelCount} {provider.modelCount === 1 ? 'model' : 'models'}
                        {activeBackend === 'opencode' && defaultModelName
                          ? ` · ${defaultModelName}`
                          : ''}
                      </span>
                    </div>
                  </div>

                  {/* Auth method pills below for reconfiguration */}
                  {activeBackend === 'opencode' && !isAuthActive ? (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 ml-[1.625rem]">
                      {providerMethods.map((method, index) => (
                        <button
                          key={`${provider.id}-${method.type}-${String(index)}`}
                          type="button"
                          disabled={!opencodeHealthy || isAuthorizing}
                          onClick={() => {
                            void handleAuthMethod(provider.id, method, index);
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-control-fill px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97] disabled:opacity-40"
                        >
                          {method.type === 'api' ? (
                            <KeyRound className="h-2.5 w-2.5" aria-hidden="true" />
                          ) : (
                            <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                          )}
                          {method.type === 'api' ? 'API key' : method.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {/* Expanded auth flow for reconfiguration */}
                  {activeBackend === 'opencode' && isAuthActive ? (
                    <div className="mt-3 ml-[1.625rem]">
                      {renderAuthFlow(
                        authState,
                        apiKey,
                        setApiKey,
                        oauthCode,
                        setOauthCode,
                        handleSaveApiKey,
                        handleSubmitOauth,
                        dismissAuth,
                        isSaving,
                        inlineError
                      )}
                    </div>
                  ) : null}

                  {activeBackend === 'opencode' && isJustConnected
                    ? renderJustConnectedModelPicker({
                        models: modelOptions.map((model) => ({ id: model.id, name: model.name })),
                        onDismiss: () => {
                          setJustConnectedId(null);
                        },
                        onSelect: (modelId, modelName) => {
                          handleModelSelect(provider.id, modelId, modelName);
                        },
                      })
                    : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Available providers */}
      {available.length > 0 ? (
        <div>
          {connected.length > 0 ? (
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Available
            </div>
          ) : null}
          <div className="rounded-xl ring-1 ring-foreground/6 divide-y divide-foreground/5">
            {available.map((provider) => {
              const providerMethods: OcProviderAuthMethod[] = authMethods[provider.id] ?? [
                { type: 'api', label: 'API key' },
              ];
              const isAuthActive = authState.providerId === provider.id;

              return (
                <div key={provider.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/20" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {provider.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">
                        {provider.modelCount} {provider.modelCount === 1 ? 'model' : 'models'}
                      </span>
                    </div>

                    {/* Auth method pills (when no auth flow is active) */}
                    {activeBackend === 'opencode' && !isAuthActive ? (
                      <div className="flex shrink-0 gap-1.5">
                        {providerMethods.map((method, index) => (
                          <button
                            key={`${provider.id}-${method.type}-${String(index)}`}
                            type="button"
                            disabled={!opencodeHealthy || isAuthorizing}
                            onClick={() => {
                              void handleAuthMethod(provider.id, method, index);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-control-fill px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97] disabled:opacity-40"
                          >
                            {method.type === 'api' ? (
                              <KeyRound className="h-2.5 w-2.5" aria-hidden="true" />
                            ) : (
                              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                            )}
                            {method.type === 'api' ? 'API key' : method.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Expanded auth flow */}
                  {activeBackend === 'opencode' && isAuthActive ? (
                    <div className="mt-3 ml-5">
                      {renderAuthFlow(
                        authState,
                        apiKey,
                        setApiKey,
                        oauthCode,
                        setOauthCode,
                        handleSaveApiKey,
                        handleSubmitOauth,
                        dismissAuth,
                        isSaving,
                        inlineError
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Empty state */}
      {catalog.length === 0 && !isLoading ? (
        <div className="rounded-xl ring-1 ring-foreground/6 px-4 py-8 text-center">
          <span className="text-[13px] text-muted-foreground">No providers available.</span>
        </div>
      ) : null}
    </div>
  );
};

export default ProvidersSettings;
