import { SandpackPreview as BaseSandpackPreview, useSandpack } from '@codesandbox/sandpack-react';
import React, { useCallback, useEffect, useState, useRef } from 'react';

import { radii, motion } from '../lib/design/designTokens';

import { VIEWPORT_PRESETS, ERROR_MESSAGES, SANDBOX_TIMEOUTS } from './sandpackConfig';

import type { ViewportType } from './sandpackConfig';
import type { SandpackMessage } from '@codesandbox/sandpack-client';

// Stable callback refs to prevent effect re-runs
interface CallbackRefs {
  onError?: ((nodeId: string, error: string) => void) | undefined;
  onReady?: ((nodeId: string) => void) | undefined;
  onResize?: ((nodeId: string, dimensions: { width: number; height: number }) => void) | undefined;
}

export interface SandpackPreviewProps {
  nodeId: string;
  viewport: ViewportType;
  onError?: (nodeId: string, error: string) => void;
  onReady?: (nodeId: string) => void;
  onResize?: (nodeId: string, dimensions: { width: number; height: number }) => void;
  showErrorOverlay?: boolean;
  /** When true, auto-scales to fit container like Chrome DevTools */
  responsive?: boolean;
}

interface PreviewState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  hasTimedOut: boolean;
}

/**
 * Sandpack Preview wrapper with error handling and viewport support
 * Provides Chrome DevTools-like responsive preview with actual device dimensions
 */
export function SandpackPreview({
  nodeId,
  viewport,
  onError,
  onReady,
  onResize,
  showErrorOverlay = true,
  responsive = false,
}: SandpackPreviewProps): React.JSX.Element {
  const { sandpack, listen } = useSandpack();
  const [state, setState] = useState<PreviewState>({
    status: 'loading',
    error: null,
    hasTimedOut: false,
  });
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs for callbacks to prevent effect re-runs
  const callbackRefs = useRef<CallbackRefs>({});
  callbackRefs.current = { onError, onReady, onResize };

  const viewportDimensions = VIEWPORT_PRESETS[viewport];

  // Calculate scale to fit container (Chrome DevTools behavior)
  useEffect(() => {
    if (!responsive || !containerRef.current) {
      setScale(1);
      return;
    }

    const calculateScale = (): void => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth - 48; // Padding
      const containerHeight = container.clientHeight - 48;

      const deviceWidth = viewportDimensions.width;
      const deviceHeight = viewportDimensions.height;

      // Calculate scale to fit both dimensions
      const scaleX = containerWidth / deviceWidth;
      const scaleY = containerHeight / deviceHeight;
      const newScale = Math.min(scaleX, scaleY, 1); // Never scale up, only down

      setScale(Math.max(0.25, newScale)); // Minimum 25% scale
    };

    calculateScale();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateScale);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [responsive, viewportDimensions]);

  // Handle Sandpack messages - use refs for stable callback
  const handleMessage = useCallback(
    (msg: SandpackMessage): void => {
      const data = msg as unknown as Record<string, unknown>;

      if (msg.type === 'status' && data['status'] === 'idle') {
        setState((prev) => ({ ...prev, status: 'ready', error: null }));
        callbackRefs.current.onReady?.(nodeId);
      }

      if (msg.type === 'action' && data['action'] === 'show-error') {
        const errorMessage =
          (typeof data['message'] === 'string' ? data['message'] : null) ??
          ERROR_MESSAGES.RUNTIME_ERROR;
        setState((prev) => ({ ...prev, status: 'error', error: errorMessage }));
        callbackRefs.current.onError?.(nodeId, errorMessage);
      }

      if (msg.type === 'resize') {
        const height = typeof data['height'] === 'number' ? data['height'] : 0;
        const width = typeof data['width'] === 'number' ? data['width'] : 0;
        callbackRefs.current.onResize?.(nodeId, { width, height });
      }
    },
    [nodeId]
  ); // Only depends on nodeId now

  // Subscribe to Sandpack messages
  useEffect(() => {
    const unsubscribe = listen(handleMessage);
    return () => {
      unsubscribe();
    };
  }, [listen, handleMessage]);

  // Handle compile errors from bundler state
  useEffect(() => {
    const errors = sandpack.error;
    if (errors !== null) {
      const errorMessage = errors.message || ERROR_MESSAGES.COMPILE_ERROR;
      setState((prev) => ({ ...prev, status: 'error', error: errorMessage }));
      callbackRefs.current.onError?.(nodeId, errorMessage);
    } else if (sandpack.status === 'idle') {
      setState((prev) => ({ ...prev, status: 'ready', error: null }));
    }
  }, [sandpack.error, sandpack.status, nodeId]);

  // Timeout detection for infinite loops
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (state.status === 'loading') {
        setState((prev) => ({ ...prev, hasTimedOut: true, error: ERROR_MESSAGES.TIMEOUT_ERROR }));
        callbackRefs.current.onError?.(nodeId, ERROR_MESSAGES.TIMEOUT_ERROR);
      }
    }, SANDBOX_TIMEOUTS.renderTimeout);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [state.status, nodeId]);

  // Chrome DevTools-style container: canvas area with centered device
  const canvasStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: '#2d2d2d', // Dark canvas background like DevTools
    backgroundImage: `
			linear-gradient(45deg, #333 25%, transparent 25%),
			linear-gradient(-45deg, #333 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #333 75%),
			linear-gradient(-45deg, transparent 75%, #333 75%)
		`,
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    padding: 24,
    position: 'relative',
  };

  // Device frame
  const deviceFrameStyle: React.CSSProperties = {
    width: viewportDimensions.width,
    height: viewportDimensions.height,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    boxShadow: `
			0 0 0 1px rgba(0, 0, 0, 0.1),
			0 4px 6px rgba(0, 0, 0, 0.1),
			0 20px 40px rgba(0, 0, 0, 0.2)
		`,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    transform: responsive ? `scale(${String(scale)})` : undefined,
    transformOrigin: 'center center',
    transition: responsive ? `transform ${motion.smooth} ${motion.ease}` : undefined,
  };

  return (
    <div ref={containerRef} style={canvasStyle}>
      <div style={deviceFrameStyle}>
        {/* Loading overlay */}
        {state.status === 'loading' && !state.hasTimedOut && (
          <div style={styles['overlay']}>
            <div style={styles['spinner']} />
            <span style={styles['loadingText']}>Loading preview...</span>
          </div>
        )}

        {/* Error overlay */}
        {showErrorOverlay && state.status === 'error' && state.error !== null ? (
          <div style={styles['errorOverlay']}>
            <div style={styles['errorIcon']}>!</div>
            <div style={styles['errorTitle']}>Preview Error</div>
            <div style={styles['errorMessage']}>{state.error}</div>
            <button
              style={styles['retryButton']}
              onClick={(): void => {
                setState({ status: 'loading', error: null, hasTimedOut: false });
                void sandpack.runSandpack();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Timeout overlay */}
        {state.hasTimedOut ? (
          <div style={styles['errorOverlay']}>
            <div style={styles['errorIcon']}>!</div>
            <div style={styles['errorTitle']}>Timeout</div>
            <div style={styles['errorMessage']}>{ERROR_MESSAGES.TIMEOUT_ERROR}</div>
            <button
              style={styles['retryButton']}
              onClick={(): void => {
                setState({ status: 'loading', error: null, hasTimedOut: false });
                void sandpack.runSandpack();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Actual Sandpack preview */}
        <BaseSandpackPreview
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#ffffff',
          }}
          showOpenInCodeSandbox={false}
          showRefreshButton={false}
        />
      </div>

      {/* Dimension label */}
      {responsive ? (
        <div style={styles['dimensionLabel']}>
          {viewportDimensions.width} × {viewportDimensions.height}
          {scale < 1 && <span style={styles['scaleLabel']}>{Math.round(scale * 100)}%</span>}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 10,
  },
  spinner: {
    width: 24,
    height: 24,
    border: '3px solid #e5e7eb',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(254, 242, 242, 0.95)',
    zIndex: 10,
    padding: 16,
  },
  errorIcon: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: 'var(--destructive)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#991b1b',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: 12,
  },
  retryButton: {
    padding: '6px 12px',
    fontSize: 12,
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  dimensionLabel: {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    fontSize: 11,
    fontWeight: 500,
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    borderRadius: 4,
    zIndex: 5,
  },
  scaleLabel: {
    padding: '2px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    fontSize: 10,
  },
};

// CSS keyframes for spinner animation
const spinnerStyles = `
@keyframes spin {
	to { transform: rotate(360deg); }
}
`;

// Inject spinner styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('sandpack-spinner-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'sandpack-spinner-styles';
  styleEl.textContent = spinnerStyles;
  document.head.appendChild(styleEl);
}
