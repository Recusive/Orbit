import { useEffect } from 'react';

import type { FC } from 'react';

import { RootLayout } from '@/components/layout';
import { useBrowser } from '@/hooks/use-browser';

/**
 * Syncs VS Code webview theme to the html element.
 * VS Code adds 'vscode-dark' or 'vscode-light' to the body.
 * Our CSS uses 'html.dark' selector for dark mode.
 */
function useVSCodeThemeSync(): void {
  useEffect(() => {
    const syncTheme = (): void => {
      const isDark = document.body.classList.contains('vscode-dark');
      const isHighContrast = document.body.classList.contains('vscode-high-contrast');

      if (isDark || isHighContrast) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    // Initial sync
    syncTheme();

    // Watch for VS Code theme changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          syncTheme();
          break;
        }
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return (): void => {
      observer.disconnect();
    };
  }, []);
}

const App: FC = () => {
  useVSCodeThemeSync();
  useBrowser(); // Handle browser messages from Orbit extension

  return (
    <div className="h-full">
      <RootLayout />
    </div>
  );
};

export default App;
