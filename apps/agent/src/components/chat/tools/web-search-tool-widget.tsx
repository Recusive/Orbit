import { ChevronDown, Globe, Loader2, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

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

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const results = parseSearchResults(output);
  const resultCount = results.length;

  return (
    <div>
      <div
        className={cn(
          'bg-card overflow-hidden transition-[border-color,opacity,box-shadow] duration-200',
          isFailed
            ? 'border-2 border-dotted border-destructive/40 opacity-60'
            : 'border border-border/50',
          isExpanded ? 'rounded-lg shadow-xl' : 'rounded-lg shadow-md'
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
                isFailed ? 'bg-destructive/10' : 'bg-info/10'
              )}
            >
              <Search
                className={cn(
                  'h-3 w-3',
                  isFailed ? 'text-destructive/70' : 'text-info/70',
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
              {isRunning ? 'Searching the web' : isFailed ? 'Web search failed' : 'Web search'}
            </span>
            {!isRunning && !isFailed && resultCount > 0 ? (
              <span className="text-sm text-muted-foreground/60">
                ({resultCount} {resultCount === 1 ? 'result' : 'results'})
              </span>
            ) : null}
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
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
        <AnimatePresence initial={false} mode="wait">
          {isExpanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                opacity: { duration: 0.15, ease: 'easeOut' },
              }}
              style={{ overflow: 'hidden' }}
            >
              {/* Query */}
              <div className="px-2.5 py-2 bg-muted/30">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                  query
                </div>
                <code className="block bg-muted/50 rounded-md px-2 py-1 font-mono text-sm text-foreground">
                  {query}
                </code>
              </div>

              {/* Results */}
              <div className="h-px bg-border/30 mx-2.5" />
              <div className="p-2.5">
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
                  <div className="text-sm text-muted-foreground/60 italic">No results found</div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
