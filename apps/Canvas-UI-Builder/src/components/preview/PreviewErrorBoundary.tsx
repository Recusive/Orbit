/**
 * PreviewErrorBoundary - Error boundary for preview panel
 *
 * Catches render errors in the preview iframe and provides:
 * - Friendly error UI with AlertTriangle icon
 * - "Retry Preview" button to attempt recovery
 * - Structured logging via createLogger
 *
 * This is specifically for handling errors that occur within
 * the preview component, not the iframe itself.
 */
import { createLogger } from '@orbit/common/lib';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component } from 'react';

import type { ErrorInfo, ReactNode } from 'react';

import { Button } from '@/components/ui/button';

// ============================================
// Logger
// ============================================

const logger = createLogger('PreviewErrorBoundary');

// ============================================
// Types
// ============================================

export interface PreviewErrorBoundaryProps {
  /** Children to render when no error */
  readonly children: ReactNode;
  /** Optional callback when retry is clicked */
  readonly onRetry?: () => void;
}

interface PreviewErrorBoundaryState {
  /** Whether an error has occurred */
  hasError: boolean;
  /** The error that was caught */
  error: Error | null;
  /** Error info from React */
  errorInfo: ErrorInfo | null;
}

// ============================================
// Error Boundary Component
// ============================================

/**
 * Error boundary that catches rendering errors in the preview panel.
 *
 * Unlike the main CanvasErrorBoundary, this one is lightweight and
 * focused on preview-specific errors. It doesn't attempt to reset
 * the entire canvas - just retry the preview.
 */
export class PreviewErrorBoundary extends Component<
  PreviewErrorBoundaryProps,
  PreviewErrorBoundaryState
> {
  constructor(props: PreviewErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<PreviewErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error using structured logger
    logger.error('Preview render error caught', error, {
      componentStack: errorInfo.componentStack,
    });

    this.setState({ errorInfo });
  }

  /**
   * Handle retry - resets error state and optionally calls onRetry callback
   */
  handleRetry = (): void => {
    logger.info('Retrying preview');

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call optional retry callback
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="flex items-center justify-center h-full p-6 bg-background">
          <div className="text-center max-w-sm space-y-4">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>

            {/* Error Title */}
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Preview Error</h3>
              <p className="text-sm text-muted-foreground">
                Failed to render the component preview.
              </p>
            </div>

            {/* Error Message */}
            {error ? (
              <div className="p-3 bg-muted/50 rounded-md border border-border">
                <p className="text-xs font-mono text-muted-foreground break-all line-clamp-3">
                  {error.message || 'Unknown error'}
                </p>
              </div>
            ) : null}

            {/* Retry Action */}
            <Button variant="outline" onClick={this.handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry Preview
            </Button>

            {/* Help Text */}
            <p className="text-xs text-muted-foreground">
              This may be caused by invalid props or a component error.
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}
