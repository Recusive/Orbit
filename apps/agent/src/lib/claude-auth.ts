import type {
  AuthCredentialType,
  AuthErrorCategory,
  AuthState,
  PreferredAuthMethod,
} from '@/stores/agent/auth-store';

export interface ClaudeKeychainStatus {
  hasCredentials: boolean;
  credentialType: string | null;
  expiresAt: number | null;
  entryExists: boolean;
  error: string | null;
}

type ResolvedClaudeAuthStatus = 'authenticated' | 'expired' | 'error';

export interface ResolvedClaudeAuthState {
  preferredMethod: PreferredAuthMethod;
  status: ResolvedClaudeAuthStatus;
  credentialType: AuthCredentialType;
  expiresAt: number | null;
  message: string | null;
  errorCategory: Exclude<AuthErrorCategory, 'AUTH_RECOVERED'> | null;
  recoverable: boolean;
}

interface ResolveClaudeAuthStateArgs {
  preferredMethod: PreferredAuthMethod;
  hasApiKey: boolean;
  keychainStatus: ClaudeKeychainStatus;
}

export function sanitizePreferredAuthMethod(
  preferredMethod: string | null | undefined
): PreferredAuthMethod {
  if (preferredMethod === 'oauth' || preferredMethod === 'apikey') {
    return preferredMethod;
  }

  return null;
}

export function resolveClaudeAuthState({
  preferredMethod,
  hasApiKey,
  keychainStatus,
}: ResolveClaudeAuthStateArgs): ResolvedClaudeAuthState {
  const hasOAuth = keychainStatus.hasCredentials;
  const keychainExpired = keychainStatus.entryExists && !keychainStatus.hasCredentials;

  if (preferredMethod === 'apikey') {
    if (hasApiKey) {
      return {
        preferredMethod,
        status: 'authenticated',
        credentialType: 'apikey',
        expiresAt: null,
        message: null,
        errorCategory: null,
        recoverable: false,
      };
    }

    if (hasOAuth) {
      return {
        preferredMethod,
        status: 'authenticated',
        credentialType: 'oauth',
        expiresAt: keychainStatus.expiresAt,
        message: null,
        errorCategory: null,
        recoverable: false,
      };
    }

    if (keychainExpired) {
      return {
        preferredMethod,
        status: 'expired',
        credentialType: 'oauth',
        expiresAt: keychainStatus.expiresAt,
        message: keychainStatus.error ?? 'OAuth token expired. No API key configured.',
        errorCategory: 'REFRESH_FAILED',
        recoverable: true,
      };
    }

    return {
      preferredMethod,
      status: 'error',
      credentialType: 'apikey',
      expiresAt: null,
      message: 'No API key configured. Add one below.',
      errorCategory: 'NO_CREDENTIALS',
      recoverable: true,
    };
  }

  if (preferredMethod === 'oauth') {
    if (hasOAuth) {
      return {
        preferredMethod,
        status: 'authenticated',
        credentialType: 'oauth',
        expiresAt: keychainStatus.expiresAt,
        message: null,
        errorCategory: null,
        recoverable: false,
      };
    }

    if (keychainExpired) {
      return {
        preferredMethod,
        status: 'expired',
        credentialType: 'oauth',
        expiresAt: keychainStatus.expiresAt,
        message: keychainStatus.error ?? 'OAuth expired',
        errorCategory: 'REFRESH_FAILED',
        recoverable: true,
      };
    }

    return {
      preferredMethod,
      status: 'error',
      credentialType: 'oauth',
      expiresAt: null,
      message: 'No OAuth credentials. Sign in with Claude Code.',
      errorCategory: 'NO_CREDENTIALS',
      recoverable: true,
    };
  }

  if (hasApiKey) {
    return {
      preferredMethod,
      status: 'authenticated',
      credentialType: 'apikey',
      expiresAt: null,
      message: null,
      errorCategory: null,
      recoverable: false,
    };
  }

  if (hasOAuth) {
    return {
      preferredMethod,
      status: 'authenticated',
      credentialType: 'oauth',
      expiresAt: keychainStatus.expiresAt,
      message: null,
      errorCategory: null,
      recoverable: false,
    };
  }

  if (keychainExpired) {
    return {
      preferredMethod,
      status: 'expired',
      credentialType: 'oauth',
      expiresAt: keychainStatus.expiresAt,
      message: keychainStatus.error ?? 'OAuth expired',
      errorCategory: 'REFRESH_FAILED',
      recoverable: true,
    };
  }

  return {
    preferredMethod,
    status: 'error',
    credentialType: null,
    expiresAt: null,
    message: 'No credentials configured. Add an API key in Settings or sign in with Claude Code.',
    errorCategory: 'NO_CREDENTIALS',
    recoverable: true,
  };
}

export function applyResolvedClaudeAuthState(
  authStore: Pick<AuthState, 'setAuthenticated' | 'setError' | 'setExpired' | 'setPreferredMethod'>,
  resolved: ResolvedClaudeAuthState
): void {
  authStore.setPreferredMethod(resolved.preferredMethod);

  if (resolved.status === 'authenticated') {
    authStore.setAuthenticated(resolved.credentialType ?? 'oauth', resolved.expiresAt);
    return;
  }

  if (resolved.status === 'expired') {
    authStore.setExpired(
      resolved.message ?? 'Claude authentication expired.',
      resolved.recoverable,
      resolved.expiresAt,
      resolved.credentialType ?? 'oauth'
    );
    return;
  }

  authStore.setError(
    resolved.errorCategory ?? 'NO_CREDENTIALS',
    resolved.message ?? 'No credentials configured.',
    resolved.recoverable,
    resolved.credentialType
  );
}
