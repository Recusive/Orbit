/**
 * SyncStatus - Ahead/behind remote indicator
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import React from 'react';

import type { GitStatus } from '@/lib/api';

interface SyncStatusProps {
  status: GitStatus;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ status }) => {
  if (status.ahead === 0 && status.behind === 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {status.ahead > 0 ? (
        <span className="flex items-center gap-0.5">
          <ArrowUp className="h-3 w-3" />
          {status.ahead}
        </span>
      ) : null}
      {status.behind > 0 ? (
        <span className="flex items-center gap-0.5">
          <ArrowDown className="h-3 w-3" />
          {status.behind}
        </span>
      ) : null}
    </div>
  );
};
