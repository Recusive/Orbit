/**
 * InterruptIndicator — Shown when a message was interrupted or a question was rejected.
 *
 * Two variants controlled by the `reason` prop:
 * - **Interrupted** (no reason): SquarePause icon + "Retry" button
 * - **Rejected** (reason set): CircleDashed icon + reason text + "Retry" button
 */
import { CircleDashed, SquareIcon } from 'lucide-react';

import type { FC } from 'react';

interface InterruptIndicatorProps {
  readonly onFeedback: () => void;
  /** When set, renders the "rejected" variant with this text. Otherwise renders "interrupted". */
  readonly reason?: string | undefined;
}

export const InterruptIndicator: FC<InterruptIndicatorProps> = ({ onFeedback, reason }) => {
  const isRejection = reason !== undefined;
  const Icon = isRejection ? CircleDashed : SquareIcon;
  const label = isRejection ? reason : 'Response interrupted';

  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-destructive/[0.08] border border-destructive/[0.12]">
      <div className="flex items-center gap-2">
        <Icon className="h-[13px] w-[13px] text-destructive shrink-0" />
        <span className="text-xs font-medium text-destructive">{label}</span>
      </div>
      <button
        onClick={onFeedback}
        className="text-[11px] text-destructive/80 bg-destructive/[0.08] border border-destructive/[0.15] rounded-md px-2.5 py-0.5 cursor-pointer hover:bg-destructive/[0.12] transition-colors"
        type="button"
      >
        Retry
      </button>
    </div>
  );
};
