import { useCallback, useEffect, useState } from 'react';

import { ChatArea } from './chat-area';
import { PrimarySidebar } from './primary-sidebar';
import { SecondaryPanel } from './secondary-panel';
import { StatusBar } from './status-bar';

import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { QuickOpen } from '@/components/quick-open';
import { useDefaultKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useTauri } from '@/hooks/use-tauri';
import { useUIStore } from '@/stores/ui-store';

export const RootLayout: FC = () => {
  const { leftSidebarWidth, rightSidebarOpen } = useUIStore();

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

    return (): void => {
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette);
      window.removeEventListener('quickOpenFile', handleQuickOpenFile);
    };
  }, [handleOpenCommandPalette, handleQuickOpenFile]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background text-foreground">
      <div className="flex-1 flex min-h-0">
        {/* Primary Sidebar - File explorer, conversations */}
        <PrimarySidebar width={leftSidebarWidth} />

        {/* Chat Area - Main chat interface with Activity panel */}
        <ChatArea />

        {/* Secondary Panel - Sessions list */}
        {rightSidebarOpen ? <SecondaryPanel /> : null}
      </div>

      {/* Status Bar - Git branch, sync status */}
      <StatusBar />

      {/* Quick Open Dialog */}
      <QuickOpen open={quickOpenVisible} onOpenChange={setQuickOpenVisible} />
    </div>
  );
};
