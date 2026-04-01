import { ChevronRight, Code, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import {
  TOOL_EXPAND_ENTER,
  TOOL_EXPAND_EXIT,
  TOOL_EXPAND_TRANSITION_NONE,
  useToolWidgetExpanded,
} from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// Stable plugin arrays — defined outside component to prevent recreation on each render
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: never[] = [];
const LINK_SAFETY_DISABLED = { enabled: false } as const;
const CONTROLS_CONFIG = { table: false } as const;

interface CodeSearchToolWidgetProps {
  readonly toolId: string;
  readonly query: string;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
}

export const CodeSearchToolWidget: FC<CodeSearchToolWidgetProps> = ({
  toolId,
  query,
  output,
  isRunning = false,
  success,
}) => {
  const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const statusLabel = isRunning ? 'Searching code' : 'Code Search';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header */}
      <button
        onClick={toggleExpanded}
        aria-label={isExpanded ? 'Collapse Code Search output' : 'Expand Code Search output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-base',
          'cursor-pointer w-full text-left rounded-xl'
        )}
      >
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

      {/* Expandable content */}
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
          >
            <div className="min-w-0 my-1.5 rounded-xl border border-border-tool bg-tool-output-bg overflow-hidden">
              {/* Query */}
              <div className="px-3 py-2">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground capitalize mb-1.5">
                  query
                </div>
                <div className="flex items-center gap-1.5">
                  <Code className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                  <code className="bg-lg-control rounded-lg px-2 py-1 font-mono text-sm text-foreground truncate">
                    {query}
                  </code>
                </div>
              </div>

              {/* Results */}
              <div className="h-px bg-border/20 mx-3" />
              <div className="px-3 py-2">
                {isRunning ? (
                  <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Searching documentation and code examples...</span>
                  </div>
                ) : output ? (
                  <div className="overflow-auto max-h-[400px]">
                    <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none">
                      <Streamdown
                        remarkPlugins={REMARK_PLUGINS}
                        rehypePlugins={REHYPE_PLUGINS}
                        controls={CONTROLS_CONFIG}
                        linkSafety={LINK_SAFETY_DISABLED}
                        mode="static"
                      >
                        {output}
                      </Streamdown>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">No results found</div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
