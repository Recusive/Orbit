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
import { useEditorChatPanelOpen, useUIStore } from '@/stores/ui/ui-store';

// Editor-specific constants
const EDITOR_PANEL = {
  CHAT_PANEL_WIDTH: '35%',
  CHAT_PANEL_MIN_WIDTH: 400,
  EDITOR_AREA_MIN_WIDTH: 400,
} as const;

export const EditorLayout: FC = () => {
  // Sidebar width from UIStore (shared with Agent mode)
  // Must pass width directly like Agent does - SidebarResizeHandle manipulates DOM directly
  const leftSidebarWidth = useUIStore((state) => state.leftSidebarWidth);

  // Chat panel visibility from UIStore (persisted across mode switches)
  const chatPanelOpen = useEditorChatPanelOpen();
  const toggleEditorChatPanel = useUIStore((state) => state.toggleEditorChatPanel);

  // Suppress initial visibility for two frames so nested Allotment instances
  // (position:absolute panes) can calculate panel sizes before painting.
  // Frame 1: outer ResizablePanelGroup (horizontal) computes EditorCenter width
  // Frame 2: inner ResizablePanelGroup (vertical) computes content/terminal heights
  // Without this, EmptyState ("No file open") briefly appears at the top of the
  // editor area instead of centered, because the panel has no height yet.
  //
  // WHY 2 FRAMES (NOT ResizeObserver): This component uses lazy mounting via
  // display:none → display:block. A ResizeObserver fires when the *outer*
  // container gets non-zero size, but the *inner* nested ResizablePanelGroup
  // needs an additional layout pass to resolve child heights. The 2-frame RAF
  // correctly waits for both passes. ResizeObserver on the outer container
  // fires too early, causing the ghost flash the RAF approach prevents.
  // (Code review: Opus cycle 1, issue #13 — ResizeObserver reverted)
  const [mountReady, setMountReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        setMountReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd+B (Mac) / Ctrl+B (Windows/Linux) to toggle chat panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleEditorChatPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleEditorChatPanel]);

  return (
    <div
      className="h-full w-full flex overflow-hidden bg-background"
      style={{ opacity: mountReady ? 1 : 0 }}
    >
      {/* Left Sidebar - File Explorer + Git */}
      {/* Note: Uses data-sidebar="primary" so SidebarResizeHandle can find it */}
      <EditorSidebar width={leftSidebarWidth} />

      {/* Sidebar Resize Handle - manages width via UIStore */}
      <SidebarResizeHandle />

      {/* Main content area - Editor + Chat Panel */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0 bg-chat-area">
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
