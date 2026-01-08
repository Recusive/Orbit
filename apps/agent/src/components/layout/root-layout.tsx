import { useCallback, useEffect, useState } from 'react';

import { ActionsBar } from './actions-bar';
import { ChatArea } from './chat-area';
import { PrimarySidebar } from './primary-sidebar';
import { SidebarResizeHandle } from './sidebar-resize-handle';

import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { GoToLineDialog, QuickOpen } from '@/components/modals';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useDefaultKeyboardShortcuts } from '@/hooks/ui/use-keyboard-shortcuts';
import { useUIStore } from '@/stores/ui/ui-store';

/**
 * RootLayout is the Agent mode content.
 * Renders the sidebar, chat area, and actions bar.
 * HeaderBar and StatusBar are rendered by App.tsx.
 */
export const RootLayout: FC = () => {
  const {
    leftSidebarWidth,
    rightSidebarOpen,
    goToLineDialogOpen,
    setGoToLineDialogOpen,
    toggleLeftSidebar,
    openSettings,
  } = useUIStore();

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

  return (
    <div className="h-full w-full flex overflow-hidden bg-background text-foreground">
      {/* Primary Sidebar - File explorer, conversations */}
      <PrimarySidebar width={leftSidebarWidth} />

      {/* Sidebar resize handle */}
      <SidebarResizeHandle />

      {/* Chat Area - Main chat interface with Activity panel */}
      <ChatArea />

      {/* Actions Bar - Activity Panel tab switcher */}
      {rightSidebarOpen ? <ActionsBar /> : null}

      {/* Quick Open Dialog */}
      <QuickOpen open={quickOpenVisible} onOpenChange={setQuickOpenVisible} />

      {/* Go to Line Dialog */}
      <GoToLineDialog open={goToLineDialogOpen} onOpenChange={setGoToLineDialogOpen} />
    </div>
  );
};
