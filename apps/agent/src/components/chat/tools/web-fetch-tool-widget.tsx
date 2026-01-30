import { ChevronDown, ExternalLink, Globe, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import {
  TOOL_CARD_BASE,
  TOOL_CHEVRON_BASE,
  TOOL_EXPAND_TRANSITION,
  TOOL_EXPAND_TRANSITION_NONE,
} from './shared';

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
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const wasRunningRef = useRef(isRunning);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

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
          TOOL_CARD_BASE,
          isFailed
            ? 'border-2 border-dotted border-destructive/40 opacity-60'
            : 'border border-border/50',
          isExpanded ? 'rounded-lg shadow-xl' : 'rounded-lg shadow-md'
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
            <div
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center',
                isFailed ? 'bg-destructive/10' : 'bg-info/10'
              )}
            >
              <Globe
                className={cn(
                  'h-3 w-3',
                  isFailed ? 'text-destructive/70' : 'text-info/70',
                  isRunning && 'animate-pulse'
                )}
              />
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                isFailed ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {isRunning ? 'Fetching URL' : isFailed ? 'Fetch failed' : 'Fetched URL'}
            </span>
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
            ) : null}
          </div>
          <ChevronDown className={cn(TOOL_CHEVRON_BASE, isExpanded && 'rotate-180')} />
        </button>

        {/* Collapsible content */}
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_TRANSITION}
              style={{ overflow: 'hidden' }}
            >
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
                  <code className="bg-muted/50 text-foreground rounded-md px-2 py-1 font-mono text-sm group-hover:bg-muted transition-colors truncate max-w-full">
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
                <div className="text-sm text-foreground line-clamp-2">{prompt}</div>
              </div>

              {/* Output */}
              <div className="h-px bg-border/30 mx-2.5" />
              <div className="p-2.5">
                {isRunning ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Fetching and processing content...</span>
                  </div>
                ) : output ? (
                  <div className="bg-muted/40 rounded-lg p-2 border border-border/30 font-mono text-sm leading-relaxed text-foreground/90 overflow-x-auto max-h-[200px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap break-words m-0">{output}</pre>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground/60 italic">No content fetched</div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
