import { ChevronDown, ExternalLink, Globe, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface WebFetchToolWidgetProps {
  readonly url: string;
  readonly prompt: string;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly onOpenUrl?: (url: string) => void;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const WebFetchToolWidget: FC<WebFetchToolWidgetProps> = ({
  url,
  prompt,
  output,
  isRunning = false,
  onOpenUrl,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hostname = getHostname(url);

  return (
    <div>
      <div
        className={cn(
          'rounded-xl bg-card overflow-hidden transition-all duration-200',
          isExpanded
            ? 'shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-transparent hover:bg-muted/40 active:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-info/10">
              <Globe className={cn('h-3.5 w-3.5 text-info/70', isRunning && 'animate-pulse')} />
            </div>
            <span className="text-[13px] font-medium text-foreground">
              {isRunning ? 'Fetching URL' : 'Fetched URL'}
            </span>
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
          </div>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Collapsible content */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isExpanded ? 'opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          {/* URL */}
          <div className="px-3.5 py-3 bg-muted/30">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
              url
            </div>
            <button
              type="button"
              onClick={() => {
                onOpenUrl?.(url);
              }}
              className="flex items-center gap-1.5 group focus:outline-none"
            >
              <code className="bg-muted/50 text-foreground rounded-lg px-2.5 py-1.5 font-mono text-xs group-hover:bg-muted transition-colors truncate max-w-full">
                {hostname}
              </code>
              <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* Prompt */}
          <div className="h-px bg-border/30 mx-3.5" />
          <div className="px-3.5 py-3">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
              prompt
            </div>
            <div className="text-xs text-foreground line-clamp-2">{prompt}</div>
          </div>

          {/* Output */}
          <div className="h-px bg-border/30 mx-3.5" />
          <div className="p-3.5">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Fetching and processing content...</span>
              </div>
            ) : output ? (
              <div className="bg-muted/40 rounded-[10px] p-3 border border-border/30 font-mono text-xs leading-relaxed text-foreground/90 overflow-x-auto max-h-[300px] overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words m-0">{output}</pre>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60 italic">No content fetched</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
