/**
 * CanvasRootLayout - Main layout for the Canvas UI Builder
 *
 * Mirrors the Agent app layout structure but with:
 * - Left sidebar (navigation, files)
 * - Center canvas area with input box
 * - Right sidebar (properties, layers)
 * - No activity panel, terminal, or editor
 */
import { useCallback, useState } from 'react';

import { CanvasInputArea } from './canvas-input';
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

  // Selected component name for preview
  const [selectedComponentName, setSelectedComponentName] = useState<string | null>(null);

  // Handle component selection from sidebar
  const handleComponentSelect = useCallback((componentName: string) => {
    setSelectedComponentName(componentName);
  }, []);

  return (
    <div className="h-full w-full flex overflow-hidden bg-background text-foreground">
      {/* Left Sidebar - Navigation, files, sessions */}
      <CanvasLeftSidebar width={leftSidebarWidth} onComponentSelect={handleComponentSelect} />

      {/* Left Sidebar resize handle */}
      <LeftResizeHandle />

      {/* Canvas Area - Main design canvas with input */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-chat-area">
        {/* Component Preview - Will connect to ~/.orbit/canvas */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
          <div
            className="relative rounded-lg border border-border/40 overflow-hidden flex items-center justify-center bg-muted/30"
            style={{ width: '100%', height: '100%', maxWidth: '800px', maxHeight: '600px' }}
          >
            <div className="text-center text-muted-foreground p-8">
              <p className="text-lg font-medium mb-2">Preview will load from ~/.orbit/canvas</p>
              <p className="text-sm opacity-70">
                {selectedComponentName
                  ? `Selected: ${selectedComponentName}`
                  : 'Select a component from the sidebar'}
              </p>
            </div>
          </div>
        </div>

        {/* Input Box - Same as Agent */}
        <CanvasInputArea />
      </div>

      {/* Right Sidebar resize handle */}
      <RightResizeHandle />

      {/* Right Sidebar - Properties, layers, components */}
      <CanvasRightSidebar
        width={canvasRightSidebarWidth}
        selectedComponentName={selectedComponentName}
      />
    </div>
  );
};
