import { Check, Copy, Rewind, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

import type { FC, ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MessageActionsProps {
  readonly rewindDisabled?: boolean;
  readonly onCopy?: () => void;
  readonly onLike?: () => void;
  readonly onDislike?: () => void;
  readonly onRewind?: () => void;
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
    'h-6 w-6 flex items-center justify-center rounded-md bg-transparent text-muted-foreground/70 transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground hover:scale-[1.08] active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50';

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
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
};

export const MessageActions: FC<MessageActionsProps> = ({
  rewindDisabled = false,
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
    <div className="mt-3 flex flex-col gap-2 items-end">
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
        <ActionButton label="Dislike" onClick={onDislike}>
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton
          label={rewindDisabled ? 'Cannot rewind last message' : 'Rewind'}
          className={
            rewindDisabled
              ? 'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground/70 hover:scale-100'
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
