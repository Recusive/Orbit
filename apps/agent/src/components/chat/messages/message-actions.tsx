import { Check, ClockFading, Copy, Rewind, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

import type { FC, ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MessageActionsProps {
  readonly rewindDisabled?: boolean;
  readonly turnDurationMs?: number | undefined;
  readonly onCopy?: () => void;
  readonly onLike?: () => void;
  readonly onDislike?: () => void;
  readonly onRewind?: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${String(totalSeconds)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${String(minutes)}m ${String(seconds)}s` : `${String(minutes)}m`;
}

interface ActionButtonProps {
  readonly label: string;
  readonly className?: string | undefined;
  readonly disabled?: boolean;
  readonly onClick?: (() => void) | undefined;
  readonly children: ReactNode;
}

const ActionButton: FC<ActionButtonProps> = ({ label, className, disabled, onClick, children }) => {
  const iconButtonClasses =
    'h-6 w-6 flex items-center justify-center rounded-[9px] bg-transparent text-muted-foreground/70 transition-[background-color,color] duration-150 hover:bg-lg-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(iconButtonClasses, className)}
          aria-label={label}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
};

export const MessageActions: FC<MessageActionsProps> = ({
  rewindDisabled = false,
  turnDurationMs,
  onCopy,
  onLike,
  onDislike,
  onRewind,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    onCopy?.();
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div className="mt-3 flex items-center justify-between opacity-0 transition-opacity duration-150 group-hover/actions:opacity-100 focus-within:opacity-100">
      {turnDurationMs !== undefined && turnDurationMs > 0 ? (
        <span className="flex items-center gap-1 text-xs tabular-nums text-lg-text-secondary">
          <ClockFading className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDuration(turnDurationMs)}
        </span>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1">
        <ActionButton label={copied ? 'Copied!' : 'Copy'} onClick={handleCopy}>
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </ActionButton>
        <ActionButton label="Like" onClick={onLike}>
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton
          label="Dislike"
          onClick={() => {
            onDislike?.();
          }}
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton
          label={rewindDisabled ? 'Cannot rewind last message' : 'Rewind'}
          className={
            rewindDisabled
              ? 'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground/70'
              : undefined
          }
          disabled={rewindDisabled}
          onClick={onRewind}
        >
          <Rewind className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
      </div>
    </div>
  );
};
