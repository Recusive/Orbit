import { CheckCircle2, ChevronRight, Globe, Loader2, Search, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { z } from 'zod';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface WebSearchToolWidgetProps {
  readonly query: string;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenUrl?: (url: string) => void;
}

interface SearchResult {
  title: string;
  url: string;
  snippet?: string | undefined;
}

// Zod schema for search result items
const SearchResultItemSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().optional(),
  })
  .strict();

const SearchResultsSchema = z.array(SearchResultItemSchema);

function parseSearchResults(output: string | undefined): SearchResult[] {
  if (!output) return [];

  try {
    const json: unknown = JSON.parse(output);
    const result = SearchResultsSchema.safeParse(json);
    if (result.success) {
      return result.data.filter((r) => r.url.length > 0);
    }
  } catch {
    // Not JSON, try parsing as text
  }

  const results: SearchResult[] = [];
  const lines = output.split('\n');
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

  for (const line of lines) {
    let match = mdLinkRegex.exec(line);
    while (match !== null) {
      results.push({
        title: match[1] ?? match[2] ?? '',
        url: match[2] ?? '',
      });
      match = mdLinkRegex.exec(line);
    }

    if (results.length === 0) {
      let urlMatch = urlRegex.exec(line);
      while (urlMatch !== null) {
        results.push({
          title: urlMatch[0],
          url: urlMatch[0],
        });
        urlMatch = urlRegex.exec(line);
      }
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const WebSearchToolWidget: FC<WebSearchToolWidgetProps> = ({
  query,
  output,
  isRunning = false,
  success,
  onOpenUrl,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const results = parseSearchResults(output);
  const resultCount = results.length;

  const statusLabel = isRunning ? 'Searching the web' : 'Web Search';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Web Search output' : 'Expand Web Search output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name + count + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <Search
            className={cn(
              'h-4 w-4 shrink-0',
              isFailed ? 'text-destructive/60' : 'text-foreground',
              isRunning && 'animate-pulse'
            )}
          />

          <span
            className={cn(
              'text-sm font-medium truncate',
              isFailed ? 'text-lg-text-secondary line-through' : 'text-lg-text-secondary'
            )}
          >
            {statusLabel}
          </span>

          {!isRunning && !isFailed && resultCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              ({resultCount} {resultCount === 1 ? 'result' : 'results'})
            </span>
          ) : null}

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
              <div className="flex flex-row">
                {/* Gutter: vertical connector line */}
                <div className="w-4 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-full',
                      success === undefined && 'bg-info/40'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-info) 40%, transparent) 70%, color-mix(in oklch, #22c55e 50%, transparent) 100%)'
                              : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-info) 40%, transparent) 70%, color-mix(in oklch, #ef4444 50%, transparent) 100%)',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-xl border border-black/10 dark:border-white/5 bg-chat-area dark:bg-[oklch(23%_0_0)] overflow-hidden">
                  {/* Query */}
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1.5">
                      query
                    </div>
                    <code className="block bg-lg-control rounded-lg px-2 py-1 font-mono text-sm text-foreground">
                      {query}
                    </code>
                  </div>

                  {/* Results */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Searching for results...</span>
                      </div>
                    ) : results.length > 0 ? (
                      <div className="relative max-h-[200px] overflow-y-auto bg-lg-control rounded-lg p-2">
                        {results.map((result, index) => (
                          <button
                            key={`${result.url}-${String(index)}`}
                            type="button"
                            onClick={() => {
                              onOpenUrl?.(result.url);
                            }}
                            className="block w-full text-left rounded-md p-1.5 hover:bg-lg-control transition-colors focus:outline-none cursor-pointer"
                          >
                            <div className="relative flex items-start gap-2">
                              {/* Vertical connecting line */}
                              {index < results.length - 1 ? (
                                <div
                                  className="absolute left-[8px] top-[18px] w-[2px] rounded-full bg-border/50"
                                  style={{ height: 'calc(100% + 4px)' }}
                                />
                              ) : null}
                              <div className="relative z-10 w-4 h-4 rounded flex items-center justify-center bg-info/10 shrink-0 mt-0.5">
                                <Globe className="h-2.5 w-2.5 text-info/70" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-foreground mb-0.5 line-clamp-2 text-sm font-medium">
                                  {result.title}
                                </div>
                                <div className="text-muted-foreground truncate font-mono text-xs">
                                  {getHostname(result.url)}
                                </div>
                                {result.snippet ? (
                                  <div className="text-lg-text-secondary mt-0.5 line-clamp-2 text-xs">
                                    {result.snippet}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">No results found</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom status indicator */}
              {!isRunning && success !== undefined ? (
                <div className="flex flex-row items-center py-1">
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
                <div className="flex flex-row h-1">
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
