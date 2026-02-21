import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, Check, Key, Loader2, RefreshCw, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthMethod, ProviderStatus } from '@/stores/onboarding/provider-store';
import type { FC } from 'react';

import { OrbitLogo } from '@/components/icons/orbit-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
        'min-w-[420px] mx-auto p-12 gap-6 box-border',
        'bg-background',
        className
      )}
    >
      {/* Logo/Branding - consistent with WelcomeStep */}
      <div className="flex items-center gap-4 w-full max-w-[380px]">
        <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-primary/10">
          <OrbitLogo size={40} className="text-primary" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold text-foreground tracking-tight">Orbit</span>
          <span className="text-sm text-muted-foreground">Connect Provider</span>
        </div>
      </div>

      {/* Checking / Authenticating spinner */}
      {detection.phase === 'checking' || detection.phase === 'authenticating' ? (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-3 p-6 w-full max-w-[380px]',
            'rounded-lg border border-border bg-lg-control'
          )}
        >
          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
          <span className="text-sm text-muted-foreground">
            {detection.phase === 'authenticating'
              ? 'Authenticating with Claude...'
              : 'Detecting Claude Code...'}
          </span>
          {detection.phase === 'authenticating' ? (
            <span className="text-xs text-muted-foreground/70 text-center">
              If a browser window opens, please complete the login
            </span>
          ) : null}
        </div>
      ) : detection.phase === 'valid' ? (
        /* Valid keychain credentials found */
        <div
          className={cn(
            'flex flex-col gap-4 p-5 w-full max-w-[380px]',
            'rounded-lg border border-border bg-lg-control'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10">
              <Check className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">Claude Code Detected</span>
              <span className="text-xs text-muted-foreground">
                Ready to use your existing setup
              </span>
            </div>
          </div>
          <Button
            onClick={handleUseKeychain}
            className={cn('w-full h-10 text-sm font-medium', 'bg-primary/90 hover:bg-primary')}
          >
            Continue with Claude Code
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      ) : (
        /* No credentials or auth failed — show manual entry */
        <div className="flex flex-col gap-4 w-full max-w-[380px]">
          {/* Status message */}
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3',
              'rounded-lg border border-border bg-lg-control'
            )}
          >
            <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              {detection.error ??
                'No Claude Code credentials found. Enter your Anthropic API key below or retry authentication.'}
            </span>
          </div>

          {/* Retry auth button */}
          <Button
            variant="outline"
            onClick={handleRetryAuth}
            className="w-full h-10 text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Authentication
          </Button>

          {/* Manual API Key Entry */}
          <div className="flex flex-col gap-4 p-5 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Anthropic API Key</span>
            </div>

            <div className="flex flex-col gap-2">
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setValidationError(null);
                }}
                className={cn(
                  'h-10',
                  validationError !== null && 'border-destructive focus-visible:ring-destructive'
                )}
              />
              {validationError !== null ? (
                <span className="text-xs text-destructive">{validationError}</span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Get your key from{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:text-foreground hover:underline"
                >
                  console.anthropic.com
                </a>
              </span>
            </div>

            <Button
              onClick={handleValidateApiKey}
              disabled={isValidating || apiKey.trim().length === 0}
              className={cn('w-full h-10 text-sm font-medium', 'bg-primary/90 hover:bg-primary')}
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
