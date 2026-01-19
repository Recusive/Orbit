/**
 * ComponentPreview - Renders registry components directly
 *
 * No iframe, no Sandpack - just direct React rendering.
 * Components are imported from the registry and rendered with props
 * that can be controlled from the properties panel.
 */
import { Suspense, lazy } from 'react';

import type { ButtonProps } from '@canvas/registry/components/button';
import type { FC } from 'react';

// Lazy load components from registry
const Button = lazy(() =>
  import('@canvas/registry/components/button').then((m) => ({ default: m.Button }))
);

interface ComponentPreviewProps {
  readonly componentName: string | null;
  readonly theme: 'light' | 'dark';
  /** Props to pass to the component (from properties panel) */
  readonly componentProps?: Record<string, unknown>;
}

// Map component names to their render functions
const COMPONENT_MAP: Record<string, FC<{ props: Record<string, unknown> | undefined }>> = {
  Button: ({ props }) => (
    <div className="flex flex-col items-center gap-6 p-8">
      <h2 className="text-lg font-semibold mb-2">Button</h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button {...(props as ButtonProps)}>Default</Button>
        <Button variant="secondary" {...(props as ButtonProps)}>
          Secondary
        </Button>
        <Button variant="destructive" {...(props as ButtonProps)}>
          Destructive
        </Button>
        <Button variant="outline" {...(props as ButtonProps)}>
          Outline
        </Button>
        <Button variant="ghost" {...(props as ButtonProps)}>
          Ghost
        </Button>
        <Button variant="link" {...(props as ButtonProps)}>
          Link
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
        <Button size="sm" {...(props as ButtonProps)}>
          Small
        </Button>
        <Button size="default" {...(props as ButtonProps)}>
          Default
        </Button>
        <Button size="lg" {...(props as ButtonProps)}>
          Large
        </Button>
      </div>
    </div>
  ),
};

export const ComponentPreview: FC<ComponentPreviewProps> = ({
  componentName,
  theme,
  componentProps,
}) => {
  const bgColor = theme === 'dark' ? 'oklch(0.18 0.012 60)' : 'oklch(0.93 0.015 75)';

  // Placeholder when no component selected
  if (!componentName) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: bgColor }}
      >
        <div className="text-center p-8">
          <div className="opacity-50 mb-4">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto text-muted-foreground"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-muted-foreground mb-1">Preview Area</h2>
          <p className="text-sm text-muted-foreground/70">Select a component from the sidebar</p>
        </div>
      </div>
    );
  }

  // Get the component renderer
  const ComponentRenderer = COMPONENT_MAP[componentName];

  // Component not found in registry
  if (!ComponentRenderer) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: bgColor }}
      >
        <div className="text-center p-8">
          <h2 className="text-lg font-semibold text-muted-foreground mb-1">{componentName}</h2>
          <p className="text-sm text-muted-foreground/70">Component not yet in registry</p>
        </div>
      </div>
    );
  }

  // Render the component
  return (
    <div className="w-full h-full overflow-auto" style={{ background: bgColor }}>
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        }
      >
        <ComponentRenderer props={componentProps} />
      </Suspense>
    </div>
  );
};
