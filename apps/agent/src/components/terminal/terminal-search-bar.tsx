import { CaseSensitive, ChevronDown, ChevronUp, Regex, WholeWord, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FC, KeyboardEvent } from 'react';

interface TerminalSearchBarProps {
  /** Called when user searches forward (Enter or down arrow) */
  readonly onFindNext: (query: string, options: SearchOptions) => boolean;
  /** Called when user searches backward (Shift+Enter or up arrow) */
  readonly onFindPrevious: (query: string, options: SearchOptions) => boolean;
  /** Called when search is closed */
  readonly onClose: () => void;
  /** Called when search is cleared (query changed or closed) */
  readonly onClear: () => void;
}

export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

export const TerminalSearchBar: FC<TerminalSearchBarProps> = ({
  onFindNext,
  onFindPrevious,
  onClose,
  onClear,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [hasResults, setHasResults] = useState<boolean | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear search when query changes
  useEffect(() => {
    if (!query) {
      onClear();
      setHasResults(null);
    }
  }, [query, onClear]);

  const getOptions = useCallback(
    (): SearchOptions => ({
      caseSensitive,
      regex,
      wholeWord,
    }),
    [caseSensitive, regex, wholeWord]
  );

  const handleFindNext = useCallback((): void => {
    if (query) {
      const found = onFindNext(query, getOptions());
      setHasResults(found);
    }
  }, [query, onFindNext, getOptions]);

  const handleFindPrevious = useCallback((): void => {
    if (query) {
      const found = onFindPrevious(query, getOptions());
      setHasResults(found);
    }
  }, [query, onFindPrevious, getOptions]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          handleFindPrevious();
        } else {
          handleFindNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [handleFindNext, handleFindPrevious, onClose]
  );

  const handleClose = useCallback((): void => {
    onClear();
    onClose();
  }, [onClear, onClose]);

  // Toggle button styles
  const toggleClass = (active: boolean): string =>
    `h-6 w-6 flex items-center justify-center rounded transition-colors ${
      active
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    }`;

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-card border-b border-border">
      <div className="relative flex-1 max-w-xs">
        <input
          ref={inputRef}
          type="text"
          className={`w-full h-7 px-2 text-xs bg-background border rounded outline-none focus:ring-1 focus:ring-ring ${
            hasResults === false ? 'border-destructive' : 'border-border'
          }`}
          placeholder="Find in terminal..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        {hasResults === false && query ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-destructive">
            No results
          </span>
        ) : null}
      </div>

      {/* Navigation buttons */}
      <button
        className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        onClick={handleFindPrevious}
        disabled={!query}
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        onClick={handleFindNext}
        disabled={!query}
        title="Next match (Enter)"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-1" />

      {/* Option toggles */}
      <button
        className={toggleClass(caseSensitive)}
        onClick={() => {
          setCaseSensitive(!caseSensitive);
        }}
        title="Match case"
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </button>
      <button
        className={toggleClass(wholeWord)}
        onClick={() => {
          setWholeWord(!wholeWord);
        }}
        title="Match whole word"
      >
        <WholeWord className="h-3.5 w-3.5" />
      </button>
      <button
        className={toggleClass(regex)}
        onClick={() => {
          setRegex(!regex);
        }}
        title="Use regular expression"
      >
        <Regex className="h-3.5 w-3.5" />
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-1" />

      {/* Close button */}
      <button
        className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        onClick={handleClose}
        title="Close (Escape)"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
