/**
 * MentionPopover - Self-contained @ mention file picker with fuzzy search
 *
 * Uses nucleo fuzzy matching backend for fast, accurate file search.
 * Handles its own keyboard navigation and displays match highlighting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FuzzySearchResult } from '@/lib/api/search';
import type { FileEntry } from '@/types/agent/context';
import type { FC, ReactNode } from 'react';

import { FileIcon } from '@/components/files/file-icon';
import { Command, CommandEmpty, CommandGroup, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useMentionSearch } from '@/hooks/ui';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

// Measurable interface expected by Radix Popover
interface Measurable {
  getBoundingClientRect(): DOMRect;
}

interface MentionPopoverProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (file: FileEntry) => void;
  readonly anchorRef: React.RefObject<HTMLElement | null>;
}

// ============================================
// Helpers
// ============================================

/**
 * Highlight matched characters in a filename.
 *
 * Uses the matchIndices from nucleo to wrap matched characters in <mark> tags.
 * Handles unicode correctly by iterating over characters, not bytes.
 *
 * @param name - The filename to highlight
 * @param indices - Character indices that matched the query
 * @returns ReactNode with highlighted characters
 */
function highlightMatches(name: string, indices: number[]): ReactNode {
  if (indices.length === 0) {
    return name;
  }

  // Create Set for O(1) lookup
  const matchSet = new Set(indices);

  // Use Array.from to handle unicode correctly (splits by codepoints, not bytes)
  const chars = Array.from(name);

  return chars.map((char, idx) => {
    if (matchSet.has(idx)) {
      return (
        <mark key={idx} className="bg-primary/25 text-foreground rounded-[2px] px-[1px] -mx-[1px]">
          {char}
        </mark>
      );
    }
    return <span key={idx}>{char}</span>;
  });
}

/**
 * Convert FuzzySearchResult to FileEntry format for parent compatibility.
 * Fuzzy search only indexes files (not directories).
 */
function toFileEntry(result: FuzzySearchResult): FileEntry {
  return {
    path: result.path,
    name: result.name,
    isDirectory: false, // Fuzzy search only indexes files
  };
}

// ============================================
// Component
// ============================================

export const MentionPopover: FC<MentionPopoverProps> = ({
  open,
  onOpenChange,
  query,
  onSelect,
  anchorRef,
}) => {
  // Internal selected index state
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fuzzy search hook
  const { results, isLoading, isIndexing, error } = useMentionSearch({
    query,
    enabled: open,
    maxResults: 20,
  });

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Handle selection
  const handleSelect = useCallback(
    (result: FuzzySearchResult): void => {
      onSelect(toFileEntry(result));
      onOpenChange(false);
    },
    [onSelect, onOpenChange]
  );

  // Keyboard navigation - listen globally when open
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      const itemCount = results.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev + 1) % Math.max(1, itemCount));
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev - 1 + Math.max(1, itemCount)) % Math.max(1, itemCount));
          break;

        case 'Enter':
          if (itemCount > 0 && results[selectedIndex]) {
            e.preventDefault();
            e.stopPropagation();
            handleSelect(results[selectedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(false);
          break;
      }
    };

    // Use capture phase to intercept before input handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, results, selectedIndex, handleSelect, onOpenChange]);

  // Cast the anchor ref to Measurable (HTMLElement has getBoundingClientRect)
  const measurableRef = anchorRef as React.RefObject<Measurable>;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={measurableRef} />
      <PopoverContent
        className="w-[320px] p-0 rounded-lg border-border/50 bg-popover/98 backdrop-blur-sm shadow-lg"
        side="top"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <Command shouldFilter={false} className="rounded-lg bg-transparent">
          <CommandList className="scroll-py-2 max-h-[300px]">
            {/* Loading state */}
            {isLoading && results.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <span className="inline-block animate-pulse">Searching...</span>
              </div>
            ) : null}

            {/* Indexing state */}
            {isIndexing ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <span className="inline-block">Indexing files...</span>
                <span className="block text-xs mt-1 opacity-70">
                  This happens once when you open a workspace
                </span>
              </div>
            ) : null}

            {/* Error state */}
            {error && !isIndexing ? (
              <div className="py-6 text-center text-sm text-destructive">{error}</div>
            ) : null}

            {/* No results state - only show when there's a query but no matches */}
            {!isLoading && !isIndexing && !error && results.length === 0 && query.length > 0 ? (
              <CommandEmpty>No files found.</CommandEmpty>
            ) : null}

            {/* Results */}
            {results.length > 0 ? (
              <CommandGroup
                heading="Files"
                className="**:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:text-muted-foreground/60"
              >
                {results.map((result, idx) => (
                  <FileItem
                    key={result.path}
                    result={result}
                    isSelected={selectedIndex === idx}
                    isFirst={idx === 0}
                    isLast={idx === results.length - 1}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// ============================================
// FileItem Component
// ============================================

interface FileItemProps {
  readonly result: FuzzySearchResult;
  readonly isSelected: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onSelect: (result: FuzzySearchResult) => void;
}

const FileItem: FC<FileItemProps> = ({ result, isSelected, isFirst, isLast, onSelect }) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when selected
  useEffect(() => {
    if (isSelected && itemRef.current) {
      const el = itemRef.current;
      const container = el.closest('[cmdk-list]');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        if (isFirst || elRect.top < containerRect.top) {
          // Scroll to show item at top with padding
          container.scrollTop = el.offsetTop - 8;
        } else if (isLast || elRect.bottom > containerRect.bottom) {
          // Scroll to show item at bottom with padding
          container.scrollTop = el.offsetTop - container.clientHeight + el.offsetHeight + 8;
        }
      }
    }
  }, [isSelected, isFirst, isLast]);

  // Get the directory path (the result.path is relative, e.g., "src/components/Button.tsx")
  const dirPath = result.path.split('/').slice(0, -1).join('/');

  return (
    <div
      ref={itemRef}
      onClick={() => {
        onSelect(result);
      }}
      className={cn(
        'relative flex cursor-pointer gap-2.5 select-none items-center px-2.5 py-2 outline-none transition-[background-color,border-color,transform] duration-150',
        isSelected
          ? 'rounded-r-md bg-primary/10 text-foreground border-l-2 border-primary/60 pl-2'
          : 'rounded-md hover:bg-muted/50 active:scale-[0.99]'
      )}
    >
      <FileIcon fileName={result.name} className="h-4 w-4 shrink-0" monochrome={false} />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate text-base font-medium">
          {highlightMatches(result.name, result.matchIndices)}
        </span>
        {dirPath ? (
          <span className="truncate text-sm text-muted-foreground/60">{dirPath}</span>
        ) : null}
      </div>
    </div>
  );
};
