/**
 * CanvasApp - Main entry point for the Canvas UI Builder
 *
 * Renders the full canvas layout with:
 * - Left sidebar (navigation, files, components)
 * - Center canvas area (ReactFlow will render here)
 * - Right sidebar (properties, layers)
 */
import { CanvasRootLayout } from './components/layout';

import type { FC } from 'react';

export const CanvasApp: FC = () => {
  return <CanvasRootLayout />;
};
