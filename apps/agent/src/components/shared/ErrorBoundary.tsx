/**
 * Error Boundary - Catches render errors and displays fallback UI
 *
 * React error boundaries must be class components (no hooks equivalent).
 * Use this to wrap components that might throw during render, especially
 * those that depend on external/persisted data (localStorage, backend).
 */
import { createLogger } from '@orbit/common/lib';
import { Component } from 'react';

import type { ErrorInfo, ReactNode } from 'react';

const logger = createLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  /** Content to render when no error */
  children: ReactNode;
  /** Optional fallback UI when error occurs. Can be a ReactNode or a render function that receives the error. */
  fallback?: ReactNode | ((error: Error) => ReactNode);
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

  override render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props;
      const error = this.state.error ?? new Error('Unknown error');

      // Support render function pattern: fallback={(error) => <Fallback error={error} />}
      if (typeof fallback === 'function') {
        return fallback(error);
      }

      if (fallback !== undefined) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div className="p-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <span className="font-medium">Render error:</span>{' '}
          {this.state.error?.message ?? 'Unknown error'}
        </div>
      );
    }

    return this.props.children;
  }
}
