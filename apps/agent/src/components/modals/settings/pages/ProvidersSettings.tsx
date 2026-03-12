import { open } from '@tauri-apps/plugin-shell';
import { Check, ExternalLink, KeyRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SectionHeader } from '../components';

import type { OcProviderAuthMethod } from '@/types/opencode';
import type { Dispatch, FC, ReactNode, SetStateAction } from 'react';

import staticProviders from '@/data/opencode-providers.json';
import { ocSessionService } from '@/services/opencode';
import { useActiveBackend, useOpencodeHealthy } from '@/stores/backend';
import { useOcProviderStore } from '@/stores/opencode';

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
  handleSaveApiKey: () => void,
  handleSubmitOauth: () => void,
  dismissAuth: () => void
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
            if (event.key === 'Enter' && apiKey.length > 0) handleSaveApiKey();
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
            disabled={apiKey.length === 0}
            onClick={handleSaveApiKey}
            className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer text-[12px] transition-transform duration-75 active:scale-[0.97]"
          >
            Save
          </button>
        </div>
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
            if (event.key === 'Enter' && oauthCode.length > 0) handleSubmitOauth();
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
            disabled={oauthCode.length === 0}
            onClick={handleSubmitOauth}
            className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer text-[12px] transition-transform duration-75 active:scale-[0.97]"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  if (authState.mode === 'oauth-auto') {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
        <span className="text-[11px] text-muted-foreground">Waiting for provider callback…</span>
      </div>
    );
  }

  return null;
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

  function dismissAuth(): void {
    setApiKey('');
    setOauthCode('');
    setAuthState(EMPTY_AUTH);
  }

  function handleAuthMethod(providerId: string, method: OcProviderAuthMethod, index: number): void {
    if (method.type === 'api') {
      setAuthState({ providerId, methodIndex: index, mode: 'api', instructions: null, url: null });
      return;
    }

    void ocSessionService.authorizeProvider(providerId, index).then((auth) => {
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
        void ocSessionService
          .completeProviderAuthorization(providerId, index)
          .then(() => ocSessionService.loadProviders());
      }
    });
  }

  function handleSaveApiKey(): void {
    if (!authState.providerId) return;
    void ocSessionService.setProviderApiKey(authState.providerId, apiKey).then(() => {
      dismissAuth();
      return ocSessionService.loadProviders();
    });
  }

  function handleSubmitOauth(): void {
    if (!authState.providerId || authState.methodIndex === null) return;
    void ocSessionService
      .completeProviderAuthorization(authState.providerId, authState.methodIndex, oauthCode)
      .then(() => {
        dismissAuth();
        return ocSessionService.loadProviders();
      });
  }

  return (
    <div>
      <SectionHeader title="Providers">
        {activeBackend === 'opencode'
          ? 'Connect model providers to use with OpenCode.'
          : 'Switch to OpenCode backend to connect and manage providers.'}
      </SectionHeader>

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
              const providerMethods: OcProviderAuthMethod[] = authMethods[provider.id] ?? [
                { type: 'api', label: 'API key' },
              ];
              const isAuthActive = authState.providerId === provider.id;

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
                        {activeBackend === 'opencode' && defaultModelId
                          ? ` · ${defaultModelId}`
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
                          disabled={!opencodeHealthy}
                          onClick={() => {
                            handleAuthMethod(provider.id, method, index);
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
                        dismissAuth
                      )}
                    </div>
                  ) : null}
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
                            disabled={!opencodeHealthy}
                            onClick={() => {
                              handleAuthMethod(provider.id, method, index);
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
                        dismissAuth
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
