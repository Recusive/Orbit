import { open } from '@tauri-apps/plugin-shell';
import { useMemo, useState } from 'react';

import { SectionDivider, SectionHeader } from '../components';

import type { OcProviderAuthMethod } from '@/types/opencode';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export const ProvidersSettings: FC = () => {
  const activeBackend = useActiveBackend();
  const opencodeHealthy = useOpencodeHealthy();
  const providers = useOcProviderStore((state) => state.providers);
  const connectedProviders = useOcProviderStore((state) => state.connectedProviders);
  const authMethods = useOcProviderStore((state) => state.authMethods);
  const defaultModels = useOcProviderStore((state) => state.defaultModels);
  const isLoading = useOcProviderStore((state) => state.isLoading);
  const [authState, setAuthState] = useState<ProviderAuthState>({
    providerId: null,
    methodIndex: null,
    mode: null,
    instructions: null,
    url: null,
  });
  const [apiKey, setApiKey] = useState('');
  const [oauthCode, setOauthCode] = useState('');

  const catalog = useMemo(() => {
    if (activeBackend === 'opencode') {
      return providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        modelCount: Object.keys(provider.models).length,
      }));
    }

    return staticProviders.providers as { id: string; name: string; modelCount: number }[];
  }, [activeBackend, providers]);

  return (
    <div>
      <SectionHeader title="Providers">
        Connect model providers for OpenCode. Claude mode shows the static provider catalog only.
      </SectionHeader>

      {activeBackend !== 'opencode' ? (
        <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          Switch to OpenCode to connect providers. This catalog is generated from the bundled
          OpenCode provider metadata.
        </div>
      ) : null}

      <SectionDivider />

      <div className="space-y-6">
        {isLoading && activeBackend === 'opencode' ? (
          <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
            Loading OpenCode provider metadata…
          </div>
        ) : null}

        {catalog.map((provider) => {
          const providerMethods: OcProviderAuthMethod[] = authMethods[provider.id] ?? [
            { type: 'api', label: 'API key' },
          ];
          const isConnected = connectedProviders.includes(provider.id);
          const defaultModelId = defaultModels[provider.id];

          return (
            <div
              key={provider.id}
              className="rounded-xl border border-border/60 bg-card/50 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-foreground">{provider.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {provider.modelCount} models
                    {activeBackend === 'opencode' && defaultModelId
                      ? ` · default ${defaultModelId}`
                      : ''}
                  </div>
                </div>
                <span
                  className={isConnected ? 'text-success text-xs' : 'text-muted-foreground text-xs'}
                >
                  {isConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>

              {activeBackend === 'opencode' ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {providerMethods.map((method, index) => (
                      <Button
                        key={`${provider.id}-${method.type}-${String(index)}`}
                        size="sm"
                        variant="outline"
                        disabled={!opencodeHealthy}
                        onClick={() => {
                          if (method.type === 'api') {
                            setAuthState({
                              providerId: provider.id,
                              methodIndex: index,
                              mode: 'api',
                              instructions: null,
                              url: null,
                            });
                            return;
                          }

                          void ocSessionService
                            .authorizeProvider(provider.id, index)
                            .then((authorization) => {
                              setAuthState({
                                providerId: provider.id,
                                methodIndex: index,
                                mode: authorization.method === 'code' ? 'oauth-code' : 'oauth-auto',
                                instructions: authorization.instructions,
                                url: authorization.url,
                              });

                              if (authorization.method === 'auto') {
                                void open(authorization.url).catch(() => {
                                  // Leave the inline URL visible if the browser launch fails.
                                });
                                void ocSessionService
                                  .completeProviderAuthorization(provider.id, index)
                                  .then(() => ocSessionService.loadProviders());
                              }
                            });
                        }}
                      >
                        {method.type === 'api' ? 'API key' : method.label}
                      </Button>
                    ))}
                  </div>

                  {authState.providerId === provider.id && authState.mode === 'api' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={apiKey}
                        onChange={(event) => {
                          setApiKey(event.target.value);
                        }}
                        placeholder="Paste API key"
                        className="h-9"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!authState.providerId) {
                            return;
                          }

                          void ocSessionService
                            .setProviderApiKey(authState.providerId, apiKey)
                            .then(() => {
                              setApiKey('');
                              setAuthState({
                                providerId: null,
                                methodIndex: null,
                                mode: null,
                                instructions: null,
                                url: null,
                              });
                              return ocSessionService.loadProviders();
                            });
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  ) : null}

                  {authState.providerId === provider.id && authState.mode === 'oauth-code' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {authState.instructions ??
                          'Open the provider URL and paste the returned code.'}
                      </p>
                      {authState.url ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (authState.url) {
                              void open(authState.url);
                            }
                          }}
                        >
                          Open browser
                        </Button>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <Input
                          value={oauthCode}
                          onChange={(event) => {
                            setOauthCode(event.target.value);
                          }}
                          placeholder="Paste authorization code"
                          className="h-9"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!authState.providerId || authState.methodIndex === null) {
                              return;
                            }

                            void ocSessionService
                              .completeProviderAuthorization(
                                authState.providerId,
                                authState.methodIndex,
                                oauthCode
                              )
                              .then(() => {
                                setOauthCode('');
                                setAuthState({
                                  providerId: null,
                                  methodIndex: null,
                                  mode: null,
                                  instructions: null,
                                  url: null,
                                });
                                return ocSessionService.loadProviders();
                              });
                          }}
                        >
                          Submit
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {authState.providerId === provider.id && authState.mode === 'oauth-auto' ? (
                    <div className="text-xs text-muted-foreground">
                      Waiting for the provider callback to complete…
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProvidersSettings;
