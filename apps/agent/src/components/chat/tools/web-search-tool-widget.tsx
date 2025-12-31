import { ChevronDown, Globe, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface WebSearchToolWidgetProps {
  readonly query: string;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
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
  onOpenUrl,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const results = parseSearchResults(output);
  const resultCount = results.length;

  return (
    <div>
      <div
        className={cn(
          'rounded-xl bg-card overflow-hidden transition-all duration-200',
          isExpanded
            ? 'shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-transparent hover:bg-muted/40 active:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-info/10">
              <Search className={cn('h-3.5 w-3.5 text-info/70', isRunning && 'animate-pulse')} />
            </div>
            <span className="text-[13px] font-medium text-foreground">
              {isRunning ? 'Searching the web' : 'Web search'}
            </span>
            {!isRunning && resultCount > 0 ? (
              <span className="text-xs text-muted-foreground/60">
                ({resultCount} {resultCount === 1 ? 'result' : 'results'})
              </span>
            ) : null}
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
          </div>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Collapsible content */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isExpanded ? 'opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          {/* Query */}
          <div className="px-3.5 py-3 bg-muted/30">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
              query
            </div>
            <code className="block bg-muted/50 rounded-lg px-2.5 py-1.5 font-mono text-xs text-foreground">
              {query}
            </code>
          </div>

          {/* Results */}
          <div className="h-px bg-border/30 mx-3.5" />
          <div className="p-3.5">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Searching for results...</span>
              </div>
            ) : results.length > 0 ? (
              <div className="relative">
                {results.map((result, index) => (
                  <button
                    key={`${result.url}-${String(index)}`}
                    type="button"
                    onClick={() => {
                      onOpenUrl?.(result.url);
                    }}
                    className="block w-full text-left rounded-lg p-2.5 hover:bg-muted/40 transition-colors focus:outline-none cursor-pointer"
                  >
                    <div className="relative flex items-start gap-2.5">
                      {/* Vertical connecting line */}
                      {index < results.length - 1 ? (
                        <div
                          className="absolute left-[10px] top-[22px] w-px bg-border/50"
                          style={{ height: 'calc(100% + 8px)' }}
                        />
                      ) : null}
                      <div className="relative z-10 w-5 h-5 rounded flex items-center justify-center bg-info/10 shrink-0 mt-0.5">
                        <Globe className="h-3 w-3 text-info/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground mb-0.5 line-clamp-2 text-sm font-medium">
                          {result.title}
                        </div>
                        <div className="text-muted-foreground/60 truncate font-mono text-xs">
                          {getHostname(result.url)}
                        </div>
                        {result.snippet ? (
                          <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                            {result.snippet}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60 italic">No results found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
