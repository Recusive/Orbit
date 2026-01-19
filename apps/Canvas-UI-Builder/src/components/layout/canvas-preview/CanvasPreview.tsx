/**
 * CanvasPreview - Preview iframe for rendering UI components
 *
 * Displays a bordered iframe where generated UI components will be rendered.
 * The dashed border provides visual feedback for the preview area bounds.
 */
import { useEffect, useState } from 'react';

import type { FC } from 'react';

/**
 * Hook to track the current theme by watching the `dark` class on <html>.
 * The app uses class-based theming (dark class present = dark mode).
 */
function useEffectiveTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return theme;
}

export const CanvasPreview: FC = () => {
  const effectiveTheme = useEffectiveTheme();

  // Background colors matching the app's theme
  const bgColor = effectiveTheme === 'dark' ? 'oklch(0.18 0.012 60)' : 'oklch(0.93 0.015 75)';

  return (
    <div className="flex-1 flex items-center justify-center overflow-auto p-8">
      {/* Preview Frame Container */}
      <div className="relative flex flex-col" style={{ width: '600px', height: '400px' }}>
        {/* Iframe Container with dashed border */}
        <div className="flex-1 rounded-lg border-2 border-dashed border-border/60 overflow-hidden">
          <iframe
            title="Canvas Preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={`
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    * {
                      margin: 0;
                      padding: 0;
                      box-sizing: border-box;
                    }
                    html, body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      min-height: 100vh;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      background: ${bgColor};
                      color: #71717a;
                    }
                    .placeholder {
                      text-align: center;
                      padding: 2rem;
                    }
                    .placeholder .icon {
                      margin-bottom: 1rem;
                      opacity: 0.5;
                    }
                    .placeholder h2 {
                      font-size: 1.125rem;
                      font-weight: 600;
                      color: #a1a1aa;
                      margin-bottom: 0.5rem;
                    }
                    .placeholder p {
                      font-size: 0.875rem;
                      color: #71717a;
                    }
                  </style>
                </head>
                <body>
                  <div class="placeholder">
                    <div class="icon">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                    <h2>Preview Area</h2>
                    <p>Describe a UI component to see it here</p>
                  </div>
                </body>
              </html>
            `}
          />
        </div>
      </div>
    </div>
  );
};
