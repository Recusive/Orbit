import { CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface SkillToolWidgetProps {
  readonly skillName: string;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
}

export const SkillToolWidget: FC<SkillToolWidgetProps> = ({
  skillName,
  isRunning = false,
  success,
}) => {
  const isFailed = success === false;
  const isComplete = !isRunning && success === true;

  return (
    <div
      className={cn('flex items-center gap-2 py-1.5 text-sm rounded-xl', isFailed && 'opacity-60')}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Icon */}
        <Sparkles
          className={cn(
            'h-4 w-4 shrink-0',
            isFailed ? 'text-destructive/60' : 'text-foreground',
            isRunning && 'animate-pulse'
          )}
        />

        {/* Label */}
        <span className="text-sm text-lg-text-secondary font-medium">Skill</span>

        {/* Skill name */}
        <span
          className={cn(
            'text-sm font-medium truncate',
            isFailed ? 'text-lg-text-secondary' : 'text-foreground'
          )}
        >
          {skillName}
        </span>

        {/* Status indicator */}
        {isRunning ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
        ) : null}

        {isComplete ? (
          <span className="flex items-center gap-1 text-xs text-success/80">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>Loaded</span>
          </span>
        ) : null}

        {isFailed ? (
          <span className="flex items-center gap-1 text-xs text-destructive/60">
            <XCircle className="h-3 w-3 shrink-0" />
            <span>Failed</span>
          </span>
        ) : null}
      </div>
    </div>
  );
};
