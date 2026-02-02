import { invoke } from '@tauri-apps/api/core';
import { Clock, Key, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SiClaude } from 'react-icons/si';

import { SectionDivider, SectionHeader } from '../components';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
  if (diffMs < 60 * 60_000) return 'text-yellow-500';
  return 'text-green-600';
}

/** Dot indicator color class. */
function dotColor(expiresAtMs: number | null, hasCredentials: boolean): string {
  if (!hasCredentials) return 'bg-muted-foreground/40';
  if (expiresAtMs === null) return 'bg-green-600';
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'bg-destructive';
  if (diffMs < 5 * 60_000) return 'bg-destructive';
  if (diffMs < 60 * 60_000) return 'bg-yellow-500';
  return 'bg-green-600';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AccountSettings: FC = () => {
  // OAuth status
  const [keychainStatus, setKeychainStatus] = useState<KeychainStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  // API key management
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isRemovingKey, setIsRemovingKey] = useState(false);

  // ── Fetch status on mount ────────────────────────────────────────────
  const fetchStatus = useCallback(async (): Promise<void> => {
    setIsChecking(true);
    try {
      const [status, apiKeyResult] = await Promise.all([
        invoke<KeychainStatus>('check_claude_keychain'),
        invoke<RetrieveResult>('retrieve_api_key', { provider: 'claude' }),
      ]);

      setKeychainStatus(status);
      setLastChecked(Date.now());

      if (apiKeyResult.key !== null) {
        setStoredApiKey(maskApiKey(apiKeyResult.key));
      } else {
        setStoredApiKey(null);
      }
    } catch {
      setKeychainStatus({
        hasCredentials: false,
        credentialType: null,
        expiresAt: null,
        entryExists: false,
        error: 'Failed to check credentials',
      });
      setLastChecked(Date.now());
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus().catch(() => {
      /* errors handled in fetchStatus */
    });
  }, [fetchStatus]);

  // ── Refresh token handler ────────────────────────────────────────────
  const handleRefreshToken = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);
    try {
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
    } catch {
      setKeychainStatus((prev) =>
        prev !== null ? { ...prev, error: 'Failed to refresh token' } : prev
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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

      setStoredApiKey(maskApiKey(trimmed));
      setApiKeyInput('');
      setKeyError(null);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setIsSavingKey(false);
    }
  }, [apiKeyInput]);

  // ── Remove API key handler ───────────────────────────────────────────
  const handleRemoveKey = useCallback(async (): Promise<void> => {
    setIsRemovingKey(true);
    try {
      const result = await invoke<StoreResult>('delete_api_key', { provider: 'claude' });
      if (result.success) {
        setStoredApiKey(null);
        setKeyError(null);
      } else {
        setKeyError(result.error ?? 'Failed to remove API key');
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to remove API key');
    } finally {
      setIsRemovingKey(false);
    }
  }, []);

  // ── Derived display values ───────────────────────────────────────────
  const isConnected = keychainStatus?.hasCredentials === true;
  const connectionLabel = isConnected ? 'Connected' : 'Not connected';

  return (
    <div>
      <SectionHeader title="Authentication">Manage your Claude authentication</SectionHeader>

      {/* ── OAuth Status Card ─────────────────────────────────────── */}
      <div className="rounded-lg border-3 border-border/40 bg-muted/20 min-h-[120px] overflow-hidden">
        {isChecking ? (
          <div className="flex items-center justify-center gap-3 p-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking credentials…</span>
          </div>
        ) : (
          <>
            {/* Top section: icon + status + refresh */}
            <div className="flex items-start justify-between gap-4 p-4 pb-3">
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div
                  className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                  style={{ backgroundColor: isConnected ? '#d9775720' : undefined }}
                >
                  <SiClaude
                    className={cn('h-4 w-4', isConnected ? undefined : 'text-muted-foreground/60')}
                    style={isConnected ? { color: '#d97757' } : undefined}
                  />
                </div>

                {/* Text block */}
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Claude Code</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
                        isConnected
                          ? 'bg-green-600/10 text-green-600'
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
                  <span className="text-xs text-muted-foreground/60">OAuth</span>
                </div>
              </div>

              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs shrink-0"
                disabled={isRefreshing}
                onClick={() => {
                  handleRefreshToken().catch(() => {
                    /* handled */
                  });
                }}
              >
                {isRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>

            {/* Token expiry details */}
            {isConnected && keychainStatus.expiresAt !== null ? (
              <div className="mx-4 mb-4 rounded-md bg-muted/40 px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock
                    className={cn('h-3.5 w-3.5 shrink-0', expiryColor(keychainStatus.expiresAt))}
                  />
                  <span
                    className={cn('text-xs font-medium', expiryColor(keychainStatus.expiresAt))}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatTimeUntilExpiry(keychainStatus.expiresAt)}
                  </span>
                  <span className="text-xs text-muted-foreground/90">
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
                <p className="text-xs text-destructive">{keychainStatus.error}</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      <SectionDivider />

      {/* ── API Key Fallback Section ──────────────────────────────── */}
      <SectionHeader title="API Key">
        Use an Anthropic API key if you don&apos;t have Claude Code
      </SectionHeader>

      {storedApiKey !== null ? (
        /* Key is saved — show masked key with remove button */
        <div className="rounded-lg border border-border/40 p-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-green-600 shrink-0" />
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                <span className="font-medium">Anthropic API Key</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-muted-foreground font-mono text-xs">{storedApiKey}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isRemovingKey}
              onClick={() => {
                handleRemoveKey().catch(() => {
                  /* handled */
                });
              }}
            >
              {isRemovingKey ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
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
            handleSaveKey().catch(() => {
              /* handled */
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
                  'h-8 text-sm pl-8 placeholder:text-muted-foreground/90',
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
          {keyError !== null ? <p className="text-xs text-destructive">{keyError}</p> : null}
          <p className="text-xs text-muted-foreground/70">
            Get your key from{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              console.anthropic.com
            </a>
          </p>
        </form>
      )}
    </div>
  );
};

export default AccountSettings;
