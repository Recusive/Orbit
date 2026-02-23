import { Bot, CheckCircle2, ChevronRight, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';
import { z } from 'zod';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// Disable Streamdown's built-in link safety modal (desktop app opens URLs via Tauri)
const LINK_SAFETY_DISABLED = { enabled: false } as const;

// Zod schema for task output content blocks
const ContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .strict();

const TaskOutputSchema = z.array(ContentBlockSchema);

function parseTaskOutput(output: string): string {
  try {
    const json: unknown = JSON.parse(output);
    const result = TaskOutputSchema.safeParse(json);
    if (result.success) {
      return result.data
        .filter((block): block is { type: string; text: string } => block.text !== undefined)
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');
    }
    return output;
  } catch {
    return output;
  }
}

interface TaskToolWidgetProps {
  readonly description: string;
  readonly prompt: string;
  readonly subagentType: string;
  readonly model?: string | undefined;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
}

function formatSubagentType(type: string): string {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function truncatePrompt(prompt: string, maxLength = 200): string {
  if (prompt.length <= maxLength) return prompt;
  return prompt.slice(0, maxLength).trim() + '...';
}

export const TaskToolWidget: FC<TaskToolWidgetProps> = ({
  prompt,
  subagentType,
  model,
  output,
  isRunning = false,
  success,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const formattedType = formatSubagentType(subagentType);
  const statusLabel = isRunning ? 'Running Task' : 'Task';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Task output' : 'Expand Task output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 px-2.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center shrink-0',
              isFailed ? 'bg-destructive/8' : 'bg-foreground/8'
            )}
          >
            <Bot
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/60' : 'text-foreground/60',
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
                      success === undefined && 'bg-foreground/20'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-foreground) 20%, transparent) 70%, color-mix(in oklch, #22c55e 50%, transparent) 100%)'
                              : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-foreground) 20%, transparent) 70%, color-mix(in oklch, #ef4444 50%, transparent) 100%)',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-xl border border-black/10 dark:border-white/5 bg-chat-area dark:bg-[oklch(23%_0_0)] overflow-hidden">
                  {/* Task details */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
                        agent
                      </div>
                      <span className="px-1 py-0.5 rounded bg-lg-control text-sm font-medium text-foreground">
                        {formattedType}
                      </span>
                      {model ? (
                        <span className="text-sm text-muted-foreground">({model})</span>
                      ) : null}
                    </div>
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                      prompt
                    </div>
                    <div className="text-sm text-lg-text-secondary line-clamp-3" title={prompt}>
                      {truncatePrompt(prompt, 300)}
                    </div>
                  </div>

                  {/* Output */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Agent is working on the task...</span>
                      </div>
                    ) : output ? (
                      <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none text-sm">
                        <Streamdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[]}
                          linkSafety={LINK_SAFETY_DISABLED}
                        >
                          {parseTaskOutput(output)}
                        </Streamdown>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">Task completed</div>
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
