import { Bot, ChevronDown, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';
import { z } from 'zod';

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

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const formattedType = formatSubagentType(subagentType);

  return (
    <div>
      <div
        className={cn(
          'bg-card overflow-hidden transition-[border-color,opacity,box-shadow] duration-200',
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
                isFailed ? 'bg-destructive/10' : 'bg-primary/10'
              )}
            >
              <Bot
                className={cn(
                  'h-3 w-3',
                  isFailed ? 'text-destructive/70' : 'text-primary/70',
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
              {isRunning ? 'Running Task' : isFailed ? 'Task Failed' : 'Completed Task'}
            </span>
            <span className="text-sm text-muted-foreground/60">{description}</span>
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
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
        <AnimatePresence initial={false} mode="wait">
          {isExpanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                opacity: { duration: 0.15, ease: 'easeOut' },
              }}
              style={{ overflow: 'hidden' }}
            >
              {/* Task details */}
              <div className="px-2.5 py-2 bg-muted/30">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase">
                    agent
                  </div>
                  <span className="px-1 py-0.5 rounded bg-muted/50 text-sm font-medium text-foreground">
                    {formattedType}
                  </span>
                  {model ? (
                    <span className="text-sm text-muted-foreground/60">({model})</span>
                  ) : null}
                </div>
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                  prompt
                </div>
                <div className="text-sm text-foreground line-clamp-3" title={prompt}>
                  {truncatePrompt(prompt, 300)}
                </div>
              </div>

              {/* Output */}
              <div className="h-px bg-border/30 mx-2.5" />
              <div className="p-2.5">
                {isRunning ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Agent is working on the task...</span>
                  </div>
                ) : output ? (
                  <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none text-sm">
                    <Streamdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[]}
                      cdnUrl="https://esm.sh/shiki/langs"
                    >
                      {parseTaskOutput(output)}
                    </Streamdown>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground/60 italic">Task completed</div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
