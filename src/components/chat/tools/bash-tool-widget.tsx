import { ChevronDown, Loader2, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface BashToolWidgetProps {
  readonly command: string;
  readonly description?: string | undefined;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean;
}

export const BashToolWidget: FC<BashToolWidgetProps> = ({
  command,
  description,
  output,
  isRunning = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [highlightedCommand, setHighlightedCommand] = useState<string>('');

  // Syntax highlight the command
  useEffect(() => {
    let mounted = true;

    const highlightCommand = async (): Promise<void> => {
      try {
        const html = await codeToHtml(command, {
          lang: 'bash',
          theme: 'github-dark',
        });
        if (mounted) {
          setHighlightedCommand(html);
        }
      } catch {
        // Fallback to plain text
        if (mounted) {
          setHighlightedCommand('');
        }
      }
    };

    void highlightCommand();

    return () => {
      mounted = false;
    };
  }, [command]);

  // Truncate long output for collapsed view
  const maxCollapsedLines = 10;
  const outputLines = output?.split('\n') ?? [];
  const hasMoreLines = outputLines.length > maxCollapsedLines;
  const displayOutput = isExpanded ? output : outputLines.slice(0, maxCollapsedLines).join('\n');

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
          <Terminal className={cn(
            'h-3.5 w-3.5',
            isRunning ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground'
          )} />
          <span className="text-sm font-medium text-foreground">
            {isRunning ? 'Running Bash' : 'Ran Bash'}
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
          {/* Command & Description */}
          <div className="border-b border-border space-y-1.5 px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">Command:</span>
              {highlightedCommand ? (
                <div
                  className="flex-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs overflow-x-auto [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent"
                  dangerouslySetInnerHTML={{ __html: highlightedCommand }}
                />
              ) : (
                <code className="flex-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground break-all">
                  {command}
                </code>
              )}
            </div>
            {description ? (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Description:</span>
                <span className="text-muted-foreground">{description}</span>
              </div>
            ) : null}
          </div>

          {/* Output */}
          <div className="p-3">
            {isRunning && !output ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Running command...</span>
              </div>
            ) : output ? (
              <div className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
                <pre className="break-words whitespace-pre-wrap text-foreground">
                  {displayOutput}
                </pre>
                {hasMoreLines ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {outputLines.length} lines total
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                No output
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
