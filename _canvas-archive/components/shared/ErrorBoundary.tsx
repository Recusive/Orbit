/**
 * Error Boundary - Catches render errors and displays fallback UI
 *
 * React error boundaries must be class components (no hooks equivalent).
 * Use this to wrap components that might throw during render.
 */
import { createLogger } from '@orbit/common/lib';
import { Component } from 'react';

import type { ErrorInfo, ReactNode } from 'react';

const logger = createLogger('ErrorBoundary');

/** Function to reset the error boundary and retry rendering children */
export type ErrorBoundaryResetFn = () => void;

interface ErrorBoundaryProps {
  /** Content to render when no error */
  children: ReactNode;
  /**
   * Optional fallback UI when error occurs.
   * Can be a ReactNode or a render function that receives the error and a reset function.
   */
  fallback?: ReactNode | ((error: Error, reset: ErrorBoundaryResetFn) => ReactNode);
  /** Optional callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('Component error caught', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    this.props.onError?.(error, errorInfo);
  }

  /**
   * Reset the error boundary, clearing the error state and allowing
   * children to re-render. Useful for "Try Again" functionality.
   */
  resetErrorBoundary: ErrorBoundaryResetFn = (): void => {
    logger.info('Error boundary reset requested');
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props;
      const error = this.state.error ?? new Error('Unknown error');

      // Support render function pattern
      if (typeof fallback === 'function') {
        return fallback(error, this.resetErrorBoundary);
      }

      if (fallback !== undefined) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--destructive-background, #fef2f2)',
            border: '1px solid var(--destructive, #ef4444)',
            color: 'var(--destructive, #ef4444)',
            fontSize: '14px',
          }}
        >
          <span style={{ fontWeight: 500 }}>Render error:</span>{' '}
          {this.state.error?.message ?? 'Unknown error'}
        </div>
      );
    }

    return this.props.children;
  }
}
