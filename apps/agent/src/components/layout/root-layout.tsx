import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { ChatArea } from './chat-area';

import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { GoToLineDialog, QuickOpen } from '@/components/modals';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useGitPolling } from '@/hooks/git/use-git-polling';
import { useDefaultKeyboardShortcuts } from '@/hooks/ui/use-keyboard-shortcuts';
import { useUIStore } from '@/stores/ui/ui-store';

/**
 * RootLayout is the Agent mode content.
 * Renders the chat area, actions bar, and modals.
 * Sidebar is rendered by App.tsx/AppShell (global, all modes).
 * ContentTopBar and StatusBar are rendered by App.tsx.
 */
export const RootLayout: FC = () => {
  // Granular data selectors — only re-render when THESE specific values change
  const goToLineDialogOpen = useUIStore((s) => s.goToLineDialogOpen);
  const chatAreaDetached = useUIStore((s) => s.chatAreaDetached);

  // Actions via useShallow — stable references, no spurious re-renders
  const {
    setGoToLineDialogOpen,
    toggleReviewPanel,
    toggleBottomPanel,
    setTerminalPosition,
    openSettings,
    openSourceControl,
  } = useUIStore(
    useShallow((s) => ({
      setGoToLineDialogOpen: s.setGoToLineDialogOpen,
      toggleReviewPanel: s.toggleReviewPanel,
      toggleBottomPanel: s.toggleBottomPanel,
      setTerminalPosition: s.setTerminalPosition,
      openSettings: s.openSettings,
      openSourceControl: s.openSourceControl,
    }))
  );

  const [quickOpenVisible, setQuickOpenVisible] = useState(false);

  // Enable global keyboard shortcuts (Cmd+P, Cmd+K, etc.)
  useDefaultKeyboardShortcuts();

  // Start global git status polling (populates GitStore for file explorer badges, status bar, etc.)
  useGitPolling();

  // Handle keyboard shortcut events (from webview's own shortcuts)
  const handleOpenCommandPalette = useCallback((): void => {
    setQuickOpenVisible(true);
  }, []);

  const handleQuickOpenFile = useCallback((): void => {
    setQuickOpenVisible(true);
  }, []);

  const handleGoToLine = useCallback((): void => {
    setGoToLineDialogOpen(true);
  }, [setGoToLineDialogOpen]);

  const handleOpenSettings = useCallback((): void => {
    openSettings();
  }, [openSettings]);

  // Handle find in workspace - opens Quick Open for now.
  // NOTE: Quick Open serves as workspace search until a dedicated search panel is built.
  const handleFindInWorkspace = useCallback((): void => {
    setQuickOpenVisible(true);
  }, []);

  // Smart terminal toggle: if activity panel is closed and terminal is fully hidden,
  // open terminal in chat mode. Otherwise just toggle collapsed/expanded.
  // PERF: Reads state from getState() — only needed at callback-invocation time.
  const handleToggleTerminal = useCallback((): void => {
    const { reviewPanelOpen, bottomPanelOpen } = useUIStore.getState();
    if (!reviewPanelOpen && !bottomPanelOpen) {
      // Activity panel is closed and terminal is fully hidden - open in chat mode
      setTerminalPosition('chat');
    }
    toggleBottomPanel();
  }, [setTerminalPosition, toggleBottomPanel]);

  // Toggle editor panel in activity panel
  // If already open on 'file' tab, close it; otherwise open and switch to it
  const handleToggleFileBrowser = useCallback((): void => {
    const state = useUIStore.getState();
    if (state.reviewPanelOpen && state.activityTab === 'file') {
      // Already showing file tab - close the panel
      state.toggleReviewPanel();
    } else {
      // Not showing file tab or panel is closed - open and switch to file tab
      state.setActivityTab('file');
    }
  }, []);

  // Handle messages from Orbit extension (including panel:command)
  const handleExtensionMessage = useCallback((message: ExtensionMessage): void => {
    if (message.type === 'panel:command') {
      // Currently only 'quick-open' is supported - add switch when more commands are added
      setQuickOpenVisible(true);
    }
  }, []);

  // Listen to extension messages
  useTauri({ onMessage: handleExtensionMessage });

  // Listen for keyboard shortcut custom events
  useEffect(() => {
    window.addEventListener('openCommandPalette', handleOpenCommandPalette);
    window.addEventListener('quickOpenFile', handleQuickOpenFile);
    window.addEventListener('goToLine', handleGoToLine);
    window.addEventListener('toggleActivityPanel', toggleReviewPanel);
    window.addEventListener('toggleFileBrowser', handleToggleFileBrowser);
    window.addEventListener('toggleTerminal', handleToggleTerminal);
    window.addEventListener('openSourceControl', openSourceControl);
    window.addEventListener('findInWorkspace', handleFindInWorkspace);
    window.addEventListener('openSettings', handleOpenSettings);

    return (): void => {
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette);
      window.removeEventListener('quickOpenFile', handleQuickOpenFile);
      window.removeEventListener('goToLine', handleGoToLine);
      window.removeEventListener('toggleActivityPanel', toggleReviewPanel);
      window.removeEventListener('toggleFileBrowser', handleToggleFileBrowser);
      window.removeEventListener('toggleTerminal', handleToggleTerminal);
      window.removeEventListener('openSourceControl', openSourceControl);
      window.removeEventListener('findInWorkspace', handleFindInWorkspace);
      window.removeEventListener('openSettings', handleOpenSettings);
    };
  }, [
    handleOpenCommandPalette,
    handleQuickOpenFile,
    handleGoToLine,
    toggleReviewPanel,
    handleToggleFileBrowser,
    handleToggleTerminal,
    openSourceControl,
    handleFindInWorkspace,
    handleOpenSettings,
  ]);

  return (
    <div className="h-full w-full flex overflow-hidden text-foreground">
      {/* Chat Area - Main chat interface with Activity panel */}
      {/* Hidden when detached (e.g., canvas expanded view uses its own ChatArea) */}
      {!chatAreaDetached ? <ChatArea /> : null}

      {/* Quick Open Dialog */}
      <QuickOpen open={quickOpenVisible} onOpenChange={setQuickOpenVisible} />

      {/* Go to Line Dialog */}
      <GoToLineDialog open={goToLineDialogOpen} onOpenChange={setGoToLineDialogOpen} />
    </div>
  );
};
