/**
 * HMRErrorBoundary - Error boundary for HMR failures
 *
 * Catches errors in Sandpack preview components and provides:
 * - Automatic retry logic (max 3 attempts)
 * - Fallback to full remount on repeated failures
 * - Error reporting via bridge
 */
import React, { Component } from 'react';

import type { ErrorInfo } from 'react';

export interface HMRErrorBoundaryProps {
  /** Instance ID for error reporting */
  instanceId: string;
  /** Node ID for error reporting */
  nodeId: string;
  /** Callback when error occurs */
  onError?: (instanceId: string, error: Error) => void;
  /** Callback to trigger full remount */
  onRequestRemount?: () => void;
  /** Maximum retry attempts before suggesting remount */
  maxRetries?: number;
  /** Children to render */
  children: React.ReactNode;
}

interface HMRErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

/**
 * Error boundary that handles HMR failures gracefully
 */
export class HMRErrorBoundary extends Component<HMRErrorBoundaryProps, HMRErrorBoundaryState> {
  static defaultProps = {
    maxRetries: 3,
  };

  constructor(props: HMRErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<HMRErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { instanceId, onError } = this.props;

    // Report error
    onError?.(instanceId, error);

    // Log for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[HMRErrorBoundary] Caught error:', error);
      console.warn('[HMRErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleRetry = (): void => {
    const { maxRetries = 3, onRequestRemount } = this.props;
    const newRetryCount = this.state.retryCount + 1;

    if (newRetryCount >= maxRetries) {
      // Too many retries, suggest full remount
      onRequestRemount?.();
    }

    this.setState({
      hasError: false,
      error: null,
      retryCount: newRetryCount,
    });
  };

  handleRemount = (): void => {
    const { onRequestRemount } = this.props;
    onRequestRemount?.();

    // Reset state
    this.setState({
      hasError: false,
      error: null,
      retryCount: 0,
    });
  };

  override render(): React.ReactNode {
    const { hasError, error, retryCount } = this.state;
    const { maxRetries = 3, children } = this.props;

    if (hasError) {
      const canRetry = retryCount < maxRetries;

      return (
        <div style={styles['container']}>
          <div style={styles['icon']}>!</div>
          <div style={styles['title']}>Preview Error</div>
          <div style={styles['message']}>{error?.message ?? 'An error occurred'}</div>
          <div style={styles['retryInfo']}>
            {canRetry
              ? `Retry ${String(retryCount + 1)}/${String(maxRetries)}`
              : 'Max retries reached'}
          </div>
          <div style={styles['buttons']}>
            {canRetry ? (
              <button style={styles['retryButton']} onClick={this.handleRetry}>
                Retry
              </button>
            ) : null}
            <button style={styles['remountButton']} onClick={this.handleRemount}>
              Full Refresh
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fef2f2',
    height: '100%',
    textAlign: 'center',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#991b1b',
    marginBottom: 8,
  },
  message: {
    fontSize: 12,
    color: '#dc2626',
    maxWidth: '90%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: 8,
  },
  retryInfo: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 16,
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
  retryButton: {
    padding: '6px 12px',
    fontSize: 12,
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  remountButton: {
    padding: '6px 12px',
    fontSize: 12,
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
};
