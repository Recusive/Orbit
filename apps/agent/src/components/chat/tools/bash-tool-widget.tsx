import { ChevronDown, Loader2, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { codeToHtml } from 'shiki';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface BashToolWidgetProps {
  readonly command: string;
  readonly description?: string | undefined;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
}

export const BashToolWidget: FC<BashToolWidgetProps> = ({
  command,
  description,
  output,
  isRunning = false,
  success,
}) => {
  const isFailed = success === false;
  // Start expanded, collapse when tool completes
  const [isExpanded, setIsExpanded] = useState(true);
  const [highlightedCommand, setHighlightedCommand] = useState<string>('');
  const wasRunningRef = useRef(isRunning);

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

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
          'bg-card overflow-hidden transition-all duration-200',
          isFailed
            ? 'border-2 border-dashed border-destructive/40 opacity-60'
            : 'border border-border/50',
          isExpanded
            ? 'rounded-xl shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'rounded-lg shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
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
              <Terminal
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
              {isRunning ? 'Running Bash' : isFailed ? 'Bash Failed' : 'Ran Bash'}
            </span>
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            ) : isFailed ? (
              <span className="text-[10px] text-destructive/60">Failed</span>
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
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden min-h-0">
            {/* Command section */}
            <div className="px-2.5 py-2 bg-muted/30">
              <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                command
              </div>
              {highlightedCommand ? (
                <div
                  className="bg-muted/50 rounded-md px-2 py-1 font-mono text-[11px] overflow-x-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent"
                  dangerouslySetInnerHTML={{ __html: highlightedCommand }}
                />
              ) : (
                <code className="block bg-muted/50 rounded-md px-2 py-1 font-mono text-[11px] text-foreground break-all">
                  {command}
                </code>
              )}
            </div>

            {/* Description section */}
            {description ? (
              <>
                <div className="h-px bg-border/30 mx-2.5" />
                <div className="px-2.5 py-2">
                  <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                    description
                  </div>
                  <div className="text-[11px] text-muted-foreground">{description}</div>
                </div>
              </>
            ) : null}

            {/* Output section */}
            <div className="h-px bg-border/30 mx-2.5" />
            <div className="p-2.5">
              {isRunning && !output ? (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  <span>Running command...</span>
                </div>
              ) : output ? (
                <div className="bg-muted/40 rounded-lg p-2 border border-border/30 font-mono text-[11px] leading-relaxed text-foreground/90 overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
                  <pre className="whitespace-pre-wrap break-words m-0">{displayOutput}</pre>
                  {hasMoreLines && !isExpanded ? (
                    <div className="mt-1.5 text-muted-foreground/60">
                      {outputLines.length} lines total
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/60 italic">No output</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
