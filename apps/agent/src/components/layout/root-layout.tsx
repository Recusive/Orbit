import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { ActionsBar } from './actions-bar';
import { ChatArea } from './chat-area';
import { PrimarySidebar } from './primary-sidebar';
import { SidebarResizeHandle } from './sidebar-resize-handle';

import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { GoToLineDialog, QuickOpen } from '@/components/modals';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useDefaultKeyboardShortcuts } from '@/hooks/ui/use-keyboard-shortcuts';
import { useLeftSidebarWidth, useUIStore } from '@/stores/ui/ui-store';

/**
 * RootLayout is the Agent mode content.
 * Renders the sidebar, chat area, and actions bar.
 * HeaderBar and StatusBar are rendered by App.tsx.
 *
 * PERF: Uses granular selectors to prevent full-tree re-renders.
 * leftSidebarWidth is isolated so sidebar animation only re-renders
 * PrimarySidebar — not ChatArea, Terminal, Browser, etc.
 */
export const RootLayout: FC = () => {
  // Granular data selectors — only re-render when THESE specific values change
  const leftSidebarWidth = useLeftSidebarWidth();
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);
  const goToLineDialogOpen = useUIStore((s) => s.goToLineDialogOpen);
  const chatAreaDetached = useUIStore((s) => s.chatAreaDetached);

  // Actions via useShallow — stable references, no spurious re-renders
  const {
    setGoToLineDialogOpen,
    toggleLeftSidebar,
    toggleReviewPanel,
    toggleBottomPanel,
    setTerminalPosition,
    openSettings,
    openSourceControl,
  } = useUIStore(
    useShallow((s) => ({
      setGoToLineDialogOpen: s.setGoToLineDialogOpen,
      toggleLeftSidebar: s.toggleLeftSidebar,
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

  // Smart terminal toggle: if activity panel is closed, open terminal in full-width mode
  // PERF: Reads reviewPanelOpen/bottomPanelOpen from getState() instead of subscribing.
  // These values are only needed at callback-invocation time, not for rendering.
  const handleToggleTerminal = useCallback((): void => {
    const { reviewPanelOpen, bottomPanelOpen } = useUIStore.getState();
    if (!reviewPanelOpen && !bottomPanelOpen) {
      // Activity panel is closed and terminal is closed - open in full-width mode
      setTerminalPosition('both');
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
    window.addEventListener('toggleLeftSidebar', toggleLeftSidebar);
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
      window.removeEventListener('toggleLeftSidebar', toggleLeftSidebar);
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
    toggleLeftSidebar,
    toggleReviewPanel,
    handleToggleFileBrowser,
    handleToggleTerminal,
    openSourceControl,
    handleFindInWorkspace,
    handleOpenSettings,
  ]);

  return (
    <div className="h-full w-full flex overflow-hidden text-foreground">
      {/* Primary Sidebar - File explorer, conversations */}
      <PrimarySidebar width={leftSidebarWidth} />

      {/* Sidebar resize handle */}
      <SidebarResizeHandle />

      {/* Chat Area - Main chat interface with Activity panel */}
      {/* Hidden when detached (e.g., canvas expanded view uses its own ChatArea) */}
      {!chatAreaDetached ? <ChatArea /> : null}

      {/* Actions Bar - Activity Panel tab switcher */}
      {/* Also hidden when ChatArea is detached to prevent orphaned controls */}
      {rightSidebarOpen && !chatAreaDetached ? <ActionsBar /> : null}

      {/* Quick Open Dialog */}
      <QuickOpen open={quickOpenVisible} onOpenChange={setQuickOpenVisible} />

      {/* Go to Line Dialog */}
      <GoToLineDialog open={goToLineDialogOpen} onOpenChange={setGoToLineDialogOpen} />
    </div>
  );
};
