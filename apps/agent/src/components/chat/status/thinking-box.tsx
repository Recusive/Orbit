import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';

import { TOOL_EXPAND_ENTER, TOOL_EXPAND_EXIT, TOOL_EXPAND_TRANSITION_NONE } from '../tools/shared';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Word-boundary split that preserves whitespace as its own token (matches rehypeFlowTokens). */
const WORD_BOUNDARY = /(\s+)/;

/**
 * Tokenize text into flow-token spans for per-word streaming animation.
 * Mirrors the rehypeFlowTokens rehype plugin, but operates on plain text
 * rather than a HAST tree. Each word gets a <span class="flow-token">;
 * whitespace is preserved as plain text between spans.
 */
function tokenizeThinking(text: string): ReactNode[] {
  const parts = text.split(WORD_BOUNDARY);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined || part.length === 0) continue;

    if (/^\s+$/.test(part)) {
      // Whitespace — render as plain text (no animation wrapper)
      nodes.push(part);
    } else {
      // Word — wrap in flow-token span for CSS fade-in
      nodes.push(
        <span key={i} className="flow-token">
          {part}
        </span>
      );
    }
  }

  return nodes;
}

interface ThinkingBoxProps {
  readonly thinking: string;
  readonly thinkingDurationMs?: number | undefined;
  readonly defaultExpanded?: boolean | undefined;
  /** When true, auto-expand; when transitions to false, auto-collapse */
  readonly isStreaming?: boolean | undefined;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${String(ms)}ms`;
  }
  const seconds = Math.round(ms / 100) / 10; // one decimal place
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${String(minutes)}m ${String(remainingSeconds)}s`;
};

export const ThinkingBox: FC<ThinkingBoxProps> = ({
  thinking,
  thinkingDurationMs = 0,
  defaultExpanded = false,
  isStreaming = false,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const shouldReduceMotion = useReducedMotion();

  const durationText = formatDuration(thinkingDurationMs);

  // Tokenize thinking text for per-word fade-in during streaming.
  // Memoized to avoid re-splitting on every render — only recomputes when text changes.
  // Once streaming ends, we render plain text (zero extra DOM from spans).
  const tokenizedThinking = useMemo(
    () => (isStreaming ? tokenizeThinking(thinking) : null),
    [thinking, isStreaming]
  );

  return (
    <div className="min-w-0">
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-base',
          'cursor-pointer w-full text-left rounded-xl'
        )}
        aria-expanded={isExpanded}
        aria-label={`Thought for ${durationText}, ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        {/* Left: label + duration + chevron */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <span className="text-base font-medium truncate text-foreground">
            {isStreaming ? 'Thinking' : 'Thought'}
          </span>

          {!isStreaming && thinkingDurationMs > 0 ? (
            <span className="text-base text-muted-foreground">for {durationText}</span>
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
            <div className="min-w-0 my-1.5 rounded-xl border border-lg-separator bg-card overflow-hidden">
              <div className="px-3 py-2 max-h-[500px] overflow-y-auto">
                <div className="text-sm text-muted-foreground/90 dark:text-muted-foreground/60 leading-[1.7] whitespace-pre-wrap font-mono tracking-tighter">
                  {tokenizedThinking ?? thinking}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
