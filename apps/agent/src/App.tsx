import { CanvasApp } from '@canvas/CanvasApp';
import { EditorApp } from '@editor/EditorApp';
import { EditorChatPanel } from '@editor/components/EditorChatPanel';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
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
import { TerminalCard } from '@/components/layout/terminal-card';
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
import {
  CHAT_PANEL,
  CONTENT_CARD,
  HEIGHTS,
  LAUNCH_SEQUENCE,
  PANEL_SIZES,
  SIDEBAR,
} from '@/lib/utils/constants';
import { PierreProvider } from '@/providers/pierre-provider';
import { TauriProvider } from '@/providers/tauri-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding-store';
import { useLaunchSequenceStore } from '@/stores/ui/launch-sequence-store';
import {
  useHasWorkspace,
  useLeftSidebarWidth,
  useBottomPanelOpen,
  useBottomPanelHeight,
  useTerminalCollapsed,
  useTerminalPosition,
  useUIStore,
  useVaultOpen,
} from '@/stores/ui/ui-store';
import {
  selectEnableLaunchAnimation,
  useWelcomeAnimationStore,
} from '@/stores/ui/welcome-animation-store';

// ============================================
// Style Constants (avoid new object refs on each render)
// ============================================

const STYLE_DISPLAY_BLOCK: CSSProperties = { display: 'block' };
const STYLE_DISPLAY_NONE: CSSProperties = { display: 'none' };

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Wallpaper fade transition — hoisted to module level (rendering-hoist-jsx) */
const WALLPAPER_TRANSITION = `opacity ${String(LAUNCH_SEQUENCE.wallpaperFadeDuration)}ms ${LAUNCH_SEQUENCE.wallpaperEasing}`;

/** Activity panel slide transition — margin reclaims space, transform moves it off-screen */
const ACTIVITY_TRANSITION: string | undefined = PREFERS_REDUCED_MOTION
  ? undefined
  : `margin-right ${CONTENT_CARD.transition}`;

/** Terminal panel slide transition — height for collapse, margin/transform for hide */
const TERMINAL_TRANSITION: string | undefined = PREFERS_REDUCED_MOTION
  ? undefined
  : `height ${CONTENT_CARD.transition}, margin-bottom ${CONTENT_CARD.transition}, transform ${CONTENT_CARD.transition}`;

// Lazy load TerminalPanel for 'both' mode — heavy xterm.js dependency
const LazyTerminalPanel = lazy(() =>
  import('@/components/terminal/terminal-panel').then((m) => ({ default: m.TerminalPanel }))
);
const TerminalPanelBoth: FC<TerminalPanelProps> = (props) => (
  <Suspense fallback={null}>
    <LazyTerminalPanel {...props} />
  </Suspense>
);

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
  uiStore.initializeWorkspace(MOCK_ROOT);

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
          backgroundColor: 'var(--background)',
          border: '1px solid var(--lg-separator)',
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
  const vaultOpen = useVaultOpen();
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);

  // Demo mode — must be available before sidebar width calculation
  const searchParams = new URLSearchParams(window.location.search);
  const isDemo = searchParams.get('demo') === 'true';
  const demoView = searchParams.get('view') ?? '';
  const isWelcome = !hasWorkspace && !isDemo;

  // Sidebar state — now global (shared across all modes)
  const leftSidebarWidth = useLeftSidebarWidth();
  const lastExpandedSidebarWidth = useUIStore((s) => s.lastExpandedSidebarWidth);
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);
  const reviewPanelOpen = useUIStore((s) => s.reviewPanelOpen);
  const reviewPanelWidth = useUIStore((s) => s.reviewPanelWidth);

  // ── Launch sequence state ──────────────────────────────────────────────
  const launchPhase = useLaunchSequenceStore((s) => s.phase);
  const isLaunchActive = useLaunchSequenceStore((s) => s.isActive);
  const isLaunchAnimating = isLaunchActive && launchPhase !== 'complete';

  const startSequence = useLaunchSequenceStore((s) => s.startSequence);
  const skipToComplete = useLaunchSequenceStore((s) => s.skipToComplete);
  const resetLaunch = useLaunchSequenceStore((s) => s.reset);
  const enableLaunchAnimation = useWelcomeAnimationStore(selectEnableLaunchAnimation);

  // Sidebar reveal target — use actual stored width, not hardcoded 256.
  // If user previously resized sidebar to 340px, reveal should target 340px.
  // If sidebar is stored as collapsed (0), use lastExpandedSidebarWidth as reveal target.
  const revealSidebarWidth =
    leftSidebarWidth > SIDEBAR.collapsed ? leftSidebarWidth : lastExpandedSidebarWidth;

  // Should the sidebar be hidden for the launch animation?
  // Covers both active animation phases AND the pre-animation first frame
  // (before useEffect calls startSequence(), isActive is still false).
  // Without this, the sidebar renders at full width for one frame then collapses.
  const isLaunchHidingSidebar =
    isWelcome && enableLaunchAnimation && !PREFERS_REDUCED_MOTION && launchPhase !== 'complete';

  // During idle/wallpaper/ascii → sidebar forced to 0 (collapsed)
  // During ui-reveal → sidebar animates to stored width
  // After complete → UIStore's actual value takes over
  const effectiveSidebarWidth = isLaunchHidingSidebar
    ? launchPhase === 'ui-reveal'
      ? revealSidebarWidth
      : SIDEBAR.collapsed
    : leftSidebarWidth;

  // Derive sidebarOpen from effective width (not raw UIStore width)
  const sidebarOpen = effectiveSidebarWidth > SIDEBAR.collapsed;

  // Dia-style layout hooks
  useTrafficLights(sidebarOpen);
  const isFullscreen = useFullscreen();

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

  // Auto-collapse sidebar when window becomes too narrow to fit all open panels.
  // Checks: sidebar + chat min + activity panel + actions bar + gaps > window width.
  const collapseLeftSidebar = useUIStore((s) => s.collapseLeftSidebar);
  useEffect(() => {
    const handleResize = (): void => {
      const { leftSidebarWidth, reviewPanelOpen, reviewPanelWidth, rightSidebarOpen, activeTab } =
        useUIStore.getState();
      // Only act when sidebar is actually expanded
      if (leftSidebarWidth <= SIDEBAR.collapsed) return;

      let requiredWidth = leftSidebarWidth + CHAT_PANEL.MIN_WIDTH;
      const activityPanelOpen =
        (reviewPanelOpen || activeTab === 'editor') && (hasWorkspace || isDemo);
      if (activityPanelOpen) requiredWidth += reviewPanelWidth + CONTENT_CARD.gap;
      if (rightSidebarOpen) requiredWidth += SIDEBAR.iconColumnWidth;

      if (window.innerWidth < requiredWidth) {
        collapseLeftSidebar();
      }
    };

    window.addEventListener('resize', handleResize);
    return (): void => {
      window.removeEventListener('resize', handleResize);
    };
  }, [collapseLeftSidebar, hasWorkspace, isDemo]);

  // Activity panel slide wrapper — mirrors the sidebar's margin-slide pattern.
  // When closed, marginRight = -width slides the entire panel off the right edge
  // as one rigid body. Content inside never compresses.

  // ── Launch sequence orchestration ──────────────────────────────────────

  // Start/reset launch sequence based on welcome state
  useEffect(() => {
    if (!isWelcome) {
      resetLaunch();
      return;
    }
    if (PREFERS_REDUCED_MOTION || !enableLaunchAnimation) {
      skipToComplete();
      return;
    }
    startSequence();
  }, [isWelcome, enableLaunchAnimation, resetLaunch, skipToComplete, startSequence]);

  // Wallpaper → ascii: runId-guarded transitionend handler
  const advanceFromWallpaper = useCallback((expectedRunId: number): void => {
    const s = useLaunchSequenceStore.getState();
    if (s.runId !== expectedRunId) return; // stale callback from prior run
    if (s.phase !== 'wallpaper') return; // already advanced by watchdog
    s.advancePhase();
  }, []);

  const handleWallpaperTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>): void => {
      if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return;
      // Capture runId NOW — the delayed callback verifies it still matches
      const expectedRunId = useLaunchSequenceStore.getState().runId;
      window.setTimeout(() => {
        advanceFromWallpaper(expectedRunId);
      }, LAUNCH_SEQUENCE.wallpaperToAsciiDelay);
    },
    [advanceFromWallpaper]
  );

  // Wallpaper watchdog — fallback if transitionend never fires (tab hidden, theme toggle, etc.)
  useEffect(() => {
    if (launchPhase !== 'wallpaper') return;
    const runId = useLaunchSequenceStore.getState().runId;
    const watchdog = window.setTimeout(
      () => {
        const s = useLaunchSequenceStore.getState();
        if (s.runId === runId && s.phase === 'wallpaper') {
          s.advancePhase();
        }
      },
      LAUNCH_SEQUENCE.wallpaperFadeDuration +
        LAUNCH_SEQUENCE.wallpaperToAsciiDelay +
        LAUNCH_SEQUENCE.watchdogEpsilon
    );
    return (): void => {
      window.clearTimeout(watchdog);
    };
  }, [launchPhase]);

  // ASCII → ui-reveal: fires when BeamAsciiPre completes
  const handleAsciiComplete = useCallback((): void => {
    const s = useLaunchSequenceStore.getState();
    if (s.phase === 'ascii') {
      s.advancePhase();
    }
  }, []);

  // ui-reveal → complete: wait for sidebar CSS transition to settle
  useEffect(() => {
    if (launchPhase !== 'ui-reveal') return;
    const runId = useLaunchSequenceStore.getState().runId;
    const timer = window.setTimeout(() => {
      const s = useLaunchSequenceStore.getState();
      if (s.runId === runId && s.phase === 'ui-reveal') {
        s.advancePhase();
      }
    }, LAUNCH_SEQUENCE.sidebarRevealDelay);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [launchPhase]);

  // Toast deferral — delay toast until after launch sequence completes
  const [toastReady, setToastReady] = useState(false);
  useEffect(() => {
    if (launchPhase !== 'complete' || !isWelcome) return;
    const timer = window.setTimeout(() => {
      setToastReady(true);
    }, LAUNCH_SEQUENCE.toastDelay);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [launchPhase, isWelcome]);

  // Derived launch props for WelcomePage
  const showAscii = launchPhase !== 'idle' && launchPhase !== 'wallpaper';
  const deferToast = isWelcome && !toastReady;

  // Slower sidebar transition during launch reveal — 500ms vs normal 200ms.
  // Paired Elements Rule: AppShell (margin-left) and ContentCard (margin) must match.
  // Only active during ui-reveal phase; reverts to default after complete.
  const launchTransitionOverride =
    isLaunchAnimating && launchPhase === 'ui-reveal'
      ? `${String(LAUNCH_SEQUENCE.sidebarRevealDuration)}ms ${LAUNCH_SEQUENCE.sidebarRevealEasing}`
      : undefined;

  // reviewPanelOpen drives the activity card for agent/canvas modes.
  // Editor mode always shows the activity column — it hosts EditorChatPanel.
  const activityOpen = (reviewPanelOpen || activeTab === 'editor') && !isWelcome;
  const activityWrapperStyle = useMemo(
    (): CSSProperties => ({
      width: reviewPanelWidth,
      marginRight: activityOpen ? 0 : -reviewPanelWidth,
      flexShrink: 0,
      // marginRight alone drives both the slide and space-reclaim — the parent's
      // overflow-hidden clips the panel as it moves past the edge. This keeps the
      // activity card and chat area edges perfectly in sync (no gap/flash).
      transition: ACTIVITY_TRANSITION,
    }),
    [activityOpen, reviewPanelWidth]
  );

  // Terminal panel state — terminal is its own card in all 3 positions.
  // Three separate wrappers, one per position. Only the active position is
  // populated with TerminalPanel (xterm can only attach to one container).
  const bottomPanelOpen = useBottomPanelOpen();
  const bottomPanelHeight = useBottomPanelHeight();
  const terminalCollapsed = useTerminalCollapsed();
  const terminalPosition = useTerminalPosition();

  // Compute which terminal position is visually open (open OR collapsed — both show the wrapper)
  const terminalChatOpen = bottomPanelOpen && terminalPosition === 'chat' && !isWelcome;
  const terminalActivityOpen = bottomPanelOpen && terminalPosition === 'activity' && !isWelcome;
  const terminalBothOpen = bottomPanelOpen && terminalPosition === 'both' && !isWelcome;

  // Collapsed height = header + gap handle + TerminalCard bottom margin
  // so the full header is visible without being clipped by overflow: hidden
  const terminalCollapsedHeight = HEIGHTS.headerBar + CONTENT_CARD.gap + CONTENT_CARD.margin;

  // Shared margin-slide style factory for terminal wrappers.
  // Three visual states: open (full height), collapsed (header only), hidden (off-screen).
  const makeTerminalStyle = useCallback(
    (open: boolean): CSSProperties => {
      // Use collapsed height regardless of open/closed — prevents the height from
      // jumping to full bottomPanelHeight when hiding from collapsed state (Cmd+J).
      const effectiveHeight = terminalCollapsed ? terminalCollapsedHeight : bottomPanelHeight;
      return {
        height: effectiveHeight,
        marginBottom: open ? 0 : -effectiveHeight,
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        flexShrink: 0,
        overflow: 'hidden',
        transition: TERMINAL_TRANSITION,
      };
    },
    [bottomPanelHeight, terminalCollapsed, terminalCollapsedHeight]
  );

  const terminalChatStyle = useMemo(
    () => makeTerminalStyle(terminalChatOpen),
    [makeTerminalStyle, terminalChatOpen]
  );
  const terminalActivityStyle = useMemo(
    () => makeTerminalStyle(terminalActivityOpen),
    [makeTerminalStyle, terminalActivityOpen]
  );
  const terminalBothStyle = useMemo(
    () => makeTerminalStyle(terminalBothOpen),
    [makeTerminalStyle, terminalBothOpen]
  );

  // Direct DOM refs for each terminal wrapper — bypasses React during drag resize.
  // ResizeHandle calls onDrag at 60fps; ref.style.height is set directly (no re-renders).
  const terminalChatRef = useRef<HTMLDivElement>(null);
  const terminalActivityRef = useRef<HTMLDivElement>(null);
  const terminalBothRef = useRef<HTMLDivElement>(null);

  // Single drag handler — reads current terminalPosition from store at invocation time
  // to update the correct wrapper. Safe because position only changes on user click, not mid-drag.
  // Value is already clamped by ResizeHandle (via getMax), so no additional clamping needed here.
  // Adds .drag-active CSS class to disable transitions during drag (instant response).
  // The class uses !important to override React-managed inline transition — avoids the
  // reconciliation bug where React skips re-applying unchanged transition values.
  const handleTerminalDrag = useCallback((height: number): void => {
    const pos = useUIStore.getState().terminalPosition;
    const el =
      pos === 'chat'
        ? terminalChatRef.current
        : pos === 'activity'
          ? terminalActivityRef.current
          : terminalBothRef.current;
    if (el) {
      el.classList.add('drag-active');
      el.style.height = `${String(height)}px`;
    }
  }, []);

  // Remove .drag-active class after drag ends, restoring CSS transitions for
  // collapse/expand animations. React's inline transition style takes effect again.
  const handleTerminalDragEnd = useCallback((): void => {
    const pos = useUIStore.getState().terminalPosition;
    const el =
      pos === 'chat'
        ? terminalChatRef.current
        : pos === 'activity'
          ? terminalActivityRef.current
          : terminalBothRef.current;
    if (el) {
      el.classList.remove('drag-active');
    }
  }, []);

  // Dynamic max constraint for terminal resize — called once at drag start.
  // For 'chat'/'activity', subtracts the sibling card's top margin (10px) so the
  // terminal never overflows the flex column. Bottom margin is 0 (handle provides gap).
  // For 'both', the cards row (flex-1, min-h-0) has no margins, so terminal takes full height.
  const getTerminalMax = useCallback((): number => {
    const pos = useUIStore.getState().terminalPosition;
    const ref =
      pos === 'chat' ? terminalChatRef : pos === 'activity' ? terminalActivityRef : terminalBothRef;
    const el = ref.current;
    if (!el?.parentElement) return Infinity;

    const parentHeight = el.parentElement.clientHeight;

    // 'both' mode: terminal shares main flex-col with the cards row.
    // Cards row is flex-1 min-h-0 with no margins → terminal can take full height.
    if (pos === 'both') return parentHeight;

    // 'chat'/'activity': terminal shares a flex-col with ContentCard/ActivityCard.
    // Card top margin (10px) is irreducible in flexbox — occupies space even when
    // the card's content area shrinks to 0. Bottom margin is 0 (handle provides gap).
    return parentHeight - CONTENT_CARD.margin;
  }, []);

  // Direct DOM refs for activity column resize.
  // cardsRowRef measures the flex container that holds both columns.
  // activityWrapperRef targets the activity column for direct DOM width updates.
  const cardsRowRef = useRef<HTMLDivElement>(null);
  const activityWrapperRef = useRef<HTMLDivElement>(null);

  // ResizeHandle calls onDrag → sets style.width directly at 60fps, no re-renders.
  // Store commit happens once on mouseup.
  const handleActivityDrag = useCallback((width: number): void => {
    const el = activityWrapperRef.current;
    if (el) {
      el.style.width = `${String(width)}px`;
    }
  }, []);

  // Dynamic max constraint for activity resize — the sole width cap for the
  // activity panel. Ensures the chat panel never shrinks below CHAT_PANEL.MIN_WIDTH
  // (400px) regardless of window size. On a big monitor the activity can grow wider;
  // on a small monitor it gets less room — but the chat floor is always 400px.
  const getActivityMax = useCallback((): number => {
    const row = cardsRowRef.current;
    if (!row) return PANEL_SIZES.review.default;
    return row.clientWidth - CHAT_PANEL.MIN_WIDTH - CONTENT_CARD.gap;
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
      <PierreProvider>
        <TauriProvider>
          <TooltipProvider delayDuration={0}>
            <AppShell
              sidebar={<PrimarySidebar />}
              resizeHandle={<SidebarResizeHandle />}
              sidebarWidth={effectiveSidebarWidth}
              lastExpandedSidebarWidth={lastExpandedSidebarWidth}
              actionsBar={rightSidebarOpen && !isWelcome ? <ActionsBar /> : undefined}
              transitionOverride={launchTransitionOverride}
            >
              {/* Main content wrapper — flex column for cards row + full-width terminal.
                overflow-hidden clips the activity panel's slide animation (previously
                on the activity wrapper, but that blocked terminal height transitions). */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                {/* Cards row — content column + activity column side by side */}
                <div ref={cardsRowRef} className="flex-1 flex min-h-0">
                  {/* ── Content column ── */}
                  {/* flex-col: ContentCard on top, terminal below when position='chat' */}
                  {/* min-width prevents flexbox from crushing the chat area when the
                    activity panel is wide or the window is narrow. */}
                  <div
                    className="flex-1 flex flex-col min-h-0"
                    style={{ minWidth: CHAT_PANEL.MIN_WIDTH }}
                  >
                    {/* Main content card — takes remaining vertical space */}
                    <ContentCard
                      sidebarOpen={sidebarOpen}
                      actionsBarOpen={activityOpen || rightSidebarOpen ? !isWelcome : false}
                      isFullscreen={isFullscreen}
                      terminalBelow={terminalChatOpen || terminalBothOpen}
                      transitionOverride={launchTransitionOverride}
                    >
                      {/* Welcome background image — inside the card.
                          During launch sequence: opacity animates 0→1 with wallpaper easing.
                          transitionend on wallpaper div triggers next phase (with runId guard). */}
                      {isWelcome ? (
                        <>
                          <div
                            className="absolute inset-0 bg-cover bg-center bg-no-repeat rounded-[inherit]"
                            style={{
                              backgroundImage: `url(${welcomeBg})`,
                              opacity: launchPhase === 'idle' ? 0 : 1,
                              transition: isLaunchAnimating ? WALLPAPER_TRANSITION : undefined,
                            }}
                            onTransitionEnd={handleWallpaperTransitionEnd}
                            aria-hidden="true"
                          />
                          {/* Paired Elements Rule: overlay shares same opacity + transition */}
                          <div
                            className="absolute inset-0 hidden dark:block bg-linear-to-t from-gray-3/80 via-gray-3/55 to-gray-3/35 rounded-[inherit]"
                            style={{
                              opacity: launchPhase === 'idle' ? 0 : 1,
                              transition: isLaunchAnimating ? WALLPAPER_TRANSITION : undefined,
                            }}
                            aria-hidden="true"
                          />
                        </>
                      ) : null}

                      {/* ContentTopBar — follows the chat area.
                        In editor mode the chat moves to ActivityCard, so the header goes with it. */}
                      {activeTab !== 'editor' ? (
                        <ContentTopBar
                          sidebarOpen={sidebarOpen}
                          transparent={isWelcome}
                          className="relative z-10"
                        />
                      ) : null}

                      {/* Mode content — wrapped in relative container so gradient overlays scroll area.
                          overflow-clip (not overflow-hidden) prevents ProseMirror's scrollIntoView()
                          from programmatically scrolling this container via scrollTop — overflow:hidden
                          allows programmatic scrolling even without a scrollbar. */}
                      <div className="flex-1 min-h-0 overflow-clip relative z-0">
                        {/* Gradient fade below header — follows the chat area (skipped in editor mode and vault) */}
                        {!isWelcome && activeTab !== 'editor' && !vaultOpen ? (
                          <div
                            className="absolute inset-x-0 top-0 h-8 z-10 pointer-events-none"
                            style={{
                              background:
                                'linear-gradient(to bottom, var(--chat-area), transparent)',
                            }}
                            aria-hidden="true"
                          />
                        ) : null}
                        {isWelcome ? (
                          <WelcomePage
                            showAscii={showAscii}
                            onAsciiAnimationComplete={handleAsciiComplete}
                            deferToast={deferToast}
                          />
                        ) : (
                          <>
                            {/* Agent mode - mounted on first visit, kept alive */}
                            {mounted.agent ? (
                              <div
                                className="h-full w-full"
                                style={
                                  activeTab === 'agent' ? STYLE_DISPLAY_BLOCK : STYLE_DISPLAY_NONE
                                }
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
                                style={
                                  activeTab === 'canvas' ? STYLE_DISPLAY_BLOCK : STYLE_DISPLAY_NONE
                                }
                              >
                                <ErrorBoundary
                                  fallback={(error, reset) => (
                                    <ModeErrorFallback
                                      mode="canvas"
                                      error={error}
                                      onReset={reset}
                                    />
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
                                style={
                                  activeTab === 'editor' ? STYLE_DISPLAY_BLOCK : STYLE_DISPLAY_NONE
                                }
                              >
                                <ErrorBoundary
                                  fallback={(error, reset) => (
                                    <ModeErrorFallback
                                      mode="editor"
                                      error={error}
                                      onReset={reset}
                                    />
                                  )}
                                >
                                  <EditorMode />
                                </ErrorBoundary>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>

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
                      <Toaster position="bottom-right" offset={46} expand />
                    </ContentCard>

                    {/* Terminal in 'chat' position — below ContentCard in same column */}
                    <div ref={terminalChatRef} style={terminalChatStyle}>
                      <div className="h-full flex flex-col">
                        <ResizeHandle
                          direction="horizontal"
                          target="bottom"
                          borderless
                          size={CONTENT_CARD.gap}
                          onDrag={handleTerminalDrag}
                          getMax={getTerminalMax}
                          onDragEnd={handleTerminalDragEnd}
                        />
                        <TerminalCard
                          position="chat"
                          sidebarOpen={sidebarOpen}
                          actionsBarOpen={activityOpen || rightSidebarOpen ? !isWelcome : false}
                          isFullscreen={isFullscreen}
                        >
                          {terminalPosition === 'chat' ? (
                            <TerminalPanelBoth variant="full-width" collapsed={terminalCollapsed} />
                          ) : null}
                        </TerminalCard>
                      </div>
                    </div>
                  </div>

                  {/* ── Activity column ── */}
                  {/* Slides in/out via negative marginRight (sidebar pattern). */}
                  {/* flex-row: ResizeHandle spans full height, column content beside it. */}
                  <div ref={activityWrapperRef} style={activityWrapperStyle}>
                    <div className="h-full flex">
                      {/* Vertical resize handle — spans full activity column height (card + terminal) */}
                      <ResizeHandle
                        direction="vertical"
                        target="review"
                        borderless
                        size={CONTENT_CARD.gap}
                        onDrag={handleActivityDrag}
                        getMax={getActivityMax}
                      />

                      {/* Activity card + terminal stacked vertically */}
                      <div className="flex-1 flex flex-col min-w-0 min-h-0">
                        <ActivityCard
                          actionsBarOpen={rightSidebarOpen}
                          isFullscreen={isFullscreen}
                          terminalBelow={terminalActivityOpen || terminalBothOpen}
                        >
                          {activeTab === 'editor' ? (
                            <EditorChatPanel />
                          ) : (
                            <ActivityPanel canManageBrowser />
                          )}
                        </ActivityCard>

                        {/* Terminal in 'activity' position — below ActivityCard in same column */}
                        <div ref={terminalActivityRef} style={terminalActivityStyle}>
                          <div className="h-full flex flex-col">
                            <ResizeHandle
                              direction="horizontal"
                              target="bottom"
                              borderless
                              size={CONTENT_CARD.gap}
                              onDrag={handleTerminalDrag}
                              getMax={getTerminalMax}
                              onDragEnd={handleTerminalDragEnd}
                            />
                            <TerminalCard
                              position="activity"
                              sidebarOpen={false}
                              actionsBarOpen={rightSidebarOpen}
                              isFullscreen={isFullscreen}
                            >
                              {terminalPosition === 'activity' ? (
                                <TerminalPanelBoth
                                  variant="full-width"
                                  collapsed={terminalCollapsed}
                                />
                              ) : null}
                            </TerminalCard>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Terminal in 'both' position — full width below the cards row */}
                <div ref={terminalBothRef} style={terminalBothStyle}>
                  <div className="h-full flex flex-col">
                    <ResizeHandle
                      direction="horizontal"
                      target="bottom"
                      borderless
                      size={CONTENT_CARD.gap}
                      onDrag={handleTerminalDrag}
                      getMax={getTerminalMax}
                      onDragEnd={handleTerminalDragEnd}
                    />
                    <TerminalCard
                      position="both"
                      sidebarOpen={sidebarOpen}
                      actionsBarOpen={rightSidebarOpen}
                      isFullscreen={isFullscreen}
                    >
                      {terminalPosition === 'both' ? (
                        <TerminalPanelBoth variant="full-width" collapsed={terminalCollapsed} />
                      ) : null}
                    </TerminalCard>
                  </div>
                </div>
              </div>
            </AppShell>
          </TooltipProvider>
        </TauriProvider>
      </PierreProvider>
    </ThemeProvider>
  );
};

export default App;
