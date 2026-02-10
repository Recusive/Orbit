import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface MessageActionsProps {
  readonly rewindDisabled?: boolean;
  readonly onCopy?: () => void;
  readonly onLike?: () => void;
  readonly onDislike?: () => void;
  readonly onRewind?: () => void;
}

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

  const iconButtonClasses =
    'h-6 w-6 flex items-center justify-center rounded-md bg-transparent text-muted-foreground/70 transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground hover:scale-[1.08] active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50';

  return (
    <div className="mt-3 flex flex-col gap-2 items-end">
      <div className="flex items-center gap-1">
        <button
          className={iconButtonClasses}
          aria-label={copied ? 'Copied to clipboard' : 'Copy message'}
          title={copied ? 'Copied!' : 'Copy'}
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          className={iconButtonClasses}
          aria-label="Like response"
          title="Like"
          onClick={onLike}
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          className={iconButtonClasses}
          aria-label="Dislike response"
          title="Dislike"
          onClick={onDislike}
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          className={cn(
            'h-6 px-2.5 flex items-center rounded-md text-sm font-medium',
            'transition-[background-color,color,transform] duration-150',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
            rewindDisabled
              ? 'bg-gray-4/50 text-muted-foreground/50 cursor-not-allowed'
              : 'bg-gray-4 text-gray-12 hover:bg-gray-5 hover:text-foreground hover:scale-[1.02] active:scale-[0.98]'
          )}
          aria-label={rewindDisabled ? 'Cannot rewind last message' : 'Rewind to this point'}
          title={rewindDisabled ? 'Cannot rewind last message' : 'Rewind'}
          onClick={rewindDisabled ? undefined : onRewind}
          disabled={rewindDisabled}
        >
          Rewind
        </button>
      </div>
    </div>
  );
};
