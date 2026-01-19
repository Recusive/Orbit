/**
 * CanvasRootLayout - Main layout for the Canvas UI Builder
 *
 * Mirrors the Agent app layout structure but with:
 * - Left sidebar (navigation, files)
 * - Center canvas area with input box
 * - Right sidebar (properties, layers)
 * - No activity panel, terminal, or editor
 */
import { CanvasInputArea } from './canvas-input';
import { CanvasPreview } from './canvas-preview';
import { CanvasLeftSidebar } from './left-sidebar';
import { LeftResizeHandle, RightResizeHandle } from './resize-handles';
import { CanvasRightSidebar } from './right-sidebar';

import type { FC } from 'react';

import { useUIStore } from '@/stores/ui/ui-store';

/**
 * CanvasRootLayout is the Canvas mode content.
 * Renders left sidebar, canvas area with input, and right sidebar.
 * HeaderBar and StatusBar are rendered by App.tsx.
 */
export const CanvasRootLayout: FC = () => {
  const leftSidebarWidth = useUIStore((state) => state.leftSidebarWidth);
  const canvasRightSidebarWidth = useUIStore((state) => state.canvasRightSidebarWidth);

  return (
    <div className="h-full w-full flex overflow-hidden bg-background text-foreground">
      {/* Left Sidebar - Navigation, files, sessions */}
      <CanvasLeftSidebar width={leftSidebarWidth} />

      {/* Left Sidebar resize handle */}
      <LeftResizeHandle />

      {/* Canvas Area - Main design canvas with input */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-chat-area">
        {/* Preview iframe */}
        <CanvasPreview />

        {/* Input Box - Same as Agent */}
        <CanvasInputArea />
      </div>

      {/* Right Sidebar resize handle */}
      <RightResizeHandle />

      {/* Right Sidebar - Properties, layers, components */}
      <CanvasRightSidebar width={canvasRightSidebarWidth} />
    </div>
  );
};
