/**
 * PreviewPanel - Embeds the Vite preview server in an iframe
 *
 * Communicates with the preview server via postMessage to:
 * - Load components dynamically
 * - Update styles and props in real-time
 * - Report errors back to the parent
 */

import { RotateCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FC } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Messages sent TO the preview iframe */
interface PreviewMessage {
  type:
    | 'preview:load'
    | 'preview:update-styles'
    | 'preview:update-props'
    | 'preview:clear'
    | 'preview:set-theme';
  componentName?: string;
  componentType?: string;
  styles?: Record<string, string>;
  props?: Record<string, unknown>;
  theme?: 'light' | 'dark';
}

/** Messages received FROM the preview iframe */
interface PreviewResponse {
  type: 'preview:ready' | 'preview:loaded' | 'preview:error';
  componentName?: string;
  error?: string;
  exports?: string[];
}

export interface PreviewPanelProps {
  /** URL of the Vite preview server */
  readonly serverUrl: string;
  /** Name of the component to preview (e.g., 'button', 'input') */
  readonly componentName: string | null;
  /** Component type: 'ui' for shadcn, 'custom' for user components */
  readonly componentType?: 'ui' | 'custom';
  /** CSS styles to apply to the component */
  readonly styles?: Record<string, string>;
  /** Props to pass to the component */
  readonly props?: Record<string, unknown>;
  /** Called when the preview iframe is ready */
  readonly onReady?: () => void;
  /** Called when an error occurs */
  readonly onError?: (error: string) => void;
  /** Called when a component is loaded with its exports */
  readonly onLoaded?: (exports: string[]) => void;
  /** Called when user clicks the restart button */
  readonly onRestart?: () => Promise<void>;
  /** Whether the server is currently restarting */
  readonly isRestarting?: boolean;
}

/**
 * Preview panel that embeds the Vite server in an iframe
 */
export const PreviewPanel: FC<PreviewPanelProps> = ({
  serverUrl,
  componentName,
  componentType = 'ui',
  styles = {},
  props = {},
  onReady,
  onError,
  onLoaded,
  onRestart,
  isRestarting = false,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const prevUrlRef = useRef(serverUrl);

  // Derived state to avoid Object.keys() in useEffect dependencies (rule: rerender-derived-state)
  const hasStyles = useMemo(() => Object.keys(styles).length > 0, [styles]);
  const hasProps = useMemo(() => Object.keys(props).length > 0, [props]);
  const previewOrigin = useMemo(() => {
    try {
      return new URL(serverUrl).origin;
    } catch {
      return '';
    }
  }, [serverUrl]);

  // Get current theme from document
  const getCurrentTheme = useCallback((): 'light' | 'dark' => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }, []);

  // Send theme to iframe
  const sendTheme = useCallback(
    (theme: 'light' | 'dark'): void => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'preview:set-theme', theme },
          serverUrl
        );
      }
    },
    [serverUrl]
  );

  // Reset isReady when server is restarting or URL changes
  useEffect(() => {
    if (isRestarting) {
      setIsReady(false);
    }
  }, [isRestarting]);

  // Force iframe reload when URL changes (e.g., after restart gets a new port)
  useEffect(() => {
    if (prevUrlRef.current !== serverUrl) {
      setIsReady(false);
      prevUrlRef.current = serverUrl;
      // Force iframe to reload with new URL
      if (iframeRef.current) {
        iframeRef.current.src = serverUrl;
      }
    }
  }, [serverUrl]);

  // Send theme when iframe becomes ready
  useEffect(() => {
    if (isReady) {
      sendTheme(getCurrentTheme());
    }
  }, [isReady, sendTheme, getCurrentTheme]);

  // Watch for theme changes in parent document
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class' && isReady) {
          sendTheme(getCurrentTheme());
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => {
      observer.disconnect();
    };
  }, [isReady, sendTheme, getCurrentTheme]);

  // Handle restart button click
  const handleRestart = useCallback((): void => {
    setIsReady(false);
    void onRestart?.();
  }, [onRestart]);

  // Send message to iframe
  const sendMessage = useCallback(
    (message: PreviewMessage): void => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(message, serverUrl);
      }
    },
    [serverUrl]
  );

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent<PreviewResponse>): void => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== previewOrigin) return;

      const { type, error, exports: componentExports } = event.data;

      switch (type) {
        case 'preview:ready':
          setIsReady(true);
          onReady?.();
          break;
        case 'preview:loaded':
          onLoaded?.(componentExports ?? []);
          break;
        case 'preview:error':
          onError?.(error ?? 'Unknown error');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onReady, onError, onLoaded, previewOrigin]);

  // Load component when name changes
  useEffect(() => {
    if (isReady && componentName) {
      sendMessage({
        type: 'preview:load',
        componentName,
        componentType,
      });
    }
  }, [isReady, componentName, componentType, sendMessage]);

  // Update styles when they change
  useEffect(() => {
    if (isReady && componentName && hasStyles) {
      sendMessage({
        type: 'preview:update-styles',
        styles,
      });
    }
  }, [isReady, componentName, hasStyles, styles, sendMessage]);

  // Update props when they change
  useEffect(() => {
    if (isReady && componentName && hasProps) {
      sendMessage({
        type: 'preview:update-props',
        props,
      });
    }
  }, [isReady, componentName, hasProps, props, sendMessage]);

  return (
    <div className="relative w-full h-full bg-chat-area rounded-lg border border-border/40 overflow-hidden">
      {/* Reload button - always visible in top-right corner */}
      {onRestart ? (
        <div className="absolute z-10" style={{ top: '8px', right: '8px' }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleRestart}
                disabled={isRestarting}
                aria-label={isRestarting ? 'Restarting preview server' : 'Restart preview server'}
                className={cn(
                  'h-8 w-8 flex items-center justify-center rounded-md',
                  'bg-card/80 backdrop-blur-sm border border-border/50',
                  'text-muted-foreground hover:text-foreground hover:bg-card',
                  'transition-colors duration-150',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                )}
              >
                <RotateCw
                  className={cn(
                    'h-4 w-4',
                    isRestarting && 'animate-spin motion-reduce:animate-none'
                  )}
                  aria-hidden="true"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isRestarting ? 'Restarting...' : 'Restart preview server'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <iframe
        ref={iframeRef}
        src={serverUrl}
        className="w-full h-full border-0"
        title="Component Preview"
        sandbox="allow-scripts allow-same-origin"
      />

      {!isReady || isRestarting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-chat-area">
          <div className="flex flex-col items-center gap-2">
            <div
              className="animate-spin motion-reduce:animate-none w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {isRestarting ? 'Restarting preview server…' : 'Connecting to preview…'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
