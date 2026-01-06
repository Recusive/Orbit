import { lazy, Suspense } from 'react';

import type { ReactNode } from 'react';

/**
 * Creates a lazy-loaded component with Suspense wrapper.
 *
 * @param importFn - Dynamic import function returning the component module
 * @param fallback - Optional fallback UI while loading (default: null)
 * @returns A component that lazy loads on first render
 *
 * @example
 * const SettingsDialog = lazyLoad(
 *   () => import('./settings/SettingsDialog'),
 *   <LoadingSpinner />
 * );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyLoad<P extends Record<string, any>>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
  fallback: ReactNode = null
): React.FC<P> {
  const LazyComponent = lazy(importFn);

  const LazyWrapper: React.FC<P> = (props) => {
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

  // Set display name for React DevTools
  LazyWrapper.displayName = `Lazy(${/['"]([^'"]+)['"]/.exec(importFn.toString())?.[1] ?? 'Component'})`;

  return LazyWrapper;
}
