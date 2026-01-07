import { CanvasApp } from '@canvas/CanvasApp';
import { useCallback, useEffect, useState } from 'react';

import type { FC } from 'react';

import { HeaderBar } from '@/components/layout/header-bar';
import { RootLayout } from '@/components/layout/root-layout';
import { StatusBar } from '@/components/layout/status-bar';
import { CrashNotification } from '@/components/modals';
import { OnboardingFlow } from '@/components/onboarding';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WelcomePage } from '@/components/welcome';
import { useBrowser } from '@/hooks/browser/use-browser';
import { useCrashCheck } from '@/hooks/core/use-crash-check';
import { TauriProvider } from '@/providers/tauri-provider';
import { useOnboardingStore } from '@/stores/onboarding/onboarding-store';
import { useHasWorkspace, useUIStore } from '@/stores/ui/ui-store';

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

/**
 * Agent mode - the main chat interface with sidebar and activity panel
 */
const AgentMode: FC = () => {
  return <RootLayout />;
};

/**
 * Canvas mode - design canvas powered by CanvasApp
 */
const CanvasMode: FC = () => {
  return <CanvasApp />;
};

/**
 * Editor mode - code editor (placeholder for now)
 */
const EditorMode: FC = () => {
  return (
    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
      Editor Mode (coming soon)
    </div>
  );
};

const App: FC = () => {
  useThemeSync();
  useBrowser(); // Handle browser messages from Tauri backend
  const { hasCrash, crashLog, dismiss, acknowledge } = useCrashCheck();
  const [crashDialogOpen, setCrashDialogOpen] = useState(true);

  const activeTab = useUIStore((state) => state.activeTab);
  const hasWorkspace = useHasWorkspace();
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);

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

  // Show onboarding flow if user hasn't completed it yet
  if (!hasCompletedOnboarding) {
    return <OnboardingFlow />;
  }

  return (
    <TauriProvider>
      <TooltipProvider delayDuration={0}>
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
          {/* Shared header with tabs */}
          <HeaderBar />

          {/* Mode content - show welcome page if no workspace, otherwise show active mode */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {!hasWorkspace ? (
              <WelcomePage />
            ) : activeTab === 'agent' ? (
              <AgentMode />
            ) : activeTab === 'canvas' ? (
              <CanvasMode />
            ) : (
              <EditorMode />
            )}
          </div>

          {/* Status Bar - always visible */}
          <StatusBar />

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
