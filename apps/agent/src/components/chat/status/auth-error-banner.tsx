import { useShallow } from 'zustand/shallow';

import { NotifyUserCard } from './notify-user-card';

import type { NotificationAction } from './notify-user-card';
import type { FC } from 'react';

import { useAuthStore } from '@/stores/agent/auth-store';
import { useUIStore } from '@/stores/ui/ui-store';

function buildMessage(
  status: 'expired' | 'no_credentials' | 'error',
  credentialType: 'oauth' | 'apikey' | null,
  lastError: string | null
): string {
  if (lastError !== null && lastError !== '') {
    return lastError;
  }

  if (status === 'no_credentials') {
    return 'No Claude credentials are configured. Add an API key in Settings or sign in with Claude Code.';
  }

  if (credentialType === 'apikey') {
    return 'The stored API key is no longer working. Update the key in Settings to continue.';
  }

  return 'Claude authentication expired. Re-authenticate to continue sending messages.';
}

export const AuthErrorBanner: FC = () => {
  const { status, credentialType, lastError, recoverable } = useAuthStore(
    useShallow((state) => ({
      status: state.status,
      credentialType: state.credentialType,
      lastError: state.lastError,
      recoverable: state.recoverable,
    }))
  );

  if (status === 'unknown' || status === 'authenticated') {
    return null;
  }

  const message = buildMessage(status, credentialType, lastError);
  const openAccountSettings = (): void => {
    useUIStore.getState().openSettings('account');
  };

  const actions: NotificationAction[] = [
    {
      label: 'Open Account Settings',
      onClick: openAccountSettings,
      variant: credentialType === 'apikey' ? 'primary' : 'default',
    },
  ];

  if (credentialType !== 'apikey' && recoverable) {
    actions.push({
      label: 'Copy claude login',
      onClick: (): void => {
        void navigator.clipboard.writeText('claude login');
      },
      variant: 'primary',
    });
  }

  return (
    <div className="px-3 pt-3">
      <NotifyUserCard
        type={status === 'no_credentials' ? 'warning' : 'error'}
        message={message}
        actions={actions}
      />
    </div>
  );
};
