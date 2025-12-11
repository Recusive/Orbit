import { ChevronDown, Globe, Loader2, Search } from 'lucide-react';
import { useState } from 'react';

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

// Parse search results from output
// Expected format: JSON array or markdown-style list
function parseSearchResults(output: string | undefined): SearchResult[] {
  if (!output) return [];

  // Try parsing as JSON first
  try {
    const parsed: unknown = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object'
        )
        .map((item) => ({
          title: typeof item['title'] === 'string' ? item['title'] : '',
          url: typeof item['url'] === 'string' ? item['url'] : '',
          snippet: typeof item['snippet'] === 'string' ? item['snippet'] : undefined,
        }))
        .filter((r) => r.url.length > 0);
    }
  } catch {
    // Not JSON, try parsing as text
  }

  // Parse markdown-style links: [title](url) or just URLs
  const results: SearchResult[] = [];
  const lines = output.split('\n');

  // Markdown link pattern: [title](url)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  // URL pattern for standalone URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

  for (const line of lines) {
    // Try markdown links first
    let match = mdLinkRegex.exec(line);
    while (match !== null) {
      results.push({
        title: match[1] ?? match[2] ?? '',
        url: match[2] ?? '',
      });
      match = mdLinkRegex.exec(line);
    }

    // If no markdown links found, try standalone URLs
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

  // Deduplicate by URL
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// Get display hostname from URL
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
    <div className="my-2 rounded-md border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => { setIsExpanded(!isExpanded); }}
        className={cn(
          'w-full flex items-center justify-between bg-muted px-3 py-1.5 hover:bg-accent/50 transition-colors',
          isExpanded && 'border-b border-border'
        )}
      >
        <div className="flex items-center gap-2">
          <Search className={cn(
            'h-3.5 w-3.5',
            isRunning ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground'
          )} />
          <span className="text-sm font-medium text-foreground">
            {isRunning ? 'Searching the web' : 'Web Search Results'}
          </span>
          {!isRunning && resultCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {resultCount} {resultCount === 1 ? 'result' : 'results'}
            </span>
          ) : null}
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <ChevronDown className={cn(
          'h-4 w-4 text-muted-foreground transition-transform',
          isExpanded && 'rotate-180'
        )} />
      </button>

      {/* Collapsible content */}
      {isExpanded ? (
        <>
          {/* Query */}
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Query:</span>
              <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono">
                {query}
              </code>
            </div>
          </div>

          {/* Results */}
          <div className="p-3">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Searching for results...</span>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-2">
                {results.map((result, index) => (
                  <button
                    key={`${result.url}-${String(index)}`}
                    type="button"
                    onClick={() => { onOpenUrl?.(result.url); }}
                    className="block w-full text-left rounded-md p-2.5 hover:bg-muted/50 transition-colors focus:outline-none cursor-pointer"
                  >
                    <div className="relative flex items-start gap-2">
                      {/* Icon with timeline */}
                      <div className="relative mt-0.5 shrink-0">
                        <Globe className="h-3.5 w-3.5" style={{ color: '#9B8AA6' }} />
                        {/* Vertical timeline line (except for last item) */}
                        {index < results.length - 1 ? (
                          <div
                            className="absolute left-1/2 w-px"
                            style={{
                              top: '18px',
                              height: '32px',
                              transform: 'translateX(-50%)',
                              backgroundColor: '#9B8AA6',
                            }}
                          />
                        ) : null}
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground mb-0.5 line-clamp-2 text-sm font-medium">
                          {result.title}
                        </div>
                        <div className="text-muted-foreground truncate font-mono text-xs">
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
              <div className="text-xs text-muted-foreground italic">
                No results found
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
