/**
 * InlinePreview - Lightweight Sandpack preview for inline canvas rendering
 *
 * Unlike SandpackPreview, this is designed for embedding in canvas nodes:
 * - No device frame chrome
 * - CSS transform scale to fit node dimensions
 * - Compact error banner instead of full overlay
 * - IntersectionObserver for visibility detection
 */
import {
  SandpackPreview as BaseSandpackPreview,
  SandpackLayout,
  useSandpack,
} from '@codesandbox/sandpack-react';
import React, { useCallback, useEffect, useState, useRef } from 'react';

import { ERROR_MESSAGES, SANDBOX_TIMEOUTS, VIEWPORT_PRESETS } from './sandpackConfig';

import type { ViewportType } from './sandpackConfig';
import type { SandpackMessage } from '@codesandbox/sandpack-client';

export interface InlinePreviewProps {
  nodeId: string;
  instanceId: string;
  viewport: ViewportType;
  nodeWidth: number;
  nodeHeight: number;
  onError?: (instanceId: string, error: string) => void;
  onReady?: (instanceId: string) => void;
  onVisibilityChange?: (instanceId: string, isVisible: boolean) => void;
}

interface PreviewState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
}

/**
 * Calculate scale factor to fit viewport dimensions inside node bounds
 */
function calculateScale(
  viewportWidth: number,
  viewportHeight: number,
  nodeWidth: number,
  nodeHeight: number
): number {
  // Reserve space for header (~40px) and some padding
  const availableWidth = nodeWidth - 16;
  const availableHeight = nodeHeight - 56;

  const scaleX = availableWidth / viewportWidth;
  const scaleY = availableHeight / viewportHeight;

  // Use the smaller scale to fit both dimensions, never scale up
  return Math.min(scaleX, scaleY, 1);
}

export function InlinePreview({
  instanceId,
  viewport,
  nodeWidth,
  nodeHeight,
  onError,
  onReady,
  onVisibilityChange,
}: InlinePreviewProps): React.JSX.Element {
  const { sandpack, listen } = useSandpack();
  const [state, setState] = useState<PreviewState>({
    status: 'loading',
    error: null,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRefs = useRef({ onError, onReady, onVisibilityChange });
  callbackRefs.current = { onError, onReady, onVisibilityChange };

  const viewportDimensions = VIEWPORT_PRESETS[viewport];
  const scale = calculateScale(
    viewportDimensions.width,
    viewportDimensions.height,
    nodeWidth,
    nodeHeight
  );

  // Set up IntersectionObserver for visibility tracking
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          callbackRefs.current.onVisibilityChange?.(instanceId, entry.isIntersecting);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);
    return (): void => {
      observer.disconnect();
    };
  }, [instanceId]);

  // Handle Sandpack messages
  const handleMessage = useCallback(
    (msg: SandpackMessage): void => {
      const data = msg as unknown as Record<string, unknown>;

      if (msg.type === 'status' && data['status'] === 'idle') {
        setState({ status: 'ready', error: null });
        callbackRefs.current.onReady?.(instanceId);
      }

      if (msg.type === 'action' && data['action'] === 'show-error') {
        const errorMessage =
          (typeof data['message'] === 'string' ? data['message'] : null) ??
          ERROR_MESSAGES.RUNTIME_ERROR;
        setState({ status: 'error', error: errorMessage });
        callbackRefs.current.onError?.(instanceId, errorMessage);
      }
    },
    [instanceId]
  );

  // Subscribe to Sandpack messages
  useEffect(() => {
    const unsubscribe = listen(handleMessage);
    return (): void => {
      unsubscribe();
    };
  }, [listen, handleMessage]);

  // Handle compile errors
  useEffect(() => {
    const errors = sandpack.error;
    if (errors !== null) {
      const errorMessage = errors.message || ERROR_MESSAGES.COMPILE_ERROR;
      setState({ status: 'error', error: errorMessage });
      callbackRefs.current.onError?.(instanceId, errorMessage);
    } else if (sandpack.status === 'idle') {
      setState({ status: 'ready', error: null });
    }
  }, [sandpack.error, sandpack.status, instanceId]);

  // Timeout detection
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (state.status === 'loading') {
        setState({ status: 'error', error: ERROR_MESSAGES.TIMEOUT_ERROR });
        callbackRefs.current.onError?.(instanceId, ERROR_MESSAGES.TIMEOUT_ERROR);
      }
    }, SANDBOX_TIMEOUTS.renderTimeout);

    return (): void => {
      clearTimeout(timeoutId);
    };
  }, [state.status, instanceId]);

  // Scale is calculated but applied via CSS transform

  return (
    <div ref={containerRef} style={styles['container']}>
      {/* Loading skeleton */}
      {state.status === 'loading' && (
        <div style={styles['loadingOverlay']}>
          <div style={styles['skeleton']}>
            <div style={styles['skeletonHeader']} />
            <div style={styles['skeletonBody']} />
          </div>
        </div>
      )}

      {/* Error banner - compact instead of full overlay */}
      {state.status === 'error' && state.error !== null && (
        <div style={styles['errorBanner']}>
          <span style={styles['errorIcon']}>!</span>
          <span style={styles['errorText']}>
            {state.error.length > 50 ? `${state.error.slice(0, 50)}...` : state.error}
          </span>
          <button
            style={styles['retryButton']}
            onClick={(): void => {
              setState({ status: 'loading', error: null });
              void sandpack.runSandpack();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Sandpack preview - use CSS zoom for scaling (preserves intersection observer) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: viewportDimensions.width,
          height: viewportDimensions.height,
          transformOrigin: 'top left',
          transform: `scale(${String(scale)})`,
        }}
      >
        <SandpackLayout
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'flex',
          }}
        >
          <BaseSandpackPreview
            style={{
              flex: 1,
              height: '100%',
              border: 'none',
              backgroundColor: '#ffffff',
            }}
            showOpenInCodeSandbox={false}
            showRefreshButton={false}
          />
        </SandpackLayout>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    zIndex: 10,
  },
  skeleton: {
    width: '80%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  skeletonHeader: {
    height: 20,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonBody: {
    height: 60,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    animation: 'pulse 1.5s ease-in-out infinite',
    animationDelay: '0.1s',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    borderTop: '1px solid #fecaca',
    zIndex: 20,
  },
  errorIcon: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: '#991b1b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  retryButton: {
    padding: '4px 8px',
    fontSize: 10,
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    flexShrink: 0,
  },
};

// Inject pulse animation if not present
if (typeof document !== 'undefined' && !document.getElementById('inline-preview-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'inline-preview-styles';
  styleEl.textContent = `
		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}
	`;
  document.head.appendChild(styleEl);
}
