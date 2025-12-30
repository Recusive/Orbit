import { useEffect } from 'react';

import type { FC } from 'react';

import { RootLayout } from '@/components/layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBrowser } from '@/hooks/use-browser';

/**
 * Syncs system theme preference to the html element.
 * Uses prefers-color-scheme media query with dark as default.
 */
function useThemeSync(): void {
  useEffect(() => {
    const syncTheme = (isDark: boolean): void => {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    // Check system preference, default to dark
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    syncTheme(mediaQuery.matches);

    // Watch for system theme changes
    const handleChange = (e: MediaQueryListEvent): void => {
      syncTheme(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return (): void => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);
}

const App: FC = () => {
  useThemeSync();
  useBrowser(); // Handle browser messages from Tauri backend

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-full">
        <RootLayout />
      </div>
    </TooltipProvider>
  );
};

export default App;
