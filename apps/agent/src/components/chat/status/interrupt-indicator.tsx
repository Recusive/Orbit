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

export const InterruptIndicator: FC<InterruptIndicatorProps> = ({ reason }) => {
  const isRejection = reason !== undefined;
  const Icon = isRejection ? CircleDashed : SquareIcon;
  const label = isRejection ? reason : 'Response interrupted';

  return (
    <div className="group flex w-full items-center gap-3 py-1.5">
      {/* Left line */}
      <div className="flex-1 border-t border-dashed border-destructive/20" />

      {/* Centered icon + label */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Icon className="h-3 w-3 text-destructive/50" />
        <span className="text-[11px] font-medium text-destructive/50">{label}</span>
      </div>

      {/* Right line */}
      <div className="flex-1 border-t border-dashed border-destructive/20" />
    </div>
  );
};
