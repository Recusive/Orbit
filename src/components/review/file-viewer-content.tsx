import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { ViewedFile } from '@/stores/file-viewer-store';
import type { FC } from 'react';

import { MONACO_TOKEN_CSS, tokenizeCode } from '@/lib/monaco-tokenizer';
import { useFileViewerStore } from '@/stores/file-viewer-store';

interface FileViewerContentProps {
  readonly file: ViewedFile;
}

export const FileViewerContent: FC<FileViewerContentProps> = ({ file }) => {
  const searchOpen = useFileViewerStore((state) => state.searchOpen);
  const searchQuery = useFileViewerStore((state) => state.searchQuery);
  const setSearchQuery = useFileViewerStore((state) => state.setSearchQuery);
  const closeSearch = useFileViewerStore((state) => state.closeSearch);
  const setScrollPosition = useFileViewerStore((state) => state.setScrollPosition);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tokenize the code
  const tokenizedLines = useMemo(() => {
    return tokenizeCode(file.content, file.language);
  }, [file.content, file.language]);

  // Restore scroll position
  useEffect(() => {
    if (containerRef.current && file.scrollPosition !== undefined) {
      containerRef.current.scrollTop = file.scrollPosition;
    }
  }, [file.path, file.scrollPosition]);

  // Save scroll position on scroll
  const handleScroll = useCallback((): void => {
    if (containerRef.current) {
      setScrollPosition(file.path, containerRef.current.scrollTop);
    }
  }, [file.path, setScrollPosition]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  // Highlight search matches in text
  const highlightText = (text: string, className: string): React.ReactNode => {
    if (!searchOpen || !searchQuery || searchQuery.length === 0) {
      return <span className={className}>{text}</span>;
    }

    try {
      const regex = new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi');
      const parts = text.split(regex);

      return parts.map((part, i) => {
        if (part.toLowerCase() === searchQuery.toLowerCase()) {
          return (
            <mark key={i} className="bg-yellow-500/40 rounded-sm">
              <span className={className}>{part}</span>
            </mark>
          );
        }
        return <span key={i} className={className}>{part}</span>;
      });
    } catch {
      return <span className={className}>{text}</span>;
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-auto relative"
      style={{ scrollbarWidth: 'thin' }}
      onScroll={handleScroll}
    >
      {/* Inject Monaco token CSS */}
      <style>{MONACO_TOKEN_CSS}</style>

      <div className="code-block with-line-numbers" style={{ fontFamily: 'monospace', fontSize: '12px', minWidth: 'max-content' }}>
        {tokenizedLines.map((line) => (
          <div
            key={line.lineNumber}
            className="code-line"
            data-line-number={line.lineNumber}
            style={{ display: 'flex', minHeight: '1.2em' }}
          >
            <div
              className="line-number select-none"
              style={{
                textAlign: 'right',
                marginRight: '2em',
                flexShrink: 0,
                minWidth: '3ch',
                paddingLeft: '0.5em',
                color: 'var(--vscode-editorLineNumber-foreground, rgba(128, 128, 128, 0.5))',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {line.lineNumber}
            </div>
            <div
              className="line-content"
              style={{
                flex: 1,
                whiteSpace: 'pre',
              }}
            >
              {line.tokens.length > 0 ? (
                line.tokens.map((token, i) =>
                  token.text ? highlightText(token.text, token.className) : <span key={i}>&nbsp;</span>
                )
              ) : (
                <span>&nbsp;</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Search overlay */}
      {searchOpen ? (
        <div className="absolute top-2 right-4 flex items-center gap-2 bg-card border border-border rounded-md px-2 py-1 shadow-lg z-10">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            placeholder="Search..."
            className="w-48 text-sm bg-transparent border-none outline-none"
          />
          <span className="text-xs text-muted-foreground">
            {searchQuery.length > 0 ? 'Esc to close' : ''}
          </span>
        </div>
      ) : null}

      {/* Selection styles */}
      <style>{`
        .code-block *::selection {
          background-color: var(--vscode-editor-selectionBackground, rgba(128, 128, 128, 0.1)) !important;
        }
      `}</style>
    </div>
  );
};

// Escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
