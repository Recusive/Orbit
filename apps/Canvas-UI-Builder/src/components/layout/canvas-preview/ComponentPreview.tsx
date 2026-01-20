/**
 * ComponentPreview - Main preview component for Canvas UI Builder
 *
 * Uses DirectPreview to render REAL shadcn/ui components from the agent app.
 * This gives us true live rendering with full interactivity.
 */
import { DirectPreview } from './DirectPreview';

import type { FC } from 'react';

// ============================================
// Types
// ============================================

interface ComponentPreviewProps {
  /** Component name to preview (e.g., "button", "card") */
  readonly componentName: string | null;
  /** Current theme */
  readonly theme: 'light' | 'dark';
  /** Custom CSS overrides from properties panel */
  readonly cssOverrides?: Record<string, string>;
}

// ============================================
// Component
// ============================================

export const ComponentPreview: FC<ComponentPreviewProps> = ({
  componentName,
  theme,
  cssOverrides,
}) => {
  return (
    <DirectPreview
      componentName={componentName}
      theme={theme}
      cssOverrides={cssOverrides}
    />
  );
};
