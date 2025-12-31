/**
 * React component wrapper for dev-monitor.
 *
 * Traces component renders, prop changes, and errors.
 * Follows the error isolation pattern - monitoring errors never crash the app.
 */

import { useEffect, useRef } from 'react';

import { captureEvent } from '../storage';

import type { ComponentOptions } from '../types';
import type { FC } from 'react';

// ═══════════════════════════════════════════════════════════════
// Component Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap a React component to trace renders and prop changes.
 *
 * @example
 * export const MessageList = componentWrapper(
 *   function MessageList(props: Props): JSX.Element { ... }
 * );
 */
export function componentWrapper<P extends object>(
  Component: FC<P>,
  options: ComponentOptions = {}
): FC<P> {
  const { category = 'component:render', slowThreshold = 16, trackProps = true } = options;

  // Get component name for logging
  const componentName = Component.displayName ?? (Component.name || 'Anonymous');

  // Create wrapped component
  const WrappedComponent: FC<P> = (props: P) => {
    const renderCount = useRef(0);
    const prevPropsRef = useRef<P | null>(null);
    const renderStart = performance.now();

    renderCount.current += 1;

    // ═══════════════════════════════════════════════════════════
    // Pre-render monitoring (ISOLATED)
    // ═══════════════════════════════════════════════════════════
    try {
      const context: Record<string, unknown> = {
        renderCount: renderCount.current,
      };

      // Track prop changes
      if (trackProps && prevPropsRef.current !== null) {
        const changedPropsList = getChangedProps(prevPropsRef.current, props);
        if (changedPropsList.length > 0) {
          context['changedProps'] = changedPropsList;
        } else if (renderCount.current > 1) {
          // Re-render with same props - might indicate optimization opportunity
          context['samePropsRerender'] = true;
        }
      }

      captureEvent({
        severity: 'info',
        category,
        file: `component:${componentName}`,
        function: 'render',
        title: `${componentName} render #${String(renderCount.current)}`,
        context,
      });
    } catch (monitorError: unknown) {
      console.error('[DevMonitor] component pre-render error:', monitorError);
    }

    // Store current props for next render comparison
    prevPropsRef.current = props;

    // ═══════════════════════════════════════════════════════════
    // Post-render monitoring (via useEffect)
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
      try {
        const duration = performance.now() - renderStart;
        const isSlow = duration > slowThreshold;

        if (isSlow) {
          captureEvent({
            severity: 'perf',
            category: `${category}:slow`,
            file: `component:${componentName}`,
            function: 'render',
            title: `${componentName} slow render (${duration.toFixed(1)}ms)`,
            context: {
              duration_ms: duration,
              threshold_ms: slowThreshold,
              renderCount: renderCount.current,
            },
          });
        }
      } catch (monitorError: unknown) {
        console.error('[DevMonitor] component post-render error:', monitorError);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // ALWAYS render the original component
    // ═══════════════════════════════════════════════════════════
    try {
      return Component(props);
    } catch (renderError: unknown) {
      // ═══════════════════════════════════════════════════════════
      // Render error monitoring (ISOLATED)
      // ═══════════════════════════════════════════════════════════
      try {
        captureEvent({
          severity: 'error',
          category: `${category}:error`,
          file: `component:${componentName}`,
          function: 'render',
          title: `${componentName} render error`,
          details: renderError instanceof Error ? renderError.message : String(renderError),
          context: {
            stack: renderError instanceof Error ? renderError.stack : undefined,
            renderCount: renderCount.current,
          },
        });
      } catch (monitorError: unknown) {
        console.error('[DevMonitor] component error capture failed:', monitorError);
      }

      // Re-throw so React can handle it (ErrorBoundary, etc.)
      throw renderError;
    }
  };

  // Preserve component name for debugging
  WrappedComponent.displayName = `Traced(${componentName})`;

  return WrappedComponent;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Get list of props that changed between renders.
 */
function getChangedProps<P extends object>(prev: P, next: P): string[] {
  const changedProps: string[] = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const key of allKeys) {
    const prevValue = (prev as Record<string, unknown>)[key];
    const nextValue = (next as Record<string, unknown>)[key];

    if (!Object.is(prevValue, nextValue)) {
      changedProps.push(key);
    }
  }

  return changedProps;
}
