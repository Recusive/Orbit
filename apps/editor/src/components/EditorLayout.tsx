/**
 * EditorLayout - Main layout orchestrator for VS Code-style editor
 *
 * Layout structure:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Editor      │    EditorArea (65%)   │ ChatPanel (35%)       │
 * │ Sidebar     │    [CodeMirror tabs]  │ [Chat messages]       │
 * │ (260px)     │    [Editor content]   │ [Chat input]          │
 * │ Explorer+Git│    [Terminal]         │                       │
 * └─────────────────────────────────────────────────────────────┘
 */
import { useEffect, useState } from 'react';

import { EditorCenter } from './EditorCenter';
import { EditorChatPanel } from './EditorChatPanel';
import { EditorSidebar } from './EditorSidebar';

import type { FC } from 'react';

import { SidebarResizeHandle } from '@/components/layout';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useUIStore } from '@/stores/ui/ui-store';

// Editor-specific constants
const EDITOR_PANEL = {
  CHAT_PANEL_WIDTH: '35%',
  CHAT_PANEL_MIN_WIDTH: 300,
  EDITOR_AREA_MIN_WIDTH: 400,
} as const;

export const EditorLayout: FC = () => {
  // Sidebar width from UIStore (shared with Agent mode)
  // Must pass width directly like Agent does - SidebarResizeHandle manipulates DOM directly
  const leftSidebarWidth = useUIStore((state) => state.leftSidebarWidth);

  // Local state for chat panel visibility
  const [chatPanelOpen, setChatPanelOpen] = useState(true);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd+B to toggle chat panel
      if (e.metaKey && e.key === 'b') {
        e.preventDefault();
        setChatPanelOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="h-full w-full flex overflow-hidden bg-background">
      {/* Left Sidebar - File Explorer + Git */}
      {/* Note: Uses data-sidebar="primary" so SidebarResizeHandle can find it */}
      <EditorSidebar width={leftSidebarWidth} />

      {/* Sidebar Resize Handle - manages width via UIStore */}
      <SidebarResizeHandle />

      {/* Main content area - Editor + Chat Panel */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0">
        {/* Editor Center - Tabs + CodeMirror + Terminal */}
        <ResizablePanel
          preferredSize={chatPanelOpen ? '65%' : '100%'}
          minSize={EDITOR_PANEL.EDITOR_AREA_MIN_WIDTH}
        >
          <EditorCenter />
        </ResizablePanel>

        {/* Chat Panel - AI assistant */}
        <ResizablePanel
          preferredSize={EDITOR_PANEL.CHAT_PANEL_WIDTH}
          minSize={EDITOR_PANEL.CHAT_PANEL_MIN_WIDTH}
          visible={chatPanelOpen}
        >
          <EditorChatPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
