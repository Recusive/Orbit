/**
 * CanvasApp - Main entry point for the Canvas UI Builder
 *
 * Renders the full canvas layout with:
 * - Left sidebar (navigation, files, components)
 * - Center canvas area (ReactFlow will render here)
 * - Right sidebar (properties, layers)
 *
 * Wrapped with CanvasErrorBoundary for Canvas-specific error recovery
 * (Reset Canvas option) in addition to the root Sentry.ErrorBoundary.
 */
import { CanvasErrorBoundary } from './components/CanvasErrorBoundary';
import { CanvasRootLayout } from './components/layout';

import type { FC } from 'react';

export const CanvasApp: FC = () => {
  return (
    <CanvasErrorBoundary>
      <CanvasRootLayout />
    </CanvasErrorBoundary>
  );
};
