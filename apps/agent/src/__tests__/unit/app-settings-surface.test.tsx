import { render, screen } from '@testing-library/react';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import App from '@/App';
import { useUIStore } from '@/stores/ui/ui-store';

vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock('@canvas/CanvasApp', () => ({
  CanvasApp: () => <div data-testid="canvas-mode" />,
}));

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

vi.mock('@/components/modals/settings/components', () => ({
  SettingsSkeleton: () => <div data-testid="settings-skeleton" />,
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

vi.mock('@/hooks/browser/use-browser', () => ({
  useBrowser: (): void => {
    /* noop */
  },
}));

vi.mock('@/hooks/core/use-auto-update', () => ({
  useAutoUpdate: (): void => {
    /* noop */
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

vi.mock('@/hooks/opencode/use-opencode-lifecycle', () => ({
  useOpencodeLifecycle: (): void => {
    /* noop */
  },
}));

vi.mock('@/hooks/ui/use-fullscreen', () => ({
  useFullscreen: () => false,
}));

vi.mock('@/hooks/ui/use-traffic-lights', () => ({
  useTrafficLights: (): void => {
    /* noop */
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

describe('App settings surface', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.setState({
      workspacePath: '/repo',
      workspaceName: 'repo',
      settingsOpen: true,
    });
  });

  it('renders the settings page over editor mode without switching tabs', async () => {
    useUIStore.setState({ activeTab: 'editor' });

    render(<App />);

    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('editor-mode')).toBeInTheDocument();
    expect(useUIStore.getState().activeTab).toBe('editor');
  });

  it('renders the settings page over canvas mode without switching tabs', async () => {
    useUIStore.setState({ activeTab: 'canvas' });

    render(<App />);

    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-mode')).toBeInTheDocument();
    expect(useUIStore.getState().activeTab).toBe('canvas');
  });
});
