import { useCallback, useEffect, useState } from 'react';

import type { FC } from 'react';

import { RootLayout } from '@/components/layout';
import { CrashNotification } from '@/components/modals/crash-notification';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBrowser } from '@/hooks/use-browser';
import { useCrashCheck } from '@/hooks/use-crash-check';
import { TauriProvider } from '@/providers/tauri-provider';

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
  const { hasCrash, crashLog, dismiss, acknowledge } = useCrashCheck();
  const [crashDialogOpen, setCrashDialogOpen] = useState(true);

  // Handle dialog close - either dismiss or acknowledge based on user action
  const handleOpenChange = useCallback(
    (open: boolean): void => {
      setCrashDialogOpen(open);
      if (!open) {
        // Just closing without explicit dismiss = acknowledge
        acknowledge();
      }
    },
    [acknowledge]
  );

  return (
    <TauriProvider>
      <TooltipProvider delayDuration={0}>
        <div className="h-full">
          <RootLayout />

          {/* Crash notification dialog */}
          {hasCrash && crashLog ? (
            <CrashNotification
              open={crashDialogOpen}
              onOpenChange={handleOpenChange}
              crashLog={crashLog}
              onDismiss={dismiss}
            />
          ) : null}
        </div>
      </TooltipProvider>
    </TauriProvider>
  );
};

export default App;
