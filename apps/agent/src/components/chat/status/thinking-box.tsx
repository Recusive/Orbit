import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from '../tools/shared';

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
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${String(seconds)} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${String(minutes)} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${String(minutes)}m ${String(remainingSeconds)}s`;
};

export const ThinkingBox: FC<ThinkingBoxProps> = ({
  thinking,
  thinkingDurationMs = 0,
  defaultExpanded = false,
  isStreaming = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || isStreaming);
  const wasStreamingRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  // Auto-expand when streaming starts, auto-collapse when streaming ends
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      setIsExpanded(true);
    } else if (!isStreaming && wasStreamingRef.current) {
      setIsExpanded(false);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

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
          'group/status flex items-center gap-2 py-1.5 px-2.5 text-sm',
          'transition-colors duration-150 cursor-pointer w-full text-left',
          'rounded-lg hover:bg-muted/40'
        )}
        aria-expanded={isExpanded}
        aria-label={`Thought for ${durationText}, ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        <div
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center shrink-0',
            'transition-colors duration-150',
            'bg-violet-500/8 group-hover/status:bg-violet-500/12'
          )}
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn(
              'text-violet-500/60 group-hover/status:text-violet-500/80 transition-colors duration-150',
              isStreaming && 'animate-pulse'
            )}
          >
            <path
              d="M7 21V16.267C7 15.9401 6.83705 15.6376 6.58354 15.4312C5.00702 14.1477 4 12.1914 4 10C4 6.13401 7.13401 3 11 3C14.7645 3 17.8349 5.97158 17.9936 9.69702C18.002 9.89426 18.0584 10.0877 18.1679 10.2519L19.7376 12.6064C19.8848 12.8272 19.8339 13.1246 19.6216 13.2838L18.4 14.2C18.1482 14.3889 18 14.6852 18 15V16C18 17.1046 17.1046 18 16 18H15C14.4477 18 14 18.4477 14 19V21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11.9059 7.94536L11.4756 6.82667C11.3999 6.62986 11.2109 6.5 11 6.5C10.7891 6.5 10.6001 6.62986 10.5244 6.82667L10.0941 7.94536C9.89094 8.47354 9.47355 8.89094 8.94536 9.09409L7.82667 9.52436C7.62986 9.60005 7.5 9.78914 7.5 10C7.5 10.2109 7.62986 10.3999 7.82667 10.4756L8.94536 10.9059C9.47354 11.1091 9.89094 11.5265 10.0941 12.0546L10.5244 13.1733C10.6001 13.3701 10.7891 13.5 11 13.5C11.2109 13.5 11.3999 13.3701 11.4756 13.1733L11.9059 12.0546C12.1091 11.5265 12.5265 11.1091 13.0546 10.9059L14.1733 10.4756C14.3701 10.3999 14.5 10.2109 14.5 10C14.5 9.78914 14.3701 9.60005 14.1733 9.52436L13.0546 9.09409C12.5265 8.89094 12.1091 8.47355 11.9059 7.94536Z"
              fill="currentColor"
            />
          </svg>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs font-medium truncate text-muted-foreground/90 group-hover/status:text-foreground">
            {isStreaming ? 'Thinking' : 'Thought'}
          </span>
          <span className="text-xs text-muted-foreground/50">
            {isStreaming ? '' : `for ${durationText}`}
          </span>
        </div>

        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/40 transition-transform duration-200 ease-out shrink-0',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Tree-style expanded content */}
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
              <div className="flex flex-row px-2.5">
                {/* Gutter: vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div className="w-px h-full bg-violet-500/40" />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-border/40 bg-card overflow-hidden">
                  <div className="px-3 py-2 max-h-[500px] overflow-y-auto">
                    <div className="text-sm text-muted-foreground/60 leading-[1.7] whitespace-pre-wrap font-mono tracking-tighter">
                      {tokenizedThinking ?? thinking}
                    </div>
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
