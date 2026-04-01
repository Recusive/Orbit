import { ChevronRight, Loader2, Wrench, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';

import {
  TOOL_EXPAND_ENTER,
  TOOL_EXPAND_EXIT,
  TOOL_EXPAND_TRANSITION_NONE,
  useToolWidgetExpanded,
} from './shared';

import type { FC } from 'react';

import { cn, formatMcpToolName } from '@/lib/utils';

interface GenericToolWidgetProps {
  readonly toolId: string;
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly toolOutput?: unknown;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function formatToolName(toolName: string): string {
  const mcp = formatMcpToolName(toolName);
  if (mcp !== null) {
    return mcp;
  }

  return toolName.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export const GenericToolWidget: FC<GenericToolWidgetProps> = ({
  toolId,
  toolName,
  toolInput,
  toolOutput,
  isRunning = false,
  success,
}) => {
  const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();
  const title = useMemo(() => formatToolName(toolName), [toolName]);
  const input = useMemo(() => formatValue(toolInput), [toolInput]);
  const output = useMemo(() => formatValue(toolOutput), [toolOutput]);

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? `Collapse ${title} output` : `Expand ${title} output`}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-1.5 rounded-xl py-1.5 text-left text-base'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-lg-text-secondary shrink-0" />
          ) : (
            <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="truncate font-medium text-foreground">{title}</span>
          {isFailed ? <XCircle className="h-3 w-3 text-destructive/60 shrink-0" /> : null}
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-[rotate,opacity] duration-200 ease-out group-hover:opacity-100',
              isExpanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        </div>
      </button>

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
            <div className="my-1.5 overflow-hidden rounded-xl border border-border-tool bg-tool-output-bg">
              <div className="px-3 py-2">
                <div className="mb-1.5 text-[9px] font-medium tracking-wide text-muted-foreground">
                  input
                </div>
                <pre className="overflow-x-auto rounded-lg bg-lg-control px-2 py-1 text-sm text-foreground whitespace-pre-wrap wrap-break-word">
                  {input || '{}'}
                </pre>
              </div>
              <div className="mx-3 h-px bg-border/20" />
              <div className="px-3 py-2">
                <div className="mb-1.5 text-[9px] font-medium tracking-wide text-muted-foreground">
                  output
                </div>
                {isRunning && output.length === 0 ? (
                  <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Tool is still running...</span>
                  </div>
                ) : output.length > 0 ? (
                  <pre className="overflow-x-auto rounded-lg bg-lg-control px-2 py-1 text-sm text-foreground whitespace-pre-wrap wrap-break-word">
                    {output}
                  </pre>
                ) : (
                  <div className="text-sm italic text-muted-foreground">No output</div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
