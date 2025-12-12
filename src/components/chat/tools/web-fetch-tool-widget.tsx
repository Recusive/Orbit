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

// Get display hostname from URL
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
    <div className="my-2 rounded-md border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => { setIsExpanded(!isExpanded); }}
        className={cn(
          'w-full flex items-center justify-between bg-muted px-3 py-1.5 hover:bg-accent/50 transition-colors',
          isExpanded && 'border-b border-border'
        )}
      >
        <div className="flex items-center gap-2">
          <Globe className={cn(
            'h-3.5 w-3.5',
            isRunning ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground'
          )} />
          <span className="text-sm font-medium text-foreground">
            {isRunning ? 'Fetching URL' : 'Fetched URL'}
          </span>
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <ChevronDown className={cn(
          'h-4 w-4 text-muted-foreground transition-transform',
          isExpanded && 'rotate-180'
        )} />
      </button>

      {/* Collapsible content */}
      {isExpanded ? (
        <>
          {/* URL */}
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">URL:</span>
              <button
                type="button"
                onClick={() => { onOpenUrl?.(url); }}
                className="flex items-center gap-1.5 min-w-0 group focus:outline-none"
              >
                <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono truncate group-hover:bg-accent transition-colors">
                  {hostname}
                </code>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>

          {/* Prompt */}
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">Prompt:</span>
              <span className="text-foreground line-clamp-2">{prompt}</span>
            </div>
          </div>

          {/* Output */}
          <div className="p-3">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Fetching and processing content...</span>
              </div>
            ) : output ? (
              <div className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
                <pre className="break-words whitespace-pre-wrap text-foreground">
                  {output}
                </pre>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                No content fetched
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
