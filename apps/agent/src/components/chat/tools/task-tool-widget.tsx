import { ChevronRight, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';
import { z } from 'zod';

import {
  TOOL_EXPAND_ENTER,
  TOOL_EXPAND_EXIT,
  TOOL_EXPAND_TRANSITION_NONE,
  useToolWidgetExpanded,
} from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// Disable Streamdown's built-in link safety modal (desktop app opens URLs via Tauri)
const LINK_SAFETY_DISABLED = { enabled: false } as const;

// Disable table copy/download controls
const CONTROLS_CONFIG = { table: false } as const;

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
  readonly toolId: string;
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
  toolId,
  prompt,
  subagentType,
  model,
  output,
  isRunning = false,
  success,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const formattedType = formatSubagentType(subagentType);
  const statusLabel = isRunning ? 'Running Task' : 'Task';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={isExpanded ? 'Collapse Task output' : 'Expand Task output'}
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
          >
            {/* Content box */}
            <div className="min-w-0 my-1.5 rounded-xl border border-border-tool bg-tool-output-bg overflow-hidden">
              {/* Task details */}
              <div className="px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="text-[9px] font-medium tracking-wide text-muted-foreground capitalize">
                    agent
                  </div>
                  <span className="px-1 py-0.5 rounded bg-lg-control text-sm font-medium text-foreground">
                    {formattedType}
                  </span>
                  {model ? <span className="text-sm text-muted-foreground">({model})</span> : null}
                </div>
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground capitalize mb-1">
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
                      controls={CONTROLS_CONFIG}
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
