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
}

export const BashToolWidget: FC<BashToolWidgetProps> = ({
  command,
  description,
  output,
  isRunning = false,
}) => {
  // Start collapsed to prevent layout flash from async Shiki highlighting
  const [isExpanded, setIsExpanded] = useState(false);
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
              <Terminal
                className={cn('h-3.5 w-3.5 text-primary/70', isRunning && 'animate-pulse')}
              />
            </div>
            <span className="text-[13px] font-medium text-foreground">
              {isRunning ? 'Running Bash' : 'Ran Bash'}
            </span>
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
          {/* Command section */}
          <div className="px-3.5 py-3 bg-muted/30">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
              command
            </div>
            {highlightedCommand ? (
              <div
                className="bg-muted/50 rounded-lg px-2.5 py-1.5 font-mono text-xs overflow-x-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent"
                dangerouslySetInnerHTML={{ __html: highlightedCommand }}
              />
            ) : (
              <code className="block bg-muted/50 rounded-lg px-2.5 py-1.5 font-mono text-xs text-foreground break-all">
                {command}
              </code>
            )}
          </div>

          {/* Description section */}
          {description ? (
            <>
              <div className="h-px bg-border/30 mx-3.5" />
              <div className="px-3.5 py-2.5">
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
                  description
                </div>
                <div className="text-xs text-muted-foreground">{description}</div>
              </div>
            </>
          ) : null}

          {/* Output section */}
          <div className="h-px bg-border/30 mx-3.5" />
          <div className="p-3.5">
            {isRunning && !output ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Running command...</span>
              </div>
            ) : output ? (
              <div className="bg-muted/40 rounded-[10px] p-3 border border-border/30 font-mono text-xs leading-relaxed text-foreground/90 overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
                <pre className="whitespace-pre-wrap break-words m-0">{displayOutput}</pre>
                {hasMoreLines && !isExpanded ? (
                  <div className="mt-2 text-muted-foreground/60">
                    {outputLines.length} lines total
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60 italic">No output</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
