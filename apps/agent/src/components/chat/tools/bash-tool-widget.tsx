import { ChevronDown, Loader2, Terminal } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  TOOL_CARD_BASE,
  TOOL_CHEVRON_BASE,
  TOOL_EXPAND_TRANSITION,
  TOOL_EXPAND_TRANSITION_NONE,
} from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

/**
 * Module-level singleton for Shiki import.
 * Without this, 10+ bash tool widgets mounting simultaneously would each fire
 * a separate dynamic import (module cache deduplicates the fetch, but each
 * creates a separate Promise allocation and microtask). Hoisting to a singleton
 * ensures only one import is in-flight and all consumers share the same Promise.
 * (Code review: Opus cycle 1, issue #15)
 */
let shikiPromise: Promise<{
  codeToHtml: (code: string, options: { lang: string; theme: string }) => Promise<string>;
}> | null = null;

function getShiki(): Promise<{
  codeToHtml: (code: string, options: { lang: string; theme: string }) => Promise<string>;
}> {
  shikiPromise ??= import('shiki');
  return shikiPromise;
}

/**
 * Subscribe to theme changes on the html element.
 * Uses MutationObserver to detect when 'dark' class is toggled.
 */
function subscribeToTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return (): void => {
    observer.disconnect();
  };
}

/** Get current dark mode state from DOM */
function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** Server-side fallback (defaults to dark) */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Hook to detect dark mode using React 19's useSyncExternalStore.
 * This is the correct, concurrency-safe way to subscribe to external DOM state.
 * Works correctly even inside memoized components.
 */
function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerSnapshot);
}

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

  // Truncate long output for collapsed view
  const maxCollapsedLines = 10;
  const outputLines = output?.split('\n') ?? [];
  const hasMoreLines = outputLines.length > maxCollapsedLines;
  const displayOutput = isExpanded ? output : outputLines.slice(0, maxCollapsedLines).join('\n');

  return (
    <div>
      <div
        className={cn(
          TOOL_CARD_BASE,
          'rounded-lg shadow-md',
          isFailed
            ? 'border-2 border-dotted border-destructive/40 opacity-60'
            : 'border border-border/50'
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
              <span className="text-xs text-destructive/60">Failed</span>
            ) : null}
          </div>
          <ChevronDown className={cn(TOOL_CHEVRON_BASE, isExpanded && 'rotate-180')} />
        </button>

        {/* Collapsible content */}
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
              {/* Command section */}
              <div className="px-2.5 py-2 bg-muted/30">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                  command
                </div>
                {highlightedCommand ? (
                  <div
                    className="bg-muted/50 rounded-md px-2 py-1 font-mono text-sm overflow-x-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent"
                    dangerouslySetInnerHTML={{ __html: highlightedCommand }}
                  />
                ) : (
                  <code className="block bg-muted/50 rounded-md px-2 py-1 font-mono text-sm text-foreground break-all">
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
                    <div className="text-sm text-muted-foreground">{description}</div>
                  </div>
                </>
              ) : null}

              {/* Output section */}
              <div className="h-px bg-border/30 mx-2.5" />
              <div className="p-2.5">
                {isRunning && !output ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Running command...</span>
                  </div>
                ) : output ? (
                  <div className="bg-muted/40 rounded-lg p-2 border border-border/30 font-mono text-sm leading-relaxed text-foreground/90 overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
                    <pre className="whitespace-pre-wrap break-words m-0">{displayOutput}</pre>
                    {hasMoreLines ? (
                      <div className="mt-1.5 text-muted-foreground/60">
                        {String(outputLines.length)} lines total
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground/60 italic">No output</div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
