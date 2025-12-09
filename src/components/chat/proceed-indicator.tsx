import { Zap } from 'lucide-react';

import type { FC } from 'react';

export interface ProceedIndicatorProps {
  className?: string;
}

export const ProceedIndicator: FC<ProceedIndicatorProps> = ({
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 ${className}`}
      title="Auto-proceeding"
    >
      <Zap className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
      <span className="text-xs font-medium text-yellow-900 dark:text-yellow-100">
        Auto-proceed
      </span>
    </div>
  );
};
