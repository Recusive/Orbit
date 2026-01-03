import { ChevronDown, ExternalLink, Globe, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  const wasRunningRef = useRef(isRunning);

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const hostname = getHostname(url);

  return (
    <div>
      <div
        className={cn(
          'bg-card border border-border/50 overflow-hidden transition-all duration-200',
          isExpanded
            ? 'rounded-xl shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'rounded-lg shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 bg-transparent hover:bg-muted/40 active:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-info/10">
              <Globe className={cn('h-3 w-3 text-info/70', isRunning && 'animate-pulse')} />
            </div>
            <span className="text-xs font-medium text-foreground">
              {isRunning ? 'Fetching URL' : 'Fetched URL'}
            </span>
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Collapsible content */}
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden min-h-0">
            {/* URL */}
            <div className="px-2.5 py-2 bg-muted/30">
              <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                url
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenUrl?.(url);
                }}
                className="flex items-center gap-1 group focus:outline-none"
              >
                <code className="bg-muted/50 text-foreground rounded-md px-2 py-1 font-mono text-[11px] group-hover:bg-muted transition-colors truncate max-w-full">
                  {hostname}
                </code>
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>

            {/* Prompt */}
            <div className="h-px bg-border/30 mx-2.5" />
            <div className="px-2.5 py-2">
              <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                prompt
              </div>
              <div className="text-[11px] text-foreground line-clamp-2">{prompt}</div>
            </div>

            {/* Output */}
            <div className="h-px bg-border/30 mx-2.5" />
            <div className="p-2.5">
              {isRunning ? (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  <span>Fetching and processing content...</span>
                </div>
              ) : output ? (
                <div className="bg-muted/40 rounded-lg p-2 border border-border/30 font-mono text-[11px] leading-relaxed text-foreground/90 overflow-x-auto max-h-[200px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-words m-0">{output}</pre>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/60 italic">
                  No content fetched
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
