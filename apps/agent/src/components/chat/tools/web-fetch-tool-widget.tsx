import { ChevronRight, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useContext } from 'react';

import {
  TOOL_EXPAND_ENTER,
  TOOL_EXPAND_EXIT,
  TOOL_EXPAND_TRANSITION_NONE,
  ToolWidgetSessionContext,
  useObservedSessionLayoutMutation,
  useToolWidgetMotionDisabled,
  useToolWidgetExpanded,
} from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface WebFetchToolWidgetProps {
  readonly toolId: string;
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
  toolId,
  url,
  prompt,
  output,
  isRunning = false,
  success,
  onOpenUrl,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId);
  const isFailed = success === false;
  const layoutFrozen = useToolWidgetMotionDisabled();
  const reduceMotionPreference = useReducedMotion();
  const shouldReduceMotion = (reduceMotionPreference ?? false) || layoutFrozen;
  const sessionId = useContext(ToolWidgetSessionContext);
  const contentRef = useObservedSessionLayoutMutation<HTMLDivElement>(
    sessionId,
    'web-fetch-output',
    `${url}\n${prompt}\n${output ?? ''}`,
    isExpanded
  );

  const hostname = getHostname(url);
  const statusLabel = isRunning ? 'Fetching URL' : 'Web Fetch';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={isExpanded ? 'Collapse Web Fetch output' : 'Expand Web Fetch output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-base',
          'cursor-pointer w-full text-left rounded-xl'
        )}
      >
        {/* Left: tool name + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-base font-medium truncate', 'text-foreground')}>
            {statusLabel}
          </span>

          {isFailed ? <XCircle className="h-3 w-3 text-destructive/60 shrink-0" /> : null}

          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
          ) : null}

          <ChevronRight
            className={cn(
              'h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-[rotate,opacity] duration-200 ease-out shrink-0',
              isExpanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Tree-style expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { height: 0, opacity: 0, transition: TOOL_EXPAND_EXIT }
            }
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_ENTER}
            style={{ overflow: 'hidden' }}
            ref={contentRef}
          >
            {/* Content box */}
            <div className="min-w-0 my-1.5 rounded-xl border border-border-tool bg-tool-output-bg overflow-hidden">
              {/* URL */}
              <div className="px-3 py-2">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground capitalize mb-1.5">
                  url
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onOpenUrl?.(url);
                  }}
                  className="flex items-center gap-1 group focus:outline-none"
                >
                  <code className="bg-lg-control text-foreground rounded-lg px-2 py-1 font-mono text-sm group-hover:bg-lg-control transition-colors truncate max-w-full">
                    {hostname}
                  </code>
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>

              {/* Prompt */}
              <div className="h-px bg-border/20 mx-3" />
              <div className="px-3 py-2">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground capitalize mb-1">
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
                  <div className="bg-lg-control rounded-lg p-2 font-mono text-sm leading-relaxed text-foreground overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
                    <pre className="whitespace-pre-wrap wrap-break-word m-0">{output}</pre>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">No content fetched</div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
