import type { AuthCredentialType } from '@/stores/agent/auth-store';

export interface ClassifiedError {
  kind: 'auth' | 'generic';
  title: string;
  description: string;
  actionLabel?: string;
  copyCommand?: string;
}

const AUTH_ERROR_PATTERN =
  /no credentials found|oauth.*token|auth(?:entication|orization)?\s+(?:failed|error)|unauthorized|invalid.*(?:api[_ ]?key|token|credential)|401/i;

export function classifyAgentError(
  message: string,
  credentialType: AuthCredentialType
): ClassifiedError {
  if (!AUTH_ERROR_PATTERN.test(message)) {
    return {
      kind: 'generic',
      title: 'Agent Error',
      description: message,
    };
  }

  if (/no credentials/i.test(message) || credentialType === null) {
    return {
      kind: 'auth',
      title: 'Authentication Required',
      description:
        'No Claude credentials are configured. Add an API key in Settings or sign in with Claude Code.',
      actionLabel: 'Open Account Settings',
    };
  }

  if (credentialType === 'apikey') {
    return {
      kind: 'auth',
      title: 'Authentication Error',
      description: 'Authentication failed. Update your API key in Settings to continue.',
      actionLabel: 'Open Account Settings',
    };
  }

  return {
    kind: 'auth',
    title: 'Authentication Error',
    description:
      'Authentication failed. Re-authenticate with Claude Code to continue sending messages.',
    actionLabel: 'Copy claude login',
    copyCommand: 'claude login',
  };
}
