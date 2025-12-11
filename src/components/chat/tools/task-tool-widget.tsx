import { Bot, ChevronDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// Content block from SDK output
interface ContentBlock {
  type: string;
  text?: string;
}

// Parse SDK output to extract text content
function parseTaskOutput(output: string): string {
  try {
    // Try to parse as JSON array of content blocks
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as ContentBlock[])
        .filter((block): block is ContentBlock & { text: string } =>
          block.type === 'text' && typeof block.text === 'string'
        )
        .map(block => block.text)
        .join('\n\n');
    }
    // If it's not an array, return as-is
    return output;
  } catch {
    // If not valid JSON, return as-is (plain text output)
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

// Format subagent type for display
function formatSubagentType(type: string): string {
  // Convert kebab-case or snake_case to Title Case
  return type
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Truncate long prompts
function truncatePrompt(prompt: string, maxLength: number = 200): string {
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
    <div className="my-2 rounded-md border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => { setIsExpanded(!isExpanded); }}
        className={cn(
          'w-full flex items-center justify-between bg-muted px-3 py-1.5 hover:bg-accent/50 transition-colors',
          isExpanded && 'border-b border-border'
        )}
      >
        <div className="flex items-center gap-2">
          <Bot className={cn(
            'h-3.5 w-3.5',
            isRunning ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground'
          )} />
          <span className="text-sm font-medium text-foreground">
            {isRunning ? 'Running Task' : 'Completed Task'}
          </span>
          <span className="text-xs text-muted-foreground">
            {description}
          </span>
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <ChevronDown className={cn(
          'h-4 w-4 text-muted-foreground transition-transform',
          isExpanded && 'rotate-180'
        )} />
      </button>

      {/* Collapsible content */}
      {isExpanded ? (
        <>
          {/* Task details */}
          <div className="border-b border-border space-y-1.5 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">Agent:</span>
              <span className="px-1.5 py-0.5 rounded bg-muted text-foreground font-medium">
                {formattedType}
              </span>
              {model ? (
                <span className="text-muted-foreground">
                  ({model})
                </span>
              ) : null}
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">Prompt:</span>
              <span className="text-foreground line-clamp-3" title={prompt}>
                {truncatePrompt(prompt, 300)}
              </span>
            </div>
          </div>

          {/* Output */}
          <div className="p-3">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Agent is working on the task...</span>
              </div>
            ) : output ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_a]:text-primary [&_a]:underline [&_a]:focus:outline-none">
                <Streamdown remarkPlugins={[remarkGfm]} rehypePlugins={[]}>
                  {parseTaskOutput(output)}
                </Streamdown>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Task completed
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
