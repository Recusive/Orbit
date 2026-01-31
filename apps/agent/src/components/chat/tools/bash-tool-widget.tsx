import { ChevronDown, Loader2, Terminal } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import {
  getShiki,
  TOOL_EXPAND_TRANSITION,
  TOOL_EXPAND_TRANSITION_NONE,
  useIsDarkMode,
} from './shared';

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
  const isDarkMode = useIsDarkMode();
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();
  // Start expanded if running, collapsed if already completed (restored from persistence)
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const [highlightedCommand, setHighlightedCommand] = useState<string>('');
  const [highlightedOutput, setHighlightedOutput] = useState<string>('');
  const wasRunningRef = useRef(isRunning);

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  // Syntax highlight the command (responds to theme changes via MutationObserver)
  useEffect(() => {
    let mounted = true;
    const shikiTheme = isDarkMode ? 'github-dark' : 'github-light';

    const highlightCommand = async (): Promise<void> => {
      try {
        // Lazy-load Shiki only when first bash output needs highlighting.
        // Shiki's WASM bundle (~1.5MB) is excluded from the initial chunk,
        // reducing startup time for users who haven't seen bash output yet.
        const { codeToHtml } = await getShiki();
        const html = await codeToHtml(command, {
          lang: 'bash',
          theme: shikiTheme,
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
  }, [command, isDarkMode]);

  // Syntax highlight the output
  useEffect(() => {
    let mounted = true;

    if (!output) {
      setHighlightedOutput('');
      return;
    }

    const shikiTheme = isDarkMode ? 'github-dark' : 'github-light';

    const highlightOutput = async (): Promise<void> => {
      try {
        const { codeToHtml } = await getShiki();
        const html = await codeToHtml(output, {
          lang: 'log',
          theme: shikiTheme,
        });
        if (mounted) {
          setHighlightedOutput(html);
        }
      } catch {
        if (mounted) {
          setHighlightedOutput('');
        }
      }
    };

    void highlightOutput();

    return () => {
      mounted = false;
    };
  }, [output, isDarkMode]);

  // Truncate long output for collapsed view
  const maxCollapsedLines = 10;
  const outputLines = output?.split('\n') ?? [];
  const hasMoreLines = outputLines.length > maxCollapsedLines;
  const displayOutput = isExpanded ? output : outputLines.slice(0, maxCollapsedLines).join('\n');

  const statusLabel = isRunning ? 'Running Bash' : isFailed ? 'Bash Failed' : 'Ran Bash';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row like Read widget */}
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
          <Terminal
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
      {/* PERF: Removed mode="wait" — it forces sequential exit→enter animations,
       * causing 49+ queued fadeOut animations when many tools complete simultaneously.
       * Default mode ("sync") allows parallel animations, cutting CPU from 5.5% to ~1%. */}
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
              {/* Content node with vertical line from header icon */}
              <div className="flex flex-row px-2.5">
                {/* Gutter: vertical connector line aligned under header icon */}
                <div className="w-5 flex justify-center shrink-0">
                  <div className="w-px h-full bg-border/40" />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-border/40 bg-card/50 overflow-hidden">
                  {/* Command section */}
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground/50 uppercase mb-1.5">
                      command
                    </div>
                    {highlightedCommand ? (
                      <div
                        className="bg-muted/40 rounded-md px-2 py-1 font-mono text-sm [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:!bg-transparent"
                        dangerouslySetInnerHTML={{ __html: highlightedCommand }}
                      />
                    ) : (
                      <code className="block bg-muted/40 rounded-md px-2 py-1 font-mono text-sm text-foreground break-all">
                        {command}
                      </code>
                    )}
                  </div>

                  {/* Description section */}
                  {description ? (
                    <>
                      <div className="h-px bg-border/20 mx-3" />
                      <div className="px-3 py-2">
                        <div className="text-[9px] font-medium tracking-wide text-muted-foreground/50 uppercase mb-1">
                          description
                        </div>
                        <div className="text-sm text-muted-foreground/80">{description}</div>
                      </div>
                    </>
                  ) : null}

                  {/* Output section */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground/50 uppercase mb-1.5">
                      output
                    </div>
                    {isRunning && !output ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Running command...</span>
                      </div>
                    ) : output ? (
                      <div className="bg-muted/30 rounded-md p-2 font-mono text-sm leading-relaxed text-foreground/90 overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
                        {highlightedOutput ? (
                          <div
                            className="[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
                            dangerouslySetInnerHTML={{ __html: highlightedOutput }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap break-words m-0">{displayOutput}</pre>
                        )}
                        {hasMoreLines ? (
                          <div className="mt-1.5 text-muted-foreground/50 text-xs">
                            {String(outputLines.length)} lines total
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground/40 italic">No output</div>
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
