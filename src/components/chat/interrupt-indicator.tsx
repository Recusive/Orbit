import { XCircle } from 'lucide-react';

import type { FC } from 'react';

interface InterruptIndicatorProps {
  readonly onFeedback: () => void;
}

export const InterruptIndicator: FC<InterruptIndicatorProps> = ({ onFeedback }) => {
  return (
    <div className="flex items-center gap-2 py-2 text-destructive/70">
      {/* X Circle Icon */}
      <XCircle className="h-4 w-4" />

      {/* Action Button */}
      <button
        onClick={onFeedback}
        className="text-xs hover:text-destructive hover:underline transition-colors"
      >
        What can Orbit do differently?
      </button>

      {/* Divider line */}
      <div className="flex-1 h-px bg-destructive/30" />
    </div>
  );
};
