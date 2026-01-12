import { CanvasApp } from '@canvas/CanvasApp';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { HeaderTab } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import { HeaderBar } from '@/components/layout/header-bar';
import { RootLayout } from '@/components/layout/root-layout';
import { StatusBar } from '@/components/layout/status-bar';
import { CrashNotification } from '@/components/modals';
import { OnboardingFlow } from '@/components/onboarding';
import { ErrorBoundary } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WelcomePage } from '@/components/welcome';
import { useBrowser } from '@/hooks/browser/use-browser';
import { useCrashCheck } from '@/hooks/core/use-crash-check';
import { TauriProvider } from '@/providers/tauri-provider';
import { useOnboardingStore } from '@/stores/onboarding/onboarding-store';
import { useHasWorkspace, useUIStore } from '@/stores/ui/ui-store';

// ============================================
// Hooks
// ============================================

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
 * Tracks which tabs have been visited. Once a tab is visited, it stays
 * in the set so its component remains mounted (hidden via CSS).
 * This implements a "mount once, keep alive" pattern for tab switching.
 *
 * Uses useMemo to ensure the set is only updated when activeTab changes,
 * following idiomatic React patterns for derived state.
 *
 * ⚠️ MEMORY NOTE: Mounted tabs are never unmounted. For memory-intensive
 * modes (Canvas with ReactFlow), consider adding a manual "unload" action
 * or timeout-based unmounting for long-idle tabs if memory becomes an issue.
 */
function useMountedTabs(activeTab: HeaderTab): Set<HeaderTab> {
  const mountedTabsRef = useRef<Set<HeaderTab>>(new Set());

  // useMemo ensures we only create a new Set when activeTab changes.
  // The ref persists across renders to accumulate all visited tabs.
  return useMemo(() => {
    if (!mountedTabsRef.current.has(activeTab)) {
      mountedTabsRef.current = new Set(mountedTabsRef.current).add(activeTab);
    }
    return mountedTabsRef.current;
  }, [activeTab]);
}

// ============================================
// Error Fallback
// ============================================

interface ModeErrorFallbackProps {
  readonly mode: HeaderTab;
  readonly error?: Error;
}

/**
 * Fallback UI shown when a mode (Agent/Canvas/Editor) crashes.
 * Isolates crashes to individual modes so the app remains usable.
 */
const ModeErrorFallback: FC<ModeErrorFallbackProps> = ({ mode, error }) => {
  const modeLabels: Record<HeaderTab, string> = {
    agent: 'Agent',
    canvas: 'Canvas',
    editor: 'Editor',
  };

  const handleReload = useCallback((): void => {
    window.location.reload();
  }, []);

  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-6">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{modeLabels[mode]} Mode Crashed</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. You can continue using other modes, or reload to try
            again.
          </p>
          {error ? (
            <p className="text-xs text-destructive/80 font-mono bg-destructive/5 p-2 rounded">
              {error.message}
            </p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={handleReload}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reload App
        </Button>
      </div>
    </div>
  );
};

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

  // Track which tabs have been visited for lazy mounting
  const mountedTabs = useMountedTabs(activeTab);

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
          {/*
           * LAZY MOUNT PATTERN: Modes are only mounted when first visited, then kept
           * alive via CSS display toggling. This prevents:
           * 1. Layout flashes when switching tabs (no remounting)
           * 2. Unnecessary memory usage for unvisited modes
           */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {!hasWorkspace ? (
              <WelcomePage />
            ) : (
              <>
                {/* Agent mode - mounted on first visit, kept alive */}
                {mountedTabs.has('agent') ? (
                  <div
                    className="h-full w-full"
                    style={{ display: activeTab === 'agent' ? 'block' : 'none' }}
                  >
                    <ErrorBoundary fallback={<ModeErrorFallback mode="agent" />}>
                      <AgentMode />
                    </ErrorBoundary>
                  </div>
                ) : null}
                {/* Canvas mode - mounted on first visit, kept alive */}
                {mountedTabs.has('canvas') ? (
                  <div
                    className="h-full w-full"
                    style={{ display: activeTab === 'canvas' ? 'block' : 'none' }}
                  >
                    <ErrorBoundary fallback={<ModeErrorFallback mode="canvas" />}>
                      <CanvasMode />
                    </ErrorBoundary>
                  </div>
                ) : null}
                {/* Editor mode - mounted on first visit, kept alive */}
                {mountedTabs.has('editor') ? (
                  <div
                    className="h-full w-full"
                    style={{ display: activeTab === 'editor' ? 'block' : 'none' }}
                  >
                    <ErrorBoundary fallback={<ModeErrorFallback mode="editor" />}>
                      <EditorMode />
                    </ErrorBoundary>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Status Bar */}
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

          {/* Toast notifications */}
          <Toaster position="bottom-right" />
        </div>
      </TooltipProvider>
    </TauriProvider>
  );
};

export default App;
