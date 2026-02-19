import { CanvasApp } from '@canvas/CanvasApp';
import { EditorApp } from '@editor/EditorApp';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { HeaderTab } from '@/stores/ui/ui-store';
import type { CSSProperties, FC } from 'react';

import welcomeBg from '@/assets/welcome-bg.png';
import { ActionsBar } from '@/components/layout/actions-bar';
import { ActivityCard } from '@/components/layout/activity-card';
import { AppShell } from '@/components/layout/app-shell';
import { ContentCard } from '@/components/layout/content-card';
import { ContentTopBar } from '@/components/layout/content-top-bar';
import { PrimarySidebar } from '@/components/layout/primary-sidebar';
import { ResizeHandle } from '@/components/layout/resize-handle';
import { RootLayout } from '@/components/layout/root-layout';
import { SidebarResizeHandle } from '@/components/layout/sidebar-resize-handle';
import { StatusBar } from '@/components/layout/status-bar';
import { CrashNotification } from '@/components/modals';
import { OnboardingFlow } from '@/components/onboarding';
import { ActivityPanel } from '@/components/panels';
import { ErrorBoundary } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WelcomePage } from '@/components/welcome';
import { startDemoConversation } from '@/hooks/agent/demo-conversation';
import { MOCK_ROOT, getMockFileContent } from '@/hooks/agent/use-tauri-mock';
import { useBrowser } from '@/hooks/browser/use-browser';
import { useAutoUpdate } from '@/hooks/core/use-auto-update';
import { useCrashCheck } from '@/hooks/core/use-crash-check';
import { useFullscreen } from '@/hooks/ui/use-fullscreen';
import { useTrafficLights } from '@/hooks/ui/use-traffic-lights';
import { CONTENT_CARD, SIDEBAR } from '@/lib/utils/constants';
import { TauriProvider } from '@/providers/tauri-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding-store';
import { useHasWorkspace, useLeftSidebarWidth, useUIStore } from '@/stores/ui/ui-store';

// ============================================
// Style Constants (avoid new object refs on each render)
// ============================================

const STYLE_DISPLAY_BLOCK: CSSProperties = { display: 'block' };
const STYLE_DISPLAY_NONE: CSSProperties = { display: 'none' };

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Activity panel slide transition — margin reclaims space, transform moves it off-screen */
const ACTIVITY_TRANSITION: string | undefined = PREFERS_REDUCED_MOTION
  ? undefined
  : `margin-right ${CONTENT_CARD.transition}, transform ${CONTENT_CARD.transition}`;

// ============================================
// Demo View Initialization
// ============================================

/**
 * Apply demo-specific initial state based on the ?view= query parameter.
 * Each view variant configures which panels and files are open on launch.
 *
 * For 'hero' and 'demo' views, starts a scripted conversation playback.
 * For 'showcase' and 'feature' views, configures static editor state.
 *
 * @returns cleanup function (for conversation playback cancellation)
 */
function applyDemoView(view: string): (() => void) | undefined {
  const viewerStore = useFileViewerStore.getState();
  const uiStore = useUIStore.getState();

  // Set workspace so the full workspace UI renders (sidebar, file tree, etc.)
  // MOCK_ROOT is '/demo' → workspaceName becomes 'demo'
  uiStore.setWorkspace(MOCK_ROOT);

  let cleanupFn: (() => void) | undefined;

  switch (view) {
    case 'hero': {
      // Editor open with a React component file + scripted conversation
      const path = `${MOCK_ROOT}/src/app.tsx`;
      const content = getMockFileContent(path);
      viewerStore.openFile(path, content);
      viewerStore.setFileContent(path, content);
      uiStore.openFileTab();
      cleanupFn = startDemoConversation();
      break;
    }

    case 'showcase': {
      // Settings dialog open on accounts page showing Claude Code connected
      uiStore.openSettings('account');
      cleanupFn = startDemoConversation();
      break;
    }

    case 'feature': {
      // Editor tab with a utility file + scripted conversation in editor chat
      const path = `${MOCK_ROOT}/src/utils.ts`;
      const content = getMockFileContent(path);
      viewerStore.openFile(path, content);
      viewerStore.setFileContent(path, content);
      uiStore.openFileTab();
      uiStore.setActiveTab('editor');
      cleanupFn = startDemoConversation();
      break;
    }

    case 'demo': {
      // Editor open with CSS file + scripted conversation
      const path = `${MOCK_ROOT}/src/styles.css`;
      const content = getMockFileContent(path);
      viewerStore.openFile(path, content);
      viewerStore.setFileContent(path, content);
      uiStore.openFileTab();
      cleanupFn = startDemoConversation();
      break;
    }

    default: {
      // No view specified — default chat view, no editor
      break;
    }
  }

  return cleanupFn;
}

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

/**
 * Staggered entrance animation timing for crash fallback children.
 * Uses smooth easing (0.16, 1, 0.3, 1) matching POPOVER_ANIMATION.enterEasing.
 * Each child delays 60ms for a subtle stagger reveal effect.
 */
const CRASH_ENTER: CSSProperties = {
  animationDuration: '400ms',
  animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
};
const CRASH_ENTER_1: CSSProperties = { ...CRASH_ENTER, animationDelay: '60ms' };
const CRASH_ENTER_2: CSSProperties = { ...CRASH_ENTER, animationDelay: '120ms' };
const CRASH_ENTER_3: CSSProperties = { ...CRASH_ENTER, animationDelay: '180ms' };

interface ModeErrorFallbackProps {
  readonly mode: HeaderTab;
  readonly error?: Error;
  /** Optional callback to reset the error boundary and retry rendering */
  readonly onReset?: () => void;
}

/**
 * Fallback UI shown when a mode (Agent/Canvas/Editor) crashes.
 * Isolates crashes to individual modes so the app remains usable.
 * Uses staggered entrance animation following orbit animation guidelines.
 */
const ModeErrorFallback: FC<ModeErrorFallbackProps> = ({ mode, error, onReset }) => {
  const handleReload = (): void => {
    window.location.reload();
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-chat-area">
      <div
        className="flex flex-col items-center gap-6 max-w-[400px] w-full text-center px-5 py-5 rounded-2xl"
        style={{
          backgroundColor: 'var(--gray-2)',
          border: '1px solid var(--gray-5)',
        }}
      >
        {/* Icon with ambient radial glow */}
        <div className="relative animate-in fade-in-0 zoom-in-[0.96]" style={CRASH_ENTER}>
          <div
            className="absolute -inset-4 rounded-3xl"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklch, var(--destructive) 12%, transparent), transparent 70%)',
            }}
            aria-hidden="true"
          />
          <div
            className="relative h-12 w-12 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: 'color-mix(in oklch, var(--destructive) 10%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--destructive) 15%, transparent)',
            }}
            aria-hidden="true"
          >
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
        </div>

        {/* Heading + description */}
        <div
          className="space-y-1.5 animate-in fade-in-0 slide-in-from-bottom-1"
          style={CRASH_ENTER_1}
        >
          <h2
            className="text-base font-semibold text-foreground tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            {MODE_LABELS[mode]} Crashed
          </h2>
          <p className="text-[13px] text-muted-foreground/80 leading-relaxed">
            Something went wrong. Try again or reload the app.
          </p>
        </div>

        {/* Error detail — red diagnostic box */}
        {error ? (
          <div
            className="w-full rounded-xl px-3.5 py-2.5 animate-in fade-in-0 slide-in-from-bottom-1"
            style={{
              ...CRASH_ENTER_2,
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
        <div
          className="flex gap-2.5 self-end animate-in fade-in-0 slide-in-from-bottom-1"
          style={CRASH_ENTER_3}
        >
          {onReset ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="!size-3 mr-1" />
              Try Again
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={handleReload}>
            Reload App
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Agent mode - the main chat interface with activity panel
 * (Sidebar is now in AppShell, not here)
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
  useAutoUpdate(); // Check for app updates on mount + periodic interval
  const { hasCrash, crashLog, dismiss, acknowledge } = useCrashCheck();
  const [crashDialogOpen, setCrashDialogOpen] = useState(true);

  const activeTab = useUIStore((state) => state.activeTab);
  const hasWorkspace = useHasWorkspace();
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);

  // Sidebar state — now global (shared across all modes)
  const leftSidebarWidth = useLeftSidebarWidth();
  const sidebarOpen = leftSidebarWidth > SIDEBAR.collapsed;
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);
  const reviewPanelOpen = useUIStore((s) => s.reviewPanelOpen);
  const reviewPanelWidth = useUIStore((s) => s.reviewPanelWidth);

  // Dia-style layout hooks
  useTrafficLights(sidebarOpen);
  const isFullscreen = useFullscreen();

  // Skip onboarding in demo mode (marketing site iframe with ?demo=true)
  const searchParams = new URLSearchParams(window.location.search);
  const isDemo = searchParams.get('demo') === 'true';
  const demoView = searchParams.get('view') ?? '';

  // Apply demo-specific initial state based on the ?view= parameter
  useEffect(() => {
    if (!isDemo) return;
    let cleanupConversation: (() => void) | undefined;
    const timer = setTimeout(() => {
      cleanupConversation = applyDemoView(demoView);
    }, 800);
    return (): void => {
      clearTimeout(timer);
      cleanupConversation?.();
    };
  }, [isDemo, demoView]);

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

  // Listen for sidebar toggle keyboard shortcut (global — all modes)
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  useEffect(() => {
    window.addEventListener('toggleLeftSidebar', toggleLeftSidebar);
    return (): void => {
      window.removeEventListener('toggleLeftSidebar', toggleLeftSidebar);
    };
  }, [toggleLeftSidebar]);

  // Activity panel slide wrapper — mirrors the sidebar's margin-slide pattern.
  // When closed, marginRight = -width slides the entire panel off the right edge
  // as one rigid body. Content inside never compresses.
  const isWelcome = !hasWorkspace && !isDemo;
  const activityOpen = reviewPanelOpen && !isWelcome;
  const activityWrapperStyle = useMemo(
    (): CSSProperties => ({
      width: reviewPanelWidth,
      marginRight: activityOpen ? 0 : -reviewPanelWidth,
      transform: activityOpen ? 'translateX(0)' : 'translateX(100%)',
      flexShrink: 0,
      overflow: 'hidden',
      transition: ACTIVITY_TRANSITION,
    }),
    [activityOpen, reviewPanelWidth]
  );

  // Direct DOM ref for the activity wrapper — bypasses React during drag resize.
  // ResizeHandle calls onDrag → sets style.width directly at 60fps, no re-renders.
  // Store commit happens once on mouseup.
  const activityWrapperRef = useRef<HTMLDivElement>(null);
  const handleActivityDrag = useCallback((width: number): void => {
    const el = activityWrapperRef.current;
    if (el) {
      el.style.width = `${String(width)}px`;
    }
  }, []);

  // Show onboarding flow if user hasn't completed it yet (skip in demo mode)
  if (!hasCompletedOnboarding && !isDemo) {
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
          <AppShell
            sidebar={<PrimarySidebar />}
            resizeHandle={<SidebarResizeHandle />}
            sidebarWidth={leftSidebarWidth}
            actionsBar={rightSidebarOpen && !isWelcome ? <ActionsBar /> : undefined}
          >
            {/* Main content card — takes remaining space */}
            <ContentCard
              sidebarOpen={sidebarOpen}
              actionsBarOpen={activityOpen || rightSidebarOpen ? !isWelcome : false}
              isFullscreen={isFullscreen}
            >
              {/* Welcome background image — inside the card */}
              {isWelcome ? (
                <>
                  <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat rounded-[inherit]"
                    style={{ backgroundImage: `url(${welcomeBg})` }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute inset-0 hidden dark:block bg-linear-to-t from-gray-3/80 via-gray-3/55 to-gray-3/35 rounded-[inherit]"
                    aria-hidden="true"
                  />
                </>
              ) : null}

              {/* ContentTopBar replaces HeaderBar — inside the card */}
              <ContentTopBar
                sidebarOpen={sidebarOpen}
                transparent={isWelcome}
                className="relative z-10"
              />

              {/* Mode content — wrapped in relative container so gradient overlays scroll area */}
              <div className="flex-1 min-h-0 overflow-hidden relative z-0">
                {/* Gradient fade below header — blends card color into content */}
                {!isWelcome ? (
                  <div
                    className="absolute inset-x-0 top-0 h-8 z-10 pointer-events-none"
                    style={{ background: 'linear-gradient(to bottom, var(--card), transparent)' }}
                    aria-hidden="true"
                  />
                ) : null}
                {isWelcome ? (
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

              {/* Status Bar — inside the card */}
              <StatusBar transparent={isWelcome} className="relative z-10" />

              {/* Crash notification dialog */}
              {hasCrash && crashLog ? (
                <CrashNotification
                  open={crashDialogOpen}
                  onOpenChange={handleOpenChange}
                  crashLog={crashLog}
                  onDismiss={dismiss}
                />
              ) : null}

              {/* Toast notifications — offset accounts for card margin */}
              <Toaster position="bottom-right" offset={46} />
            </ContentCard>

            {/* Activity panel — slides in/out via negative marginRight (sidebar pattern) */}
            <div ref={activityWrapperRef} style={activityWrapperStyle}>
              <div className="h-full flex">
                <ResizeHandle
                  direction="vertical"
                  target="review"
                  borderless
                  onDrag={handleActivityDrag}
                />
                <ActivityCard actionsBarOpen={rightSidebarOpen} isFullscreen={isFullscreen}>
                  <ActivityPanel canRenderTerminal canManageBrowser />
                </ActivityCard>
              </div>
            </div>
          </AppShell>
        </TooltipProvider>
      </TauriProvider>
    </ThemeProvider>
  );
};

export default App;
