import { CanvasApp } from '@canvas/CanvasApp';
import { EditorApp } from '@editor/EditorApp';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { HeaderTab } from '@/stores/ui/ui-store';
import type { CSSProperties, FC } from 'react';

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
// Style Constants (avoid new object refs on each render)
// ============================================

const STYLE_DISPLAY_BLOCK: CSSProperties = { display: 'block' };
const STYLE_DISPLAY_NONE: CSSProperties = { display: 'none' };

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
 * mounted so its component remains alive (hidden via CSS).
 * This implements a "mount once, keep alive" pattern for tab switching.
 *
 * Returns stable boolean values to avoid unnecessary re-renders from
 * Set reference changes.
 *
 * MEMORY NOTE: Mounted tabs are never unmounted. For memory-intensive
 * modes (Canvas with ReactFlow), consider adding a manual "unload" action
 * or timeout-based unmounting for long-idle tabs if memory becomes an issue.
 */
interface MountedTabsResult {
  hasAgent: boolean;
  hasCanvas: boolean;
  hasEditor: boolean;
}

function useMountedTabs(activeTab: HeaderTab): MountedTabsResult {
  const [mountedTabs, setMountedTabs] = useState<Set<HeaderTab>>(() => new Set([activeTab]));

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      return new Set(prev).add(activeTab);
    });
  }, [activeTab]);

  // Return stable booleans instead of Set to avoid reference changes
  return useMemo(
    () => ({
      hasAgent: mountedTabs.has('agent'),
      hasCanvas: mountedTabs.has('canvas'),
      hasEditor: mountedTabs.has('editor'),
    }),
    [mountedTabs]
  );
}

// ============================================
// Error Fallback
// ============================================

/** Display labels for each mode - hoisted to avoid recreation on each render */
const MODE_LABELS: Record<HeaderTab, string> = {
  agent: 'Agent',
  canvas: 'Canvas',
  editor: 'Editor',
} as const;

interface ModeErrorFallbackProps {
  readonly mode: HeaderTab;
  readonly error?: Error;
  /** Optional callback to reset the error boundary and retry rendering */
  readonly onReset?: () => void;
}

/**
 * Fallback UI shown when a mode (Agent/Canvas/Editor) crashes.
 * Isolates crashes to individual modes so the app remains usable.
 * Provides both "Try Again" (reset error boundary) and "Reload App" options.
 */
const ModeErrorFallback: FC<ModeErrorFallbackProps> = ({ mode, error, onReset }) => {
  const handleReload = (): void => {
    window.location.reload();
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-6">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {MODE_LABELS[mode]} Mode Crashed
          </h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. You can try again, continue using other modes, or reload
            the app.
          </p>
          {error ? (
            <p className="text-xs text-destructive/80 font-mono bg-destructive/5 p-2 rounded">
              {error.message}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {onReset ? (
            <Button variant="default" size="sm" onClick={onReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={handleReload}>
            Reload App
          </Button>
        </div>
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
 * Editor mode - VS Code-style code editor with AI chat sidebar
 */
const EditorMode: FC = () => {
  return <EditorApp />;
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
  const { hasAgent, hasCanvas, hasEditor } = useMountedTabs(activeTab);

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
                {hasAgent ? (
                  <div
                    className="h-full w-full"
                    style={activeTab === 'agent' ? STYLE_DISPLAY_BLOCK : STYLE_DISPLAY_NONE}
                  >
                    <ErrorBoundary
                      fallback={(error, reset) => (
                        <ModeErrorFallback mode="agent" error={error} onReset={reset} />
                      )}
                    >
                      <AgentMode />
                    </ErrorBoundary>
                  </div>
                ) : null}
                {/* Canvas mode - mounted on first visit, kept alive */}
                {hasCanvas ? (
                  <div
                    className="h-full w-full"
                    style={activeTab === 'canvas' ? STYLE_DISPLAY_BLOCK : STYLE_DISPLAY_NONE}
                  >
                    <ErrorBoundary
                      fallback={(error, reset) => (
                        <ModeErrorFallback mode="canvas" error={error} onReset={reset} />
                      )}
                    >
                      <CanvasMode />
                    </ErrorBoundary>
                  </div>
                ) : null}
                {/* Editor mode - mounted on first visit, kept alive */}
                {hasEditor ? (
                  <div
                    className="h-full w-full"
                    style={activeTab === 'editor' ? STYLE_DISPLAY_BLOCK : STYLE_DISPLAY_NONE}
                  >
                    <ErrorBoundary
                      fallback={(error, reset) => (
                        <ModeErrorFallback mode="editor" error={error} onReset={reset} />
                      )}
                    >
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
