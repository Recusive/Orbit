import { createLogger } from '@orbit/common/lib';
import { invoke } from '@tauri-apps/api/core';
import { Clock, Info, Key, Loader2, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SiClaude } from 'react-icons/si';

import { SectionDivider } from '../components/SectionDivider';
import { SectionHeader } from '../components/SectionHeader';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  applyResolvedClaudeAuthState,
  resolveClaudeAuthState,
  sanitizePreferredAuthMethod,
} from '@/lib/claude-auth';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/agent';
import { useActiveBackend } from '@/stores/backend';

const logger = createLogger('AccountSettings');

// ---------------------------------------------------------------------------
// Backend response types (mirrors Rust structs in credentials.rs / providers.rs)
// ---------------------------------------------------------------------------

interface KeychainStatus {
  hasCredentials: boolean;
  credentialType: string | null;
  expiresAt: number | null;
  entryExists: boolean;
  error: string | null;
}

interface AuthTriggerResult {
  success: boolean;
  error: string | null;
}

interface ValidationResult {
  valid: boolean;
  error: string | null;
}

interface StoreResult {
  success: boolean;
  error: string | null;
}

interface RetrieveResult {
  key: string | null;
  error: string | null;
}

type PreferredAuthMethod = 'oauth' | 'apikey' | null;

const EMPTY_KEYCHAIN_STATUS: KeychainStatus = {
  hasCredentials: false,
  credentialType: null,
  expiresAt: null,
  entryExists: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mask an API key for display: "sk-ant-•••4f8" */
function maskApiKey(key: string): string {
  if (key.length <= 6) return '••••••';
  return `${key.slice(0, 6)}•••${key.slice(-3)}`;
}

/** Human-friendly relative time until a Unix-ms timestamp. */
function formatTimeUntilExpiry(expiresAtMs: number): string {
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'Expired';

  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${String(hours)}h ${String(minutes)}m`;
  return `${String(minutes)}m`;
}

/** Absolute timestamp: "Feb 2, 2026 at 7:23 AM" */
function formatAbsoluteTime(expiresAtMs: number): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(expiresAtMs));
}

/** "just now" / "2m ago" / "1h ago" */
function formatLastChecked(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${String(hours)}h ago`;
}

/** Color class for token expiry status. */
function expiryColor(expiresAtMs: number): string {
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'text-destructive';
  if (diffMs < 5 * 60_000) return 'text-destructive';
  if (diffMs < 60 * 60_000) return 'text-warning';
  return 'text-success';
}

/** Dot indicator color class. */
function dotColor(expiresAtMs: number | null, hasCredentials: boolean): string {
  if (!hasCredentials) return 'bg-muted-foreground/40';
  if (expiresAtMs === null) return 'bg-success';
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'bg-destructive';
  if (diffMs < 5 * 60_000) return 'bg-destructive';
  if (diffMs < 60 * 60_000) return 'bg-warning';
  return 'bg-success';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AccountSettings: FC = () => {
  const activeBackend = useActiveBackend();
  const credentialType = useAuthStore((state) => state.credentialType);

  // OAuth status
  const [keychainStatus, setKeychainStatus] = useState<KeychainStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // API key management
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isRemovingKey, setIsRemovingKey] = useState(false);
  const [preferredMethod, setPreferredMethod] = useState<PreferredAuthMethod>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);

  const applyAuthSnapshot = useCallback(
    (
      nextPreferredMethod: PreferredAuthMethod,
      nextStoredApiKey: string | null,
      nextKeychainStatus: KeychainStatus
    ): void => {
      const resolved = resolveClaudeAuthState({
        preferredMethod: nextPreferredMethod,
        hasApiKey: nextStoredApiKey !== null,
        keychainStatus: nextKeychainStatus,
      });
      applyResolvedClaudeAuthState(useAuthStore.getState(), resolved);
    },
    []
  );

  // ── Fetch status on mount ────────────────────────────────────────────
  const fetchStatus = useCallback(async (): Promise<void> => {
    // In demo mode (marketing site iframe), skip Tauri invocations and show mock connected state
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'true') {
      setKeychainStatus({
        hasCredentials: true,
        credentialType: 'oauth',
        expiresAt: Date.now() + 4 * 60 * 60_000,
        entryExists: true,
        error: null,
      });
      setPreferredMethod('oauth');
      setStoredApiKey(null);
      applyAuthSnapshot('oauth', null, {
        hasCredentials: true,
        credentialType: 'oauth',
        expiresAt: Date.now() + 4 * 60 * 60_000,
        entryExists: true,
        error: null,
      });
      setLastChecked(Date.now());
      return;
    }

    try {
      const [status, apiKeyResult, preferredResult] = await Promise.all([
        invoke<KeychainStatus>('check_claude_keychain'),
        invoke<RetrieveResult>('retrieve_api_key', { provider: 'claude' }),
        invoke<string | null>('get_preferred_auth_method'),
      ]);

      const maskedApiKey = apiKeyResult.key !== null ? maskApiKey(apiKeyResult.key) : null;
      const nextPreferredMethod = sanitizePreferredAuthMethod(preferredResult);

      setKeychainStatus(status);
      setStoredApiKey(maskedApiKey);
      setPreferredMethod(nextPreferredMethod);
      setLastChecked(Date.now());
      applyAuthSnapshot(nextPreferredMethod, maskedApiKey, status);
    } catch {
      setKeychainStatus({
        hasCredentials: false,
        credentialType: null,
        expiresAt: null,
        entryExists: false,
        error: 'Failed to check credentials',
      });
      setPreferredMethod(null);
      setLastChecked(Date.now());
    } finally {
      // data loaded
    }
  }, [applyAuthSnapshot]);

  useEffect(() => {
    fetchStatus().catch((error: unknown) => {
      logger.error('Failed to fetch credential status', error);
    });
  }, [fetchStatus]);

  // ── Refresh token handler ────────────────────────────────────────────
  const handleRefreshToken = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);
    setRefreshMessage(null);

    // Clear any pending dismiss timer
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    try {
      const oldExpiresAt = keychainStatus?.expiresAt ?? null;

      const authResult = await invoke<AuthTriggerResult>('trigger_claude_auth');

      if (!authResult.success) {
        setKeychainStatus((prev) =>
          prev !== null ? { ...prev, error: authResult.error ?? 'Refresh failed' } : prev
        );
        return;
      }

      const status = await invoke<KeychainStatus>('check_claude_keychain');
      setKeychainStatus(status);
      setLastChecked(Date.now());
      applyAuthSnapshot(preferredMethod, storedApiKey, status);

      // Compare old and new expiry to give user feedback
      if (status.hasCredentials && status.expiresAt !== null) {
        if (oldExpiresAt === status.expiresAt) {
          setRefreshMessage(
            `Token still valid · ${formatTimeUntilExpiry(status.expiresAt)} remaining`
          );
        } else {
          setRefreshMessage('Token refreshed');
        }
      }

      // Auto-dismiss after 4 seconds
      refreshTimerRef.current = setTimeout(() => {
        setRefreshMessage(null);
        refreshTimerRef.current = null;
      }, 4000);
    } catch {
      setKeychainStatus((prev) =>
        prev !== null ? { ...prev, error: 'Failed to refresh token' } : prev
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [applyAuthSnapshot, keychainStatus?.expiresAt, preferredMethod, storedApiKey]);

  // ── Switch auth method handler ───────────────────────────────────────
  const handleMethodChange = useCallback(
    async (method: Exclude<PreferredAuthMethod, null>): Promise<void> => {
      setIsSwitching(true);
      setMethodError(null);

      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === 'true') {
        const demoStatus: KeychainStatus = {
          hasCredentials: true,
          credentialType: 'oauth',
          expiresAt: Date.now() + 4 * 60 * 60_000,
          entryExists: true,
          error: null,
        };
        setPreferredMethod(method);
        setKeychainStatus(demoStatus);
        setLastChecked(Date.now());
        applyAuthSnapshot(method, storedApiKey, demoStatus);
        setIsSwitching(false);
        return;
      }

      try {
        const result = await invoke<StoreResult>('set_preferred_auth_method', { method });
        if (!result.success) {
          setMethodError(result.error ?? 'Failed to update preferred auth method');
          return;
        }

        setPreferredMethod(method);
        useAuthStore.getState().setPreferredMethod(method);

        // Use existing keychainStatus — no need to re-fetch mid-switch.
        // This keeps the transition synchronous and avoids skeleton flash.
        setLastChecked(Date.now());
        applyAuthSnapshot(method, storedApiKey, keychainStatus ?? EMPTY_KEYCHAIN_STATUS);
      } catch (error) {
        setMethodError(
          error instanceof Error ? error.message : 'Failed to update preferred auth method'
        );
      } finally {
        setIsSwitching(false);
      }
    },
    [applyAuthSnapshot, keychainStatus, storedApiKey]
  );

  // ── Save API key handler ─────────────────────────────────────────────
  const handleSaveKey = useCallback(async (): Promise<void> => {
    const trimmed = apiKeyInput.trim();
    if (trimmed.length === 0) {
      setKeyError('Please enter an API key');
      return;
    }

    setIsSavingKey(true);
    setKeyError(null);

    try {
      const validation = await invoke<ValidationResult>('validate_api_key', { key: trimmed });
      if (!validation.valid) {
        setKeyError(validation.error ?? 'Invalid API key format');
        return;
      }

      const storeResult = await invoke<StoreResult>('store_api_key', {
        provider: 'claude',
        key: trimmed,
      });

      if (!storeResult.success) {
        setKeyError(storeResult.error ?? 'Failed to store API key');
        return;
      }

      const maskedKey = maskApiKey(trimmed);
      setStoredApiKey(maskedKey);
      setApiKeyInput('');
      setKeyError(null);
      setLastChecked(Date.now());
      applyAuthSnapshot(preferredMethod, maskedKey, keychainStatus ?? EMPTY_KEYCHAIN_STATUS);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setIsSavingKey(false);
    }
  }, [apiKeyInput, applyAuthSnapshot, keychainStatus, preferredMethod]);

  // ── Remove API key handler ───────────────────────────────────────────
  const handleRemoveKey = useCallback(async (): Promise<void> => {
    setIsRemovingKey(true);
    try {
      const result = await invoke<StoreResult>('delete_api_key', { provider: 'claude' });
      if (result.success) {
        setStoredApiKey(null);
        setKeyError(null);
        setLastChecked(Date.now());
        applyAuthSnapshot(preferredMethod, null, keychainStatus ?? EMPTY_KEYCHAIN_STATUS);
      } else {
        setKeyError(result.error ?? 'Failed to remove API key');
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to remove API key');
    } finally {
      setIsRemovingKey(false);
    }
  }, [applyAuthSnapshot, keychainStatus, preferredMethod]);

  // ── Cleanup refresh timer on unmount ─────────────────────────────────
  useEffect(() => {
    const timerRef = refreshTimerRef;
    return (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // ── Derived display values ───────────────────────────────────────────
  const isConnected = keychainStatus?.hasCredentials === true;
  const connectionLabel = isConnected ? 'Connected' : 'Not connected';
  const apiKeyConfigured = storedApiKey !== null;
  const selectedMethod = preferredMethod ?? credentialType;
  const showLegacyHint = preferredMethod === null;
  const usingNote =
    preferredMethod === 'apikey' && credentialType === 'oauth'
      ? 'Using OAuth because no API key is configured'
      : preferredMethod === 'oauth' && credentialType === 'apikey'
        ? 'Using API key'
        : null;

  const dataLoaded = keychainStatus !== null;

  return (
    <div className={dataLoaded ? 'animate-settings-in' : 'opacity-0'}>
      <SectionHeader title="Authentication">
        Choose your preferred Claude authentication method
      </SectionHeader>

      {activeBackend !== 'opencode' ? (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Claude authentication method" className="space-y-2">
            {[
              {
                id: 'oauth',
                title: 'OAuth',
                description: 'Use Claude Code credentials from your local sign-in',
                status: connectionLabel,
                connected: isConnected,
              },
              {
                id: 'apikey',
                title: 'API Key',
                description: 'Use a stored Anthropic API key from Settings',
                status: apiKeyConfigured ? 'Configured' : 'Not configured',
                connected: apiKeyConfigured,
              },
            ].map((option) => {
              const isSelected = selectedMethod === option.id;
              const isPreferred = preferredMethod === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isSwitching}
                  onClick={() => {
                    void handleMethodChange(option.id as Exclude<PreferredAuthMethod, null>);
                  }}
                  className={cn(
                    'group flex min-h-11 w-full items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-colors disabled:opacity-60',
                    isSelected ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/3'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30 group-hover:border-muted-foreground/50'
                    )}
                  >
                    {isSelected ? (
                      <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground">
                        {option.title}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
                          option.connected
                            ? 'bg-success-muted text-success'
                            : 'bg-muted-foreground/10 text-muted-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            option.id === 'oauth'
                              ? dotColor(keychainStatus?.expiresAt ?? null, isConnected)
                              : option.connected
                                ? 'bg-success'
                                : 'bg-muted-foreground/40'
                          )}
                        />
                        {option.status}
                      </span>
                    </div>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {option.description}
                    </span>
                    {usingNote !== null && isPreferred ? (
                      <span className="mt-2 block text-[11px] text-muted-foreground">
                        {usingNote}
                      </span>
                    ) : null}
                  </div>

                  {isPreferred ? (
                    <span className="shrink-0 inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-medium text-success">
                      Preferred
                    </span>
                  ) : isSelected ? (
                    <span className="shrink-0 inline-flex items-center rounded-full bg-muted-foreground/10 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Current
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {showLegacyHint ? (
            <p className="text-sm text-muted-foreground">
              No preferred method is saved yet. Picking one makes Claude startup behavior explicit.
            </p>
          ) : null}

          {methodError !== null ? <p className="text-sm text-destructive">{methodError}</p> : null}
        </div>
      ) : null}

      <SectionDivider />

      {/* ── OAuth Status Card ─────────────────────────────────────── */}
      <div
        className={cn(
          'rounded-[14px] bg-foreground/[0.06] overflow-hidden transition-opacity',
          preferredMethod !== null && preferredMethod !== 'oauth' && 'opacity-60'
        )}
      >
        <div>
          {/* Top section: icon + status + refresh */}
          <div className="flex items-start justify-between gap-4 p-4 pb-3">
            <div className="flex items-start gap-3">
              {/* Status icon */}
              <div
                className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                style={{ backgroundColor: isConnected ? 'var(--orbit-alpha-200)' : undefined }}
              >
                <SiClaude
                  className={cn('h-4 w-4', isConnected ? undefined : 'text-muted-foreground/60')}
                  style={isConnected ? { color: 'var(--primary)' } : undefined}
                />
              </div>

              {/* Text block */}
              <div className="flex flex-col gap-0.5 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium">Claude Code</span>
                  {preferredMethod !== null && preferredMethod !== 'oauth' ? (
                    <span className="text-[11px] text-muted-foreground">(not preferred)</span>
                  ) : null}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
                      isConnected
                        ? 'bg-success-muted text-success'
                        : 'bg-muted-foreground/10 text-muted-foreground'
                    )}
                  >
                    <div
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        dotColor(keychainStatus?.expiresAt ?? null, isConnected)
                      )}
                    />
                    {connectionLabel}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground/60">OAuth</span>
              </div>
            </div>

            {/* Refresh button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-[12px] shrink-0 [&_svg]:size-[14px]"
              disabled={isRefreshing}
              onClick={() => {
                handleRefreshToken().catch((error: unknown) => {
                  logger.error('Failed to refresh token', error);
                });
              }}
            >
              {isRefreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
          </div>

          {/* Token expiry details */}
          {isConnected && keychainStatus.expiresAt !== null ? (
            <div className="mx-4 mb-4 rounded-[12px] bg-lg-control px-3 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock
                  className={cn('h-3.5 w-3.5 shrink-0', expiryColor(keychainStatus.expiresAt))}
                />
                <span
                  className={cn('text-sm font-medium', expiryColor(keychainStatus.expiresAt))}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatTimeUntilExpiry(keychainStatus.expiresAt)}
                </span>
                <span className="text-sm text-muted-foreground/90">
                  {formatAbsoluteTime(keychainStatus.expiresAt)}
                </span>
              </div>
              {lastChecked !== null ? (
                <span className="text-[11px] text-muted-foreground/90">
                  {formatLastChecked(lastChecked)}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Error */}
          {keychainStatus?.error !== null && keychainStatus?.error !== undefined ? (
            <div className="px-4 py-2.5 border-t border-destructive/20 bg-destructive/5">
              <p className="text-sm text-destructive">{keychainStatus.error}</p>
            </div>
          ) : null}
        </div>
      </div>

      <SectionDivider />

      {/* ── API Key Fallback Section ──────────────────────────────── */}
      <div
        className={cn(
          'transition-opacity',
          preferredMethod !== null && preferredMethod !== 'apikey' && 'opacity-60'
        )}
      >
        <SectionHeader title="API Key">
          Use an Anthropic API key if you don&apos;t have Claude Code
        </SectionHeader>

        {storedApiKey !== null ? (
          /* Key is saved — show masked key with remove button */
          <div className="rounded-[14px] bg-foreground/[0.06]">
            <div className="flex items-start justify-between gap-4 p-4 pb-3">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0 bg-success/10">
                  <ShieldCheck className="h-4 w-4 text-success" />
                </div>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium">Anthropic API Key</span>
                    {preferredMethod !== null && preferredMethod !== 'apikey' ? (
                      <span className="text-[11px] text-muted-foreground">(not preferred)</span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none bg-success-muted text-success">
                      <div className="h-1.5 w-1.5 rounded-full bg-success" />
                      Configured
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground/60 font-mono">{storedApiKey}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-[12px] border border-foreground/10 text-destructive hover:border-transparent hover:text-destructive hover:bg-destructive/10 shrink-0 [&_svg]:size-[14px]"
                disabled={isRemovingKey}
                onClick={() => {
                  handleRemoveKey().catch((error: unknown) => {
                    logger.error('Failed to remove API key', error);
                  });
                }}
              >
                {isRemovingKey ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Remove Key
              </Button>
            </div>
          </div>
        ) : (
          /* No key saved — show input form */
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveKey().catch((error: unknown) => {
                logger.error('Failed to save API key', error);
              });
            }}
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                <Input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKeyInput}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setKeyError(null);
                  }}
                  className={cn(
                    'h-8 text-base pl-8 placeholder:text-muted-foreground/90',
                    keyError !== null && 'border-destructive focus-visible:ring-destructive'
                  )}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={isSavingKey || apiKeyInput.trim().length === 0}
              >
                {isSavingKey ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Save Key
              </Button>
            </div>
            {keyError !== null ? <p className="text-sm text-destructive">{keyError}</p> : null}
            <p className="text-sm text-muted-foreground/70">
              Get your key from{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg-text-secondary hover:text-foreground hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </form>
        )}
      </div>

      {/* Refresh feedback bar */}
      {refreshMessage !== null ? (
        <div className="mt-6 flex w-full items-center justify-between rounded-[14px] border border-lg-separator bg-background">
          <div className="flex flex-1 items-center gap-3 py-2.5 pl-3.5">
            <Info className="h-4 w-4 shrink-0 text-lg-text-secondary" />
            <span className="text-base font-medium">{refreshMessage}</span>
          </div>
          <div className="flex items-center border-l border-lg-separator">
            <button
              type="button"
              className="flex items-center justify-center rounded-md p-2.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
              onClick={() => {
                setRefreshMessage(null);
                if (refreshTimerRef.current !== null) {
                  clearTimeout(refreshTimerRef.current);
                  refreshTimerRef.current = null;
                }
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccountSettings;
