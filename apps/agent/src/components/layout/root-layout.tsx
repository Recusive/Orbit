import { useCallback, useEffect, useState } from 'react';

import { ActionsBar } from './actions-bar';
import { ChatArea } from './chat-area';
import { HeaderBar } from './header-bar';
import { PrimarySidebar } from './primary-sidebar';
import { StatusBar } from './status-bar';

import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { GoToLineDialog, QuickOpen } from '@/components/modals';
import { WelcomePage } from '@/components/welcome';
import { useDefaultKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useTauri } from '@/hooks/use-tauri';
import { useHasWorkspace, useUIStore } from '@/stores/ui-store';

export const RootLayout: FC = () => {
  const {
    leftSidebarWidth,
    rightSidebarOpen,
    goToLineDialogOpen,
    setGoToLineDialogOpen,
    toggleLeftSidebar,
    openSettings,
  } = useUIStore();
  const hasWorkspace = useHasWorkspace();

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

  // Handle messages from Orbit extension (including panel:command)
  const handleExtensionMessage = useCallback((message: ExtensionMessage): void => {
    if (message.type === 'panel:command') {
      // Handle panel commands
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Future extensibility
      if (message.command === 'quick-open') {
        setQuickOpenVisible(true);
      }
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
    window.addEventListener('openSettings', handleOpenSettings);

    return (): void => {
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette);
      window.removeEventListener('quickOpenFile', handleQuickOpenFile);
      window.removeEventListener('goToLine', handleGoToLine);
      window.removeEventListener('toggleLeftSidebar', toggleLeftSidebar);
      window.removeEventListener('openSettings', handleOpenSettings);
    };
  }, [
    handleOpenCommandPalette,
    handleQuickOpenFile,
    handleGoToLine,
    toggleLeftSidebar,
    handleOpenSettings,
  ]);

  // Show welcome page when no workspace is open
  if (!hasWorkspace) {
    return (
      <div className="h-full w-full flex flex-col overflow-hidden bg-background text-foreground">
        {/* Header Bar - minimal, no tabs */}
        <HeaderBar />

        {/* Welcome Page - centered content */}
        <div className="flex-1 min-h-0">
          <WelcomePage />
        </div>

        {/* Status Bar */}
        <StatusBar />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background text-foreground">
      {/* Header Bar - Workspace info, quick actions */}
      <HeaderBar />

      <div className="flex-1 flex min-h-0">
        {/* Primary Sidebar - File explorer, conversations */}
        <PrimarySidebar width={leftSidebarWidth} />

        {/* Chat Area - Main chat interface with Activity panel */}
        <ChatArea />

        {/* Actions Bar - Activity Panel tab switcher */}
        {rightSidebarOpen ? <ActionsBar /> : null}
      </div>

      {/* Status Bar - Git branch, sync status */}
      <StatusBar />

      {/* Quick Open Dialog */}
      <QuickOpen open={quickOpenVisible} onOpenChange={setQuickOpenVisible} />

      {/* Go to Line Dialog */}
      <GoToLineDialog open={goToLineDialogOpen} onOpenChange={setGoToLineDialogOpen} />
    </div>
  );
};
