import type { OcPermissionAsked } from '@/types/opencode';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';

interface OcPermissionCardProps {
  readonly permission: OcPermissionAsked;
  readonly onReply: (requestId: string, reply: 'once' | 'always' | 'reject') => Promise<void>;
}

export const OcPermissionCard: FC<OcPermissionCardProps> = ({ permission, onReply }) => {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/8 px-4 py-3">
      <div className="text-sm font-medium text-foreground">{permission.permission}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {permission.patterns.length > 0 ? permission.patterns.join(', ') : 'Approval required'}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            void onReply(permission.id, 'once');
          }}
        >
          Allow once
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void onReply(permission.id, 'always');
          }}
        >
          Always allow
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void onReply(permission.id, 'reject');
          }}
        >
          Deny
        </Button>
      </div>
    </div>
  );
};
