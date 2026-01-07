import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, Key, Loader2, Terminal, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { AuthMethod, ProviderStatus } from '@/stores/onboarding/provider-store';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProviderStore } from '@/stores/onboarding/provider-store';

/** Result of CLI detection from Rust backend. */
interface CliDetection {
  installed: boolean;
  path: string | null;
  version: string | null;
}

/** Result of keychain credential check from Rust backend. */
interface KeychainStatus {
  hasCredentials: boolean;
  credentialType: string | null;
  expiresAt: number | null;
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

interface DetectionState {
  isChecking: boolean;
  cliInstalled: boolean;
  hasKeychain: boolean;
  error: string | null;
}

/**
 * Provider setup step in onboarding.
 * Detects Claude Code CLI and keychain credentials, or allows manual API key entry.
 */
export const ProviderStep: FC<ProviderStepProps> = ({ onComplete, className }) => {
  const addProvider = useProviderStore((s) => s.addProvider);

  // Detection state
  const [detection, setDetection] = useState<DetectionState>({
    isChecking: true,
    cliInstalled: false,
    hasKeychain: false,
    error: null,
  });

  // Manual API key input
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Check for Claude Code CLI and keychain on mount
  useEffect(() => {
    const checkClaudeCode = async (): Promise<void> => {
      try {
        // Call Rust backend to detect CLI
        const cliResult = await invoke<CliDetection>('detect_claude_cli');

        // If CLI is installed, check for keychain credentials
        let keychainResult: KeychainStatus = {
          hasCredentials: false,
          credentialType: null,
          expiresAt: null,
          error: null,
        };

        if (cliResult.installed) {
          keychainResult = await invoke<KeychainStatus>('check_claude_keychain');
        }

        setDetection({
          isChecking: false,
          cliInstalled: cliResult.installed,
          hasKeychain: keychainResult.hasCredentials,
          error: keychainResult.error,
        });
      } catch (err) {
        setDetection({
          isChecking: false,
          cliInstalled: false,
          hasKeychain: false,
          error: err instanceof Error ? err.message : 'Failed to detect Claude Code',
        });
      }
    };

    checkClaudeCode().catch(console.error);
  }, []);

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
        cliInstalled: detection.cliInstalled,
      });

      onComplete();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to validate API key');
    } finally {
      setIsValidating(false);
    }
  }, [apiKey, addProvider, onComplete, detection.cliInstalled]);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'bg-background',
        className
      )}
    >
      <div className="flex flex-col gap-8 max-w-lg w-full px-8">
        {/* Header */}
        <div className="flex flex-col gap-2 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Connect an AI Provider</h2>
          <p className="text-muted-foreground">
            Snowflake requires an AI provider to function. Connect Claude to get started.
          </p>
        </div>

        {/* Detection Status */}
        {detection.isChecking ? (
          <div className="flex items-center justify-center gap-3 p-6 rounded-lg border border-border bg-muted/30">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Detecting Claude Code CLI...</span>
          </div>
        ) : detection.cliInstalled && detection.hasKeychain ? (
          /* CLI Detected with Keychain */
          <div className="flex flex-col gap-4 p-6 rounded-lg border border-border bg-muted/30">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="font-medium text-foreground">Claude Code Detected</span>
                <span className="text-sm text-muted-foreground">
                  Found credentials in your keychain. Click below to use your existing Claude Code
                  setup.
                </span>
              </div>
            </div>
            <Button onClick={handleUseKeychain} className="w-full">
              <Terminal className="h-4 w-4 mr-2" />
              Use Claude Code
            </Button>
          </div>
        ) : (
          /* No CLI or show manual entry */
          <div className="flex flex-col gap-4">
            {detection.cliInstalled && !detection.hasKeychain ? (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
                <XCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">Claude Code Found</span>
                  <span className="text-sm text-muted-foreground">
                    CLI is installed but no credentials found. Please enter your API key below.
                  </span>
                </div>
              </div>
            ) : null}

            {!detection.cliInstalled ? (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
                <Terminal className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">Claude Code Not Found</span>
                  <span className="text-sm text-muted-foreground">
                    You can install Claude Code later, or enter your API key manually below.
                  </span>
                </div>
              </div>
            ) : null}

            {/* Manual API Key Entry */}
            <div className="flex flex-col gap-4 p-6 rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Enter Anthropic API Key</span>
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
                    validationError !== null && 'border-destructive focus-visible:ring-destructive'
                  )}
                />
                {validationError !== null ? (
                  <span className="text-sm text-destructive">{validationError}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  Get your API key from{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    console.anthropic.com
                  </a>
                </span>
              </div>

              <Button
                onClick={handleValidateApiKey}
                disabled={isValidating || apiKey.trim().length === 0}
                className="w-full"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
