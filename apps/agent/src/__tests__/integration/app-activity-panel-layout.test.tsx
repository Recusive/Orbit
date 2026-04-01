import { act, render, waitFor } from '@testing-library/react';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import App from '@/App';
import { PANEL_SIZES, SIDEBAR } from '@/lib/utils/constants';
import { useUIStore } from '@/stores/ui/ui-store';

const resizeObservers: ControlledResizeObserver[] = [];

class ControlledResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(): void {
    // No-op for tests
  }

  disconnect(): void {
    // No-op for tests
  }

  emit(width: number): void {
    if (!this.target) {
      throw new Error('ResizeObserver target is not attached');
    }

    const entry = {
      target: this.target,
      contentRect: {
        width,
        height: 0,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: width,
        toJSON: () => ({ width }),
      },
      borderBoxSize: [{ blockSize: 0, inlineSize: width }],
      contentBoxSize: [{ blockSize: 0, inlineSize: width }],
      devicePixelContentBoxSize: [{ blockSize: 0, inlineSize: width }],
    } as ResizeObserverEntry;

    this.callback([entry], this as unknown as ResizeObserver);
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ControlledResizeObserver,
  writable: true,
});

vi.mock('@editor/EditorApp', () => ({
  EditorApp: () => <div data-testid="editor-mode" />,
}));

vi.mock('@editor/components/EditorChatPanel', () => ({
  EditorChatPanel: () => <div data-testid="editor-chat-panel" />,
}));

vi.mock('@/components/layout/actions-bar', () => ({
  ActionsBar: () => <div data-testid="actions-bar" />,
}));

vi.mock('@/components/layout/activity-card', () => ({
  ActivityCard: ({ children }: { children: ReactNode }) => (
    <div data-testid="activity-card">{children}</div>
  ),
}));

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) => (
    <div data-testid="app-shell">
      <div data-testid="app-shell-sidebar">{sidebar}</div>
      <div data-testid="app-shell-content">{children}</div>
    </div>
  ),
}));

vi.mock('@/components/layout/content-card', () => ({
  ContentCard: ({ children }: { children: ReactNode }) => (
    <div data-testid="content-card">{children}</div>
  ),
}));

vi.mock('@/components/layout/content-top-bar', () => ({
  ContentTopBar: () => <div data-testid="content-top-bar" />,
}));

vi.mock('@/components/layout/primary-sidebar', () => ({
  PrimarySidebar: () => <div data-testid="primary-sidebar" />,
}));

vi.mock('@/components/layout/resize-handle', () => ({
  ResizeHandle: () => null,
}));

vi.mock('@/components/layout/root-layout', () => ({
  RootLayout: () => <div data-testid="agent-mode" />,
}));

vi.mock('@/components/layout/sidebar-resize-handle', () => ({
  SidebarResizeHandle: () => null,
}));

vi.mock('@/components/layout/terminal-card', () => ({
  TerminalCard: ({ children }: { children: ReactNode }) => (
    <div data-testid="terminal-card">{children}</div>
  ),
}));

vi.mock('@/components/modals', () => ({
  CrashNotification: () => null,
}));

vi.mock('@/components/modals/settings/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="settings-page" />,
}));

vi.mock('@/components/onboarding', () => ({
  OnboardingFlow: () => <div data-testid="onboarding-flow" />,
}));

vi.mock('@/components/panels', () => ({
  ActivityPanel: () => <div data-testid="activity-panel" />,
}));

vi.mock('@/components/shared', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/welcome', () => ({
  WelcomePage: () => <div data-testid="welcome-page" />,
}));

vi.mock('@/demo/conversation-playback', () => ({
  isDemoConversationView: () => false,
  startDemoConversation: () => undefined,
}));

vi.mock('@/hooks/agent/use-tauri-mock', () => ({
  MOCK_ROOT: '/demo',
  getMockFileContent: () => '',
}));

vi.mock('@/hooks/browser/use-browser', () => ({
  useBrowser: (): void => {
    // No-op in tests
  },
}));

vi.mock('@/hooks/core/use-auto-update', () => ({
  useAutoUpdate: (): void => {
    // No-op in tests
  },
}));

vi.mock('@/hooks/core/use-crash-check', () => ({
  useCrashCheck: () => ({
    hasCrash: false,
    crashLog: null,
    dismiss: vi.fn(),
    acknowledge: vi.fn(),
  }),
}));

vi.mock('@/hooks/core/use-preload-sf-symbols', () => ({
  usePreloadSFSymbols: (): void => {
    // No-op in tests
  },
}));

vi.mock('@/hooks/ui/use-fullscreen', () => ({
  useFullscreen: () => false,
}));

vi.mock('@/hooks/ui/use-traffic-lights', () => ({
  useTrafficLights: (): void => {
    // No-op in tests
  },
}));

vi.mock('@/lib/navigation', () => ({
  destroyNavigationTracker: (): void => {
    // No-op in tests
  },
  initNavigationTracker: (): void => {
    // No-op in tests
  },
}));

vi.mock('@/providers/pierre-provider', () => ({
  PierreProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/providers/tauri-provider', () => ({
  TauriProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/providers/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/stores/onboarding/onboarding-store', () => ({
  useOnboardingStore: (selector: (state: { hasCompletedOnboarding: boolean }) => unknown) =>
    selector({ hasCompletedOnboarding: true }),
}));

vi.mock('@/stores/ui/launch-sequence-store', () => {
  const state = {
    phase: 'complete',
    isActive: false,
    runId: 1,
    startSequence: vi.fn(),
    skipToComplete: vi.fn(),
    reset: vi.fn(),
  };

  return {
    useLaunchSequenceStore: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

vi.mock('@/stores/ui/welcome-animation-store', () => ({
  selectEnableLaunchAnimation: (): boolean => false,
  useWelcomeAnimationStore: (selector: (state: { enableLaunchAnimation: boolean }) => unknown) =>
    selector({ enableLaunchAnimation: false }),
}));

function resetStore(): void {
  useUIStore.setState(useUIStore.getInitialState(), true);
}

function renderWorkspaceApp(overrides: Partial<ReturnType<typeof useUIStore.getState>> = {}): void {
  useUIStore.setState({
    workspacePath: '/repo',
    workspaceName: 'repo',
    repoRootPath: '/repo',
    ...overrides,
  });

  render(<App />);
}

function getCardsRowObserver(): ControlledResizeObserver {
  const observer = resizeObservers[0];
  if (!observer) {
    throw new Error('Expected App to attach a ResizeObserver for the cards row');
  }
  return observer;
}

describe('App activity panel layout', () => {
  beforeEach(() => {
    resetStore();
    resizeObservers.length = 0;
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      writable: true,
      configurable: true,
    });
  });

  it('clamps the activity panel when the cards row shrinks', async () => {
    renderWorkspaceApp({
      leftSidebarWidth: SIDEBAR.collapsed,
      rightSidebarOpen: false,
      reviewPanelOpen: true,
      reviewPanelWidth: 560,
    });

    act(() => {
      getCardsRowObserver().emit(820);
    });

    await waitFor(() => {
      expect(useUIStore.getState().reviewPanelWidth).toBe(416);
    });
  });

  it('falls back to collapsing the sidebar when chat and activity minima cannot fit', async () => {
    renderWorkspaceApp({
      leftSidebarWidth: SIDEBAR.expanded,
      rightSidebarOpen: true,
      reviewPanelOpen: true,
      reviewPanelWidth: 420,
    });

    act(() => {
      getCardsRowObserver().emit(680);
    });

    await waitFor(() => {
      const state = useUIStore.getState();
      expect(state.reviewPanelWidth).toBe(PANEL_SIZES.review.min);
      expect(state.leftSidebarWidth).toBe(SIDEBAR.collapsed);
      expect(state.rightSidebarOpen).toBe(true);
    });
  });

  it('shrinks the activity panel on window resize before collapsing the sidebar', async () => {
    renderWorkspaceApp({
      leftSidebarWidth: SIDEBAR.expanded,
      rightSidebarOpen: false,
      reviewPanelOpen: true,
      reviewPanelWidth: 500,
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 1100,
      writable: true,
      configurable: true,
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      const state = useUIStore.getState();
      expect(state.reviewPanelWidth).toBe(440);
      expect(state.leftSidebarWidth).toBe(SIDEBAR.expanded);
    });
  });
});
