import { CanvasApp } from '@canvas/CanvasApp';
import { EditorApp } from '@editor/EditorApp';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { HeaderTab } from '@/stores/ui/ui-store';
import type { CSSProperties, FC } from 'react';

import welcomeBg from '@/assets/welcome-bg.png';
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
import { ThemeProvider } from '@/providers/theme-provider';
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
 * Tracks which tabs have been visited. Once a tab is visited, it stays
 * mounted so its component remains alive (hidden via CSS).
 * This implements a "mount once, keep alive" pattern for tab switching.
 *
 * Uses object-based tracking to avoid Set recreation on updates.
 *
 * MEMORY NOTE: Mounted tabs are never unmounted. For memory-intensive
 * modes (Canvas with ReactFlow), consider adding a manual "unload" action
 * or timeout-based unmounting for long-idle tabs if memory becomes an issue.
 */
interface MountedTabsState {
  agent: boolean;
  canvas: boolean;
  editor: boolean;
}

function useMountedTabs(activeTab: HeaderTab): MountedTabsState {
  const [mounted, setMounted] = useState<MountedTabsState>(() => ({
    agent: activeTab === 'agent',
    canvas: activeTab === 'canvas',
    editor: activeTab === 'editor',
  }));

  useEffect(() => {
    setMounted((prev) => {
      // Skip update if already mounted
      if (prev[activeTab]) return prev;
      return { ...prev, [activeTab]: true };
    });
  }, [activeTab]);

  // State is already stable - no need for useMemo
  return mounted;
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
    <div className="h-full w-full flex items-center justify-center bg-chat-area">
      <div
        className="flex flex-col items-center gap-4 max-w-sm text-center px-8 py-7 rounded-2xl"
        style={{
          backgroundColor: 'var(--gray-1)',
          boxShadow: '0 0 0 3px color-mix(in oklch, var(--destructive) 20%, transparent)',
        }}
      >
        {/* Icon */}
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in oklch, var(--destructive) 12%, transparent)' }}
          aria-hidden="true"
        >
          <AlertTriangle className="h-[18px] w-[18px] text-destructive" />
        </div>

        {/* Copy */}
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold text-foreground" style={{ textWrap: 'balance' }}>
            {MODE_LABELS[mode]} Crashed
          </h2>
          <p className="text-sm text-muted-foreground">
            Something went wrong. Try again or reload the app.
          </p>
        </div>

        {/* Error detail */}
        {error ? (
          <div
            className="w-full rounded-lg px-3 py-2"
            style={{
              backgroundColor: 'color-mix(in oklch, var(--destructive) 8%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--destructive) 15%, transparent)',
            }}
          >
            <p className="text-xs text-destructive font-mono text-left break-all leading-relaxed">
              {error.message}
            </p>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex gap-2">
          {onReset ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={handleReload}>
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
  useBrowser(); // Handle browser messages from Tauri backend
  const { hasCrash, crashLog, dismiss, acknowledge } = useCrashCheck();
  const [crashDialogOpen, setCrashDialogOpen] = useState(true);

  const activeTab = useUIStore((state) => state.activeTab);
  const hasWorkspace = useHasWorkspace();
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);

  // Track which tabs have been visited for lazy mounting
  const mounted = useMountedTabs(activeTab);

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
    return (
      <ThemeProvider>
        <OnboardingFlow />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <TauriProvider>
        <TooltipProvider delayDuration={0}>
          <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground relative">
            {/* Full-window background image — only on welcome page */}
            {!hasWorkspace ? (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${welcomeBg})` }}
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-gray-5/55 via-gray-5/25 to-gray-5/10 dark:from-gray-3/80 dark:via-gray-3/55 dark:to-gray-3/35"
                  aria-hidden="true"
                />
              </>
            ) : null}

            {/* Shared header with tabs — relative z-10 to sit above welcome bg */}
            <HeaderBar transparent={!hasWorkspace} className="relative z-10" />

            {/* Mode content - show welcome page if no workspace, otherwise show active mode */}
            {/*
             * LAZY MOUNT PATTERN: Modes are only mounted when first visited, then kept
             * alive via CSS display toggling. This prevents:
             * 1. Layout flashes when switching tabs (no remounting)
             * 2. Unnecessary memory usage for unvisited modes
             */}
            <div className="flex-1 min-h-0 overflow-hidden relative z-10">
              {!hasWorkspace ? (
                <WelcomePage />
              ) : (
                <>
                  {/* Agent mode - mounted on first visit, kept alive */}
                  {mounted.agent ? (
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
                  {mounted.canvas ? (
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
                  {mounted.editor ? (
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

            {/* Status Bar — relative z-10 to sit above welcome bg */}
            <StatusBar transparent={!hasWorkspace} className="relative z-10" />

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
            <Toaster position="bottom-right" offset={40} />
          </div>
        </TooltipProvider>
      </TauriProvider>
    </ThemeProvider>
  );
};

export default App;
