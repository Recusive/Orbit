import { CheckCircle2, ChevronDown, Globe, Loader2, Search, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
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
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const wasRunningRef = useRef(isRunning);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

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
              : 'bg-info/8 group-hover/status:bg-info/12'
          )}
        >
          <Search
            className={cn(
              'h-3 w-3 transition-colors duration-150',
              isFailed
                ? 'text-destructive/60 group-hover/status:text-destructive/80'
                : 'text-info/60 group-hover/status:text-info/80',
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
                : 'text-muted-foreground/90 group-hover/status:text-foreground'
            )}
          >
            {statusLabel}
          </span>
          {!isRunning && !isFailed && resultCount > 0 ? (
            <span className="text-xs text-muted-foreground/70">
              ({resultCount} {resultCount === 1 ? 'result' : 'results'})
            </span>
          ) : null}
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground shrink-0" />
          ) : null}
        </div>

        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/70 transition-transform duration-200 ease-out shrink-0',
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
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-border/40 bg-card overflow-hidden">
                  {/* Query */}
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground/70 uppercase mb-1.5">
                      query
                    </div>
                    <code className="block bg-muted/40 rounded-md px-2 py-1 font-mono text-sm text-foreground">
                      {query}
                    </code>
                  </div>

                  {/* Results */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Searching for results...</span>
                      </div>
                    ) : results.length > 0 ? (
                      <div className="relative max-h-[200px] overflow-y-auto">
                        {results.map((result, index) => (
                          <button
                            key={`${result.url}-${String(index)}`}
                            type="button"
                            onClick={() => {
                              onOpenUrl?.(result.url);
                            }}
                            className="block w-full text-left rounded-md p-1.5 hover:bg-muted/40 transition-colors focus:outline-none cursor-pointer"
                          >
                            <div className="relative flex items-start gap-2">
                              {/* Vertical connecting line */}
                              {index < results.length - 1 ? (
                                <div
                                  className="absolute left-[8px] top-[18px] w-px bg-border/50"
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
                                <div className="text-muted-foreground/60 truncate font-mono text-xs">
                                  {getHostname(result.url)}
                                </div>
                                {result.snippet ? (
                                  <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                                    {result.snippet}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground/40 italic">
                        No results found
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom status indicator */}
              {!isRunning && success !== undefined ? (
                <div className="flex flex-row items-center px-2.5 py-1">
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center shrink-0',
                      isFailed ? 'bg-red-500/15' : 'bg-green-500/15'
                    )}
                  >
                    {isFailed ? (
                      <XCircle className="h-3 w-3 text-red-500/80" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-green-500/80" />
                    )}
                  </div>
                  <span className="ml-2.5 text-xs text-muted-foreground/90">
                    {isFailed ? 'Failed' : 'Completed'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-row h-1 px-2.5">
                  <div className="w-5 flex justify-center">
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
