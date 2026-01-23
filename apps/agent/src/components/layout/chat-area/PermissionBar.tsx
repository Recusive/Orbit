import type { PermissionBarProps } from './types';
import type { FC } from 'react';

import { PermissionModal } from '@/components/modals';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';

/**
 * Permission bar displaying pending permission requests
 *
 * Rendered above the chat input in both empty and messages states.
 * Uses CHAT_WIDTH constants for consistent max-width with chat container.
 */
export const PermissionBar: FC<PermissionBarProps> = ({ permissions, onApprove, onDeny }) => {
  if (permissions.length === 0) {
    return null;
  }

  return (
    <div className="px-4 shrink-0">
      <div
        className="mx-auto"
        style={{
          maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
        }}
      >
        {permissions.map((request) => (
          <PermissionModal
            key={request.requestId}
            request={request}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        ))}
      </div>
    </div>
  );
};
