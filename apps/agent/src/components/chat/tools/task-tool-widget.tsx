import { Bot, ChevronDown, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';
import { z } from 'zod';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

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
  description,
  prompt,
  subagentType,
  model,
  output,
  isRunning = false,
  success,
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

  const formattedType = formatSubagentType(subagentType);
  const statusLabel = isRunning ? 'Running Task' : isFailed ? 'Task Failed' : 'Completed Task';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        className={cn(
          'group/status flex items-center gap-2 py-1.5 px-2.5 text-sm',
          'transition-colors duration-150 cursor-pointer w-full text-left',
          'rounded-lg hover:bg-muted/20',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        <div
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center shrink-0',
            'transition-colors duration-150',
            isFailed
              ? 'bg-destructive/8 group-hover/status:bg-destructive/12'
              : 'bg-primary/8 group-hover/status:bg-primary/12'
          )}
        >
          <Bot
            className={cn(
              'h-3 w-3 transition-colors duration-150',
              isFailed
                ? 'text-destructive/60 group-hover/status:text-destructive/80'
                : 'text-primary/60 group-hover/status:text-primary/80',
              isRunning && 'animate-pulse'
            )}
          />
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={cn(
              'text-xs font-medium truncate',
              isFailed
                ? 'text-muted-foreground line-through'
                : 'text-muted-foreground/70 group-hover/status:text-foreground/90'
            )}
          >
            {statusLabel}
          </span>
          <span className="text-xs text-muted-foreground/50 truncate">{description}</span>
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground shrink-0" />
          ) : null}
        </div>

        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/40 transition-transform duration-200 ease-out shrink-0',
            isExpanded && 'rotate-180'
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
                  <div className="w-px h-full bg-border/40" />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-border/40 bg-card/50 overflow-hidden">
                  {/* Task details */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="text-[9px] font-medium tracking-wide text-muted-foreground/50 uppercase">
                        agent
                      </div>
                      <span className="px-1 py-0.5 rounded bg-muted/50 text-sm font-medium text-foreground">
                        {formattedType}
                      </span>
                      {model ? (
                        <span className="text-sm text-muted-foreground/50">({model})</span>
                      ) : null}
                    </div>
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground/50 uppercase mb-1">
                      prompt
                    </div>
                    <div className="text-sm text-foreground/80 line-clamp-3" title={prompt}>
                      {truncatePrompt(prompt, 300)}
                    </div>
                  </div>

                  {/* Output */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Agent is working on the task...</span>
                      </div>
                    ) : output ? (
                      <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none text-sm">
                        <Streamdown remarkPlugins={[remarkGfm]} rehypePlugins={[]}>
                          {parseTaskOutput(output)}
                        </Streamdown>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground/40 italic">Task completed</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom connector stub */}
              <div className="flex flex-row h-1 px-2.5">
                <div className="w-5 flex justify-center">
                  <div className="w-px h-full bg-border/20" />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
