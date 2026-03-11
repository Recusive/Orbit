import { Loader2 } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useOcActiveSessionStatus } from '@/stores/opencode';

export const OcStatusIndicator: FC = () => {
  const status = useOcActiveSessionStatus();

  if (!status) {
    return null;
  }

  if (status.type === 'busy') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-control-fill px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    );
  }

  if (status.type === 'retry') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-xs text-warning">
        Retry #{String(status.attempt)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs',
        'bg-success/10 text-success'
      )}
    >
      Idle
    </span>
  );
};
