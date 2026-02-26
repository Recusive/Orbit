import { CheckCircle2, ChevronRight, Loader2, Terminal, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

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
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const [highlightedCommand, setHighlightedCommand] = useState<string>('');
  const [highlightedOutput, setHighlightedOutput] = useState<string>('');

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

  const statusLabel = isRunning ? 'Running Bash' : 'Bash';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row like Read widget */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Bash output' : 'Expand Bash output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 px-2.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <Terminal
            className={cn(
              'h-4 w-4 shrink-0',
              isFailed ? 'text-destructive/60' : 'text-foreground',
              isRunning && 'animate-pulse'
            )}
          />

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
                <div className="w-4 flex justify-center shrink-0">
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
                  {/* Command section */}
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1.5">
                      command
                    </div>
                    {highlightedCommand ? (
                      <div
                        className="bg-lg-control rounded-lg px-2 py-1 font-mono text-sm [&_pre]:bg-transparent! [&_pre]:m-0! [&_pre]:p-0! [&_pre]:whitespace-pre-wrap [&_pre]:wrap-break-word [&_code]:bg-transparent!"
                        dangerouslySetInnerHTML={{ __html: highlightedCommand }}
                      />
                    ) : (
                      <code className="block bg-lg-control rounded-lg px-2 py-1 font-mono text-sm text-foreground break-all">
                        {command}
                      </code>
                    )}
                  </div>

                  {/* Description section */}
                  {description ? (
                    <>
                      <div className="h-px bg-border/20 mx-3" />
                      <div className="px-3 py-2">
                        <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                          description
                        </div>
                        <div className="text-sm text-lg-text-secondary">{description}</div>
                      </div>
                    </>
                  ) : null}

                  {/* Output section */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1.5">
                      output
                    </div>
                    {isRunning && !output ? (
                      <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Running command...</span>
                      </div>
                    ) : output ? (
                      <div className="bg-lg-control rounded-lg p-2 font-mono text-sm leading-relaxed text-foreground overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
                        {highlightedOutput ? (
                          /* SECURITY: Safe — highlightedOutput comes from Shiki's codeToHtml() which HTML-escapes all content */
                          <div
                            className="[&_pre]:bg-transparent! [&_pre]:m-0! [&_pre]:p-0! [&_code]:bg-transparent! [&_pre]:whitespace-pre-wrap [&_pre]:wrap-break-word"
                            dangerouslySetInnerHTML={{ __html: highlightedOutput }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap wrap-break-word m-0">
                            {displayOutput}
                          </pre>
                        )}
                        {hasMoreLines ? (
                          <div className="mt-1.5 text-muted-foreground text-xs">
                            {String(outputLines.length)} lines total
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">No output</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom status indicator */}
              {!isRunning ? (
                <div className="flex flex-row items-center px-2.5 py-1">
                  {isFailed ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500/80" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500/80" />
                  )}
                  <span className="ml-2.5 text-xs text-lg-text-secondary">
                    {isFailed ? 'Failed' : 'Completed'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-row h-1 px-2.5">
                  <div className="w-4 flex justify-center">
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
