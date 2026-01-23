/**
 * CanvasErrorBoundary - Error boundary for Canvas UI Builder
 *
 * Catches React errors and provides recovery options:
 * - Reload: Refresh the page to retry
 * - Reset Canvas: Clear all canvas data and start fresh
 */
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Component } from 'react';

import type { ErrorInfo, ReactNode } from 'react';

import { Button } from '@/components/ui/button';

// ============================================
// Types
// ============================================

interface CanvasErrorBoundaryProps {
  /** Children to render when no error */
  readonly children: ReactNode;
  /** Optional fallback component */
  readonly fallback?: ReactNode;
}

interface CanvasErrorBoundaryState {
  /** Whether an error has occurred */
  hasError: boolean;
  /** The error that was caught */
  error: Error | null;
  /** Error info from React */
  errorInfo: ErrorInfo | null;
  /** Whether reset is in progress */
  isResetting: boolean;
}

// ============================================
// Error Boundary Component
// ============================================

/**
 * Error boundary that catches rendering errors in the Canvas UI Builder.
 *
 * Provides two recovery options:
 * 1. Reload - Simply refresh the page
 * 2. Reset Canvas - Clear all canvas data and reload
 */
export class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isResetting: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CanvasErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error for debugging
    console.error('[CanvasErrorBoundary] Caught error:', error);
    console.error('[CanvasErrorBoundary] Component stack:', errorInfo.componentStack);

    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = async (): Promise<void> => {
    this.setState({ isResetting: true });

    try {
      // Stop any running preview server first
      try {
        await invoke('canvas_stop_preview_server');
      } catch {
        // Ignore errors - server might not be running
      }

      // Reset the canvas setup (removes ~/.orbit/canvas)
      await invoke('canvas_reset_setup');

      // Reload the page to reinitialize
      window.location.reload();
    } catch (err) {
      console.error('[CanvasErrorBoundary] Failed to reset:', err);
      // Even if reset fails, try to reload
      window.location.reload();
    }
  };

  override render(): ReactNode {
    const { hasError, error, isResetting } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback !== undefined) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center h-full p-8 bg-background">
          <div className="text-center max-w-md space-y-6">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-destructive/10">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>

            {/* Error Title */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                An error occurred while rendering the Canvas UI Builder.
              </p>
            </div>

            {/* Error Message */}
            {error ? (
              <div className="p-4 bg-muted/50 rounded-lg border border-border">
                <p className="text-sm font-mono text-muted-foreground break-all">
                  {error.message || 'Unknown error'}
                </p>
              </div>
            ) : null}

            {/* Recovery Actions */}
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={this.handleReload}
                disabled={isResetting}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Reload
              </Button>
              <Button
                variant="destructive"
                onClick={this.handleReset}
                disabled={isResetting}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {isResetting ? 'Resetting...' : 'Reset Canvas'}
              </Button>
            </div>

            {/* Help Text */}
            <p className="text-xs text-muted-foreground">
              If the problem persists after reloading, try resetting the canvas to clear all data.
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}
