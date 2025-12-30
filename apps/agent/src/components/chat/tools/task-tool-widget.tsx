import { Bot, ChevronDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface ContentBlock {
  type: string;
  text?: string;
}

function parseTaskOutput(output: string): string {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as ContentBlock[])
        .filter(
          (block): block is ContentBlock & { text: string } =>
            block.type === 'text' && typeof block.text === 'string'
        )
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
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const formattedType = formatSubagentType(subagentType);

  return (
    <div>
      <div
        className={cn(
          'rounded-xl bg-card overflow-hidden transition-all duration-200',
          isExpanded
            ? 'shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-transparent hover:bg-muted/40 active:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary/10">
              <Bot className={cn('h-3.5 w-3.5 text-primary/70', isRunning && 'animate-pulse')} />
            </div>
            <span className="text-[13px] font-medium text-foreground">
              {isRunning ? 'Running Task' : 'Completed Task'}
            </span>
            <span className="text-xs text-muted-foreground/60">{description}</span>
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
          </div>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Collapsible content */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isExpanded ? 'opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          {/* Task details */}
          <div className="px-3.5 py-3 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase">
                agent
              </div>
              <span className="px-1.5 py-0.5 rounded-md bg-muted/50 text-xs font-medium text-foreground">
                {formattedType}
              </span>
              {model ? <span className="text-xs text-muted-foreground/60">({model})</span> : null}
            </div>
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
              prompt
            </div>
            <div className="text-xs text-foreground line-clamp-3" title={prompt}>
              {truncatePrompt(prompt, 300)}
            </div>
          </div>

          {/* Output */}
          <div className="h-px bg-border/30 mx-3.5" />
          <div className="p-3.5">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Agent is working on the task...</span>
              </div>
            ) : output ? (
              <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none text-sm">
                <Streamdown remarkPlugins={[remarkGfm]} rehypePlugins={[]}>
                  {parseTaskOutput(output)}
                </Streamdown>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60 italic">Task completed</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
