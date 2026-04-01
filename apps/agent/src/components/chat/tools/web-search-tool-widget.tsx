import { ChevronRight, Globe, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { z } from 'zod';

import {
  TOOL_EXPAND_ENTER,
  TOOL_EXPAND_EXIT,
  TOOL_EXPAND_TRANSITION_NONE,
  useToolWidgetExpanded,
} from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface WebSearchToolWidgetProps {
  readonly toolId: string;
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
  toolId,
  query,
  output,
  isRunning = false,
  success,
  onOpenUrl,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const results = parseSearchResults(output);
  const resultCount = results.length;

  const statusLabel = isRunning ? 'Searching the web' : 'Web Search';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={isExpanded ? 'Collapse Web Search output' : 'Expand Web Search output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-base',
          'cursor-pointer w-full text-left rounded-xl'
        )}
      >
        {/* Left: tool name + count + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-base font-medium truncate', 'text-foreground')}>
            {statusLabel}
          </span>

          {isFailed ? <XCircle className="h-3 w-3 text-destructive/60 shrink-0" /> : null}

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
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { height: 0, opacity: 0, transition: TOOL_EXPAND_EXIT }
            }
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_ENTER}
            style={{ overflow: 'hidden' }}
          >
            {/* Content box */}
            <div className="min-w-0 my-1.5 rounded-xl border border-border-tool bg-tool-output-bg overflow-hidden">
              {/* Query */}
              <div className="px-3 py-2">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground capitalize mb-1.5">
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
