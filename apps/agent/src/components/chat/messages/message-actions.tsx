import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

interface MessageActionsProps {
  readonly showDisclaimer?: boolean;
  readonly rewindDisabled?: boolean;
  readonly onCopy?: () => void;
  readonly onLike?: () => void;
  readonly onDislike?: () => void;
  readonly onRewind?: () => void;
}

export const MessageActions: FC<MessageActionsProps> = ({
  showDisclaimer = false,
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
    'h-6 w-6 flex items-center justify-center rounded-md bg-transparent text-muted-foreground/70 transition-all duration-150 hover:bg-muted/50 hover:text-foreground hover:scale-[1.08] active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50';

  return (
    <div className="mt-3 flex flex-col gap-2 items-end">
      <div className="flex items-center gap-1">
        <button
          className={iconButtonClasses}
          title={copied ? 'Copied!' : 'Copy'}
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button className={iconButtonClasses} title="Like" onClick={onLike}>
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button className={iconButtonClasses} title="Dislike" onClick={onDislike}>
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
        <button
          className={`h-6 px-2.5 flex items-center rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 ${
            rewindDisabled
              ? 'bg-muted/30 text-muted-foreground/50 cursor-not-allowed'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:scale-[1.02] active:scale-[0.98]'
          }`}
          title={rewindDisabled ? 'Cannot rewind last message' : 'Rewind'}
          onClick={rewindDisabled ? undefined : onRewind}
          disabled={rewindDisabled}
        >
          Rewind
        </button>
      </div>
      {showDisclaimer ? (
        <p className="text-sm text-muted-foreground/60">
          Orbit is AI and can make mistakes. Please double-check responses.
        </p>
      ) : null}
    </div>
  );
};
