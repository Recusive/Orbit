import {
  ArrowLeft,
  ArrowRight,
  ChevronsLeftRight,
  ExternalLink,
  RefreshCw,
  Square,
  SquareDashedMousePointer,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import type { FC, KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';
import { useBrowserNavigation, useIsSelectingElement } from '@/stores/browser-store';

export interface BrowserToolbarProps {
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly onReload: () => void;
  readonly onStop: () => void;
  readonly onNavigate: (url: string) => void;
  readonly onSelectElement: () => void;
  readonly onCancelSelectElement: () => void;
  readonly onOpenDevTools?: () => void;
  readonly onOpenExternal?: () => void;
  readonly onClose?: () => void;
}

export const BrowserToolbar: FC<BrowserToolbarProps> = ({
  onBack,
  onForward,
  onReload,
  onStop,
  onNavigate,
  onSelectElement,
  onCancelSelectElement,
  onOpenDevTools,
  onOpenExternal,
  onClose,
}) => {
  const navigation = useBrowserNavigation();
  const isSelectingElement = useIsSelectingElement();
  const [urlInput, setUrlInput] = useState(navigation.url);

  // Sync URL input with navigation state
  const handleUrlFocus = useCallback((): void => {
    setUrlInput(navigation.url);
  }, [navigation.url]);

  const handleUrlKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        let url = urlInput.trim();
        // Add protocol if missing
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          // Assume localhost for numeric or localhost URLs
          if (/^(localhost|127\.0\.0\.1|\d+)/.exec(url)) {
            url = `http://${url}`;
          } else {
            url = `https://${url}`;
          }
        }
        onNavigate(url);
      } else if (e.key === 'Escape') {
        setUrlInput(navigation.url);
        (e.target as HTMLInputElement).blur();
      }
    },
    [urlInput, onNavigate, navigation.url]
  );

  const handleSelectElementClick = useCallback((): void => {
    if (isSelectingElement) {
      onCancelSelectElement();
    } else {
      onSelectElement();
    }
  }, [isSelectingElement, onSelectElement, onCancelSelectElement]);

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b border-border bg-background">
      {/* Navigation buttons */}
      <button
        onClick={onBack}
        disabled={!navigation.canGoBack}
        className={cn(
          'h-7 w-7 flex items-center justify-center rounded transition-colors',
          navigation.canGoBack
            ? 'hover:bg-accent text-foreground'
            : 'text-muted-foreground/50 cursor-not-allowed'
        )}
        title="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <button
        onClick={onForward}
        disabled={!navigation.canGoForward}
        className={cn(
          'h-7 w-7 flex items-center justify-center rounded transition-colors',
          navigation.canGoForward
            ? 'hover:bg-accent text-foreground'
            : 'text-muted-foreground/50 cursor-not-allowed'
        )}
        title="Go forward"
      >
        <ArrowRight className="h-4 w-4" />
      </button>

      {navigation.isLoading ? (
        <button
          onClick={onStop}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Stop loading"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Reload"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      )}

      {/* URL input */}
      <div className="flex-1 mx-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e): void => {
            setUrlInput(e.target.value);
          }}
          onFocus={handleUrlFocus}
          onKeyDown={handleUrlKeyDown}
          placeholder="Enter URL..."
          className="w-full h-7 px-3 rounded-md border border-border bg-muted/50 text-sm outline-none placeholder:text-muted-foreground focus:bg-background focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Select Element button (React-grab) */}
      <button
        onClick={handleSelectElementClick}
        className={cn(
          'h-7 w-7 flex items-center justify-center rounded transition-colors',
          isSelectingElement ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        )}
        title={isSelectingElement ? 'Cancel element selection' : 'Select element (React-grab)'}
      >
        {isSelectingElement ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <SquareDashedMousePointer className="h-3.5 w-3.5" />
        )}
      </button>

      {/* DevTools button */}
      {onOpenDevTools ? (
        <button
          onClick={onOpenDevTools}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Open DevTools"
        >
          <ChevronsLeftRight className="h-4 w-4" />
        </button>
      ) : null}

      {/* Open in external browser */}
      {onOpenExternal ? (
        <button
          onClick={onOpenExternal}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Open in external browser"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      ) : null}

      {/* Close browser button */}
      {onClose ? (
        <button
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/90 hover:text-destructive-foreground transition-colors"
          title="Close browser"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
};
