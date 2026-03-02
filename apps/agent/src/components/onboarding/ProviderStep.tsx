import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, Check, Key, Loader2, RefreshCw, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthMethod, ProviderStatus } from '@/stores/onboarding/provider-store';
import type { FC } from 'react';

import { OrbitLogo } from '@/components/icons/orbit-logo';
import { cn } from '@/lib/utils';
import { useProviderStore } from '@/stores/onboarding/provider-store';

/** Result of keychain credential check from Rust backend. */
interface KeychainStatus {
  hasCredentials: boolean;
  credentialType: string | null;
  expiresAt: number | null;
  entryExists: boolean;
  error: string | null;
}

/** Result of triggering Claude CLI auth from Rust backend. */
interface AuthTriggerResult {
  success: boolean;
  error: string | null;
}

/** Result of API key validation from Rust backend. */
interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/** Result of storing an API key from Rust backend. */
interface StoreResult {
  success: boolean;
  error: string | null;
}

export interface ProviderStepProps {
  readonly onComplete: () => void;
  readonly className?: string;
}

type DetectionPhase = 'checking' | 'valid' | 'authenticating' | 'no-credentials';

interface DetectionState {
  phase: DetectionPhase;
  error: string | null;
}

/**
 * Provider setup step in onboarding.
 *
 * Flow:
 * 1. Check keychain for valid OAuth token
 * 2. If valid → show "Claude Code Detected" (green checkmark)
 * 3. If entry exists but token invalid/expired → auto-trigger CLI auth, then re-check
 * 4. If no entry at all → show API key input form
 */
export const ProviderStep: FC<ProviderStepProps> = ({ onComplete, className }) => {
  const addProvider = useProviderStore((s) => s.addProvider);

  // Detection state
  const [detection, setDetection] = useState<DetectionState>({
    phase: 'checking',
    error: null,
  });

  // Manual API key input
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Prevent double-triggering auth in React strict mode
  const authTriggered = useRef(false);

  // Check keychain and optionally trigger auth
  const checkAndAuth = useCallback(async (): Promise<void> => {
    setDetection({ phase: 'checking', error: null });

    try {
      const status = await invoke<KeychainStatus>('check_claude_keychain');

      if (status.hasCredentials) {
        // Valid token found
        setDetection({ phase: 'valid', error: null });
        return;
      }

      if (status.entryExists) {
        // Entry exists but token is invalid/expired — trigger CLI auth
        if (authTriggered.current) {
          // Already tried once — don't loop, show error
          setDetection({
            phase: 'no-credentials',
            error: status.error ?? 'Token expired. Please authenticate manually.',
          });
          return;
        }

        authTriggered.current = true;
        setDetection({ phase: 'authenticating', error: null });

        const authResult = await invoke<AuthTriggerResult>('trigger_claude_auth');

        if (!authResult.success) {
          setDetection({
            phase: 'no-credentials',
            error: authResult.error ?? 'Authentication failed',
          });
          return;
        }

        // Re-check after auth
        const recheckStatus = await invoke<KeychainStatus>('check_claude_keychain');

        if (recheckStatus.hasCredentials) {
          setDetection({ phase: 'valid', error: null });
        } else {
          setDetection({
            phase: 'no-credentials',
            error: recheckStatus.error ?? 'Authentication did not complete. Please try again.',
          });
        }
        return;
      }

      // No entry at all
      setDetection({ phase: 'no-credentials', error: status.error });
    } catch (err) {
      setDetection({
        phase: 'no-credentials',
        error: err instanceof Error ? err.message : 'Failed to check credentials',
      });
    }
  }, []);

  // Check on mount
  useEffect(() => {
    checkAndAuth().catch(() => {
      /* handled inside */
    });
  }, [checkAndAuth]);

  // Retry auth manually
  const handleRetryAuth = useCallback((): void => {
    authTriggered.current = false;
    checkAndAuth().catch(() => {
      /* handled inside */
    });
  }, [checkAndAuth]);

  // Use detected keychain credentials
  const handleUseKeychain = useCallback((): void => {
    addProvider({
      type: 'claude',
      name: 'Claude Code',
      status: 'connected' as ProviderStatus,
      authMethod: 'keychain' as AuthMethod,
      cliInstalled: true,
    });
    onComplete();
  }, [addProvider, onComplete]);

  // Validate and save manual API key
  const handleValidateApiKey = useCallback(async (): Promise<void> => {
    if (apiKey.trim().length === 0) {
      setValidationError('Please enter an API key');
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      // Call Rust backend to validate API key
      const result = await invoke<ValidationResult>('validate_api_key', { key: apiKey });

      if (!result.valid) {
        throw new Error(result.error ?? 'Invalid API key');
      }

      // Store the API key securely via Rust backend
      const storeResult = await invoke<StoreResult>('store_api_key', {
        provider: 'claude',
        key: apiKey,
      });

      if (!storeResult.success) {
        throw new Error(storeResult.error ?? 'Failed to store API key');
      }

      // Save the provider
      addProvider({
        type: 'claude',
        name: 'Claude (API Key)',
        status: 'connected' as ProviderStatus,
        authMethod: 'apikey' as AuthMethod,
        cliInstalled: true, // Bundled app always has CLI
      });

      onComplete();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to validate API key');
    } finally {
      setIsValidating(false);
    }
  }, [apiKey, addProvider, onComplete]);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'mx-auto box-border bg-background',
        className
      )}
    >
      <div className="relative flex flex-col items-center w-full max-w-[360px]" style={{ gap: 16 }}>
        {/* Icon */}
        <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
          <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-foreground/5">
            <OrbitLogo size={40} className="text-foreground" />
          </div>
        </div>

        {/* Title + Description */}
        <div className="flex w-full flex-col items-start" style={{ padding: '0 6px 2px', gap: 10 }}>
          <h1 className="liquid-glass-title w-full">Connect provider</h1>
          <p className="liquid-glass-desc w-full">
            {detection.phase === 'checking'
              ? 'Detecting Claude Code credentials...'
              : detection.phase === 'authenticating'
                ? 'Authenticating with Claude...'
                : detection.phase === 'valid'
                  ? 'Claude Code credentials detected. Ready to use your existing setup.'
                  : 'No Claude Code credentials found. Enter your Anthropic API key below or retry authentication.'}
          </p>
        </div>

        {/* Checking / Authenticating spinner */}
        {detection.phase === 'checking' || detection.phase === 'authenticating' ? (
          <div className="flex w-full flex-col items-center" style={{ padding: '0 6px', gap: 12 }}>
            <Loader2 className="h-6 w-6 animate-spin text-foreground/50" aria-hidden="true" />
            {detection.phase === 'authenticating' ? (
              <span className="text-xs text-muted-foreground/70 text-center">
                If a browser window opens, please complete the login
              </span>
            ) : null}
          </div>
        ) : detection.phase === 'valid' ? (
          /* Valid keychain credentials found */
          <>
            <div className="flex w-full items-center" style={{ padding: '0 6px', gap: 10 }}>
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10">
                <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
              </div>
              <span className="text-sm font-medium text-foreground">Claude Code Detected</span>
            </div>

            <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
              <button
                type="button"
                className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] flex items-center justify-center gap-2"
                onClick={handleUseKeychain}
              >
                Continue with Claude Code
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          /* No credentials or auth failed — show manual entry */
          <>
            {/* Error detail — only when there's a technical error */}
            {detection.error !== null ? (
              <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
                <div className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 liquid-glass-textarea">
                  <Terminal className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground font-mono">{detection.error}</span>
                </div>
              </div>
            ) : null}

            {/* Retry auth button */}
            <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
              <button
                type="button"
                className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] flex items-center justify-center gap-2"
                onClick={handleRetryAuth}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry Authentication
              </button>
            </div>

            {/* API Key section title */}
            <div className="flex w-full items-center" style={{ padding: '0 6px', gap: 8 }}>
              <Key className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">Anthropic API Key</span>
            </div>

            {/* API Key input */}
            <div className="w-full" style={{ padding: '0 6px' }}>
              <div className="relative">
                <Key
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="sk-ant-..."
                  className="liquid-glass-textarea w-full h-9 rounded-[9px] text-sm outline-none"
                  style={{ paddingLeft: 36 }}
                  aria-label="Anthropic API key"
                />
              </div>
              {validationError !== null ? (
                <p className="mt-1.5 text-[12px] text-destructive">{validationError}</p>
              ) : null}
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Get your key from{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>

            {/* Continue button */}
            <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
              <button
                type="button"
                className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] flex items-center justify-center gap-2"
                onClick={() => {
                  void handleValidateApiKey();
                }}
                disabled={isValidating || apiKey.trim().length === 0}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Validating...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
