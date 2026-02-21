import { CheckCircle2, ChevronRight, ExternalLink, Globe, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface WebFetchToolWidgetProps {
  readonly url: string;
  readonly prompt: string;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
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
  success,
  onOpenUrl,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const hostname = getHostname(url);
  const statusLabel = isRunning ? 'Fetching URL' : 'Web Fetch';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Web Fetch output' : 'Expand Web Fetch output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 px-2.5 text-sm',
          'cursor-pointer w-full text-left rounded-lg',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center shrink-0',
              isFailed ? 'bg-destructive/8' : 'bg-info/8'
            )}
          >
            <Globe
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/60' : 'text-info/60',
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          <span
            className={cn(
              'text-xs font-medium truncate',
              isFailed ? 'text-lg-text-secondary line-through' : 'text-lg-text-secondary'
            )}
          >
            {statusLabel}
          </span>

          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
          ) : null}
        </div>

        <div className="flex-1" />

        {/* Right: chevron */}
        <ChevronRight
          className={cn(
            'h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-[rotate,opacity] duration-200 ease-out shrink-0',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {/* Tree-style expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_TRANSITION}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col">
              <div className="flex flex-row px-2.5">
                {/* Gutter: vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-full',
                      success === undefined && 'bg-info/40'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-info) 40%, transparent) 70%, color-mix(in oklch, #22c55e 50%, transparent) 100%)'
                              : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-info) 40%, transparent) 70%, color-mix(in oklch, #ef4444 50%, transparent) 100%)',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border border-lg-separator bg-card overflow-hidden">
                  {/* URL */}
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1.5">
                      url
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenUrl?.(url);
                      }}
                      className="flex items-center gap-1 group focus:outline-none"
                    >
                      <code className="bg-lg-control text-foreground rounded-md px-2 py-1 font-mono text-sm group-hover:bg-lg-control transition-colors truncate max-w-full">
                        {hostname}
                      </code>
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </div>

                  {/* Prompt */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                      prompt
                    </div>
                    <div className="text-sm text-lg-text-secondary line-clamp-2">{prompt}</div>
                  </div>

                  {/* Output */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Fetching and processing content...</span>
                      </div>
                    ) : output ? (
                      <div className="bg-lg-control rounded-md p-2 font-mono text-sm leading-relaxed text-foreground overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
                        <pre className="whitespace-pre-wrap wrap-break-word m-0">{output}</pre>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">No content fetched</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom status indicator */}
              {!isRunning && success !== undefined ? (
                <div className="flex flex-row items-center px-2.5 py-1">
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center shrink-0',
                      isFailed ? 'bg-red-500/15' : 'bg-green-500/15'
                    )}
                  >
                    {isFailed ? (
                      <XCircle className="h-3 w-3 text-red-500/80" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-green-500/80" />
                    )}
                  </div>
                  <span className="ml-2.5 text-xs text-lg-text-secondary">
                    {isFailed ? 'Failed' : 'Completed'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-row h-1 px-2.5">
                  <div className="w-5 flex justify-center">
                    <div className="w-[2px] rounded-full h-full bg-border/20" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
