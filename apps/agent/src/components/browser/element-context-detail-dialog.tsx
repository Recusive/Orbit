import { Check, Copy, ExternalLink, X } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import type { ReactElementContext } from '@/types/protocol';
import type { FC } from 'react';

import {
  useHighlightedTokens,
  useIsDarkMode,
} from '@/components/chat/tools/shared/use-syntax-highlight';
import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

const MAX_HIGHLIGHT_CHARS = 20_000;

// ---------------------------------------------------------------------------
// Inline copy button — appears on hover, minimal footprint
// ---------------------------------------------------------------------------

const InlineCopy: FC<{ readonly text: string; readonly label: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1500);
      });
    },
    [text]
  );

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded-[6px] text-muted-foreground/40 hover:text-foreground hover:bg-foreground/8 transition-all duration-100 cursor-pointer"
      aria-label={label}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Code block — the main content of this dialog
// ---------------------------------------------------------------------------

const CodeBlock: FC<{ readonly code: string }> = ({ code }) => {
  const isDarkMode = useIsDarkMode();
  const truncated = code.length > MAX_HIGHLIGHT_CHARS;
  const displayCode = truncated ? code.slice(0, MAX_HIGHLIGHT_CHARS) : code;
  const tokens = useHighlightedTokens(displayCode, '.html', isDarkMode);
  const lines = tokens ?? [[{ content: displayCode, color: undefined }]];

  return (
    <div className="relative group/code min-w-0 overflow-hidden">
      {/* Copy button — top-right, visible on hover */}
      <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity duration-100 z-10">
        <InlineCopy text={code} label="Copy HTML" />
      </div>

      <div className="font-mono text-[11px] leading-[1.6] overflow-y-auto overflow-x-hidden max-h-[50vh] p-3 whitespace-pre-wrap break-words selection:bg-primary/20">
        {lines.map((line, i) => (
          <div key={i}>
            {line.map((token, j) => (
              <span key={j} style={token.color !== undefined ? { color: token.color } : undefined}>
                {token.content}
              </span>
            ))}
          </div>
        ))}
      </div>

      {truncated ? (
        <div className="text-[10px] text-muted-foreground/50 px-3 py-1 border-t border-foreground/5">
          {MAX_HIGHLIGHT_CHARS.toLocaleString()} of {code.length.toLocaleString()} chars shown
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Metadata row — compact key-value with optional actions
// ---------------------------------------------------------------------------

const MetaRow: FC<{
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly copyable?: boolean;
  readonly onClick?: () => void;
}> = ({ label, value, mono = false, copyable = false, onClick }) => {
  const content = (
    <span
      className={cn(
        'truncate flex-1 text-[11px]',
        mono ? 'font-mono' : '',
        onClick !== undefined ? 'group-hover/row:text-primary transition-colors duration-100' : ''
      )}
      style={{ overflowWrap: 'anywhere' }}
    >
      {value}
    </span>
  );

  return (
    <div
      className={cn(
        'group/row flex items-center gap-2 px-3 py-[5px] min-h-[28px]',
        onClick !== undefined
          ? 'cursor-pointer hover:bg-foreground/[0.03] transition-colors duration-100'
          : ''
      )}
      onClick={onClick}
      role={onClick !== undefined ? 'button' : undefined}
      tabIndex={onClick !== undefined ? 0 : undefined}
      onKeyDown={
        onClick !== undefined
          ? (e): void => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 w-14 shrink-0 select-none">
        {label}
      </span>
      {content}
      {copyable ? (
        <div className="opacity-0 group-hover/row:opacity-100 transition-opacity duration-100 shrink-0">
          <InlineCopy text={value} label={`Copy ${label.toLowerCase()}`} />
        </div>
      ) : null}
      {onClick !== undefined ? (
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/60 group-hover/row:text-primary/60 transition-colors duration-100" />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export interface ElementContextDetailDialogProps {
  readonly element: ReactElementContext;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const ElementContextDetailDialogInner: FC<ElementContextDetailDialogProps> = ({
  element,
  open,
  onOpenChange,
}) => {
  const hasFilePath = element.filePath !== '';
  const hasProps = Object.keys(element.props).length > 0;
  const hasStack = element.componentStack.length > 0;
  const hasCode = element.outerHTML.length >= 10;

  const handleFileClick = useCallback((): void => {
    if (!hasFilePath) return;
    useFileViewerStore.getState().gotoPosition(element.filePath, element.lineNumber, 0);
    useUIStore.getState().setActivityTab('file');
    onOpenChange(false);
  }, [element.filePath, element.lineNumber, hasFilePath, onOpenChange]);

  const displayName = element.componentName !== element.tagName ? element.componentName : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentGlass className="max-h-[80vh] gap-0 p-0 glass-surface rounded-[10px] [&>.absolute]:hidden">
        {/* Single constraining wrapper — grid items have min-width:auto,
            so we need an inner block-level container to enforce width */}
        <div className="w-[580px] max-w-[92vw] overflow-hidden">
          {/* ── Header bar ── */}
          <div className="flex items-center h-9 px-3  select-none">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="font-mono text-[11px] font-semibold text-foreground/80 shrink-0">
                &lt;{element.tagName}&gt;
              </span>
              {displayName !== '' ? (
                <span className="text-[11px] text-muted-foreground/50 truncate">{displayName}</span>
              ) : null}
            </div>

            <DialogClose className="p-1 rounded-[6px] bg-foreground/6 text-muted-foreground transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text active:bg-destructive-subtle-hover">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>

            {/* Accessibility — hidden from view */}
            <DialogTitle className="sr-only">Element inspector: {element.tagName}</DialogTitle>
            <DialogDescription className="sr-only">
              Inspect the captured HTML element
            </DialogDescription>
          </div>

          {/* ── Code area ── inset card on glass surface */}
          <div className="px-3 pb-3 ">
            <div className="rounded-[8px] bg-foreground/[0.04] overflow-hidden">
              {hasCode ? (
                <CodeBlock code={element.outerHTML} />
              ) : (
                <div className="px-3 py-6 text-center text-[11px] text-muted-foreground/40 italic select-none">
                  Void element — no HTML content
                </div>
              )}
            </div>
          </div>

          {/* ── Selector ── inset card */}
          <div className="flex items-center gap-2 px-5 select-none">
            <div className="flex-1 h-px bg-foreground/[0.12]" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Select
            </span>
            <div className="flex-1 h-px bg-foreground/[0.12]" />
          </div>
          <div className="px-3 py-2 ">
            <div className="rounded-[8px] bg-foreground/[0.04] overflow-hidden group/sel relative">
              <div className="absolute right-2 top-1.5 opacity-0 group-hover/sel:opacity-100 transition-opacity duration-100 z-10">
                <InlineCopy text={element.selector} label="Copy selector" />
              </div>
              <div
                className="font-mono text-[11px] leading-[1.6] px-3 py-2 break-words"
                style={{ overflowWrap: 'anywhere' }}
              >
                {element.selector}
              </div>
            </div>
          </div>

          {/* ── Text content ── inset card */}
          {element.textContent !== undefined && element.textContent !== '' ? (
            <div>
              <div className="flex items-center gap-2 px-5 select-none">
                <div className="flex-1 h-px bg-foreground/[0.12]" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  Text
                </span>
                <div className="flex-1 h-px bg-foreground/[0.12]" />
              </div>
              <div className="px-3 py-2">
                <div className="rounded-[8px] bg-foreground/[0.04] overflow-hidden">
                  <div
                    className="text-[11px] leading-[1.6] px-3 py-2 break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {element.textContent}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Metadata rows ── compact footer */}
          <div>
            {hasFilePath ? (
              <MetaRow
                label="File"
                value={`${element.filePath}:${String(element.lineNumber)}`}
                mono
                onClick={handleFileClick}
              />
            ) : null}

            {hasProps ? (
              <MetaRow
                label="Props"
                value={Object.entries(element.props)
                  .filter(([, v]) => v !== undefined && typeof v !== 'function')
                  .slice(0, 5)
                  .map(([k, v]) => `${k}=${formatPropValue(v)}`)
                  .join('  ')}
                mono
              />
            ) : null}

            {hasStack ? <MetaRow label="Stack" value={element.componentStack.join(' > ')} /> : null}
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPropValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 30 ? `"${value.slice(0, 30)}…"` : `"${value}"`;
  }
  if (typeof value === 'object' && value !== null) {
    return '{…}';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return 'undefined';
}

export const ElementContextDetailDialog = React.memo(ElementContextDetailDialogInner);
