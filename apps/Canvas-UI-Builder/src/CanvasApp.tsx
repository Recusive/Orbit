'use client';

import { ComponentsSidebar, PreviewPanel, PropertiesPanel } from './components';

import type { FC } from 'react';

import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

// ============================================
// Main Component
// ============================================

/**
 * Canvas UI Builder - A visual component builder with AI assistance.
 *
 * Layout:
 * - Left: Components sidebar with logo and collapsible categories
 * - Center: Preview canvas with drag-drop support and AI input
 * - Right: Properties panel for selected element
 *
 * Note: Action buttons (Undo, Redo, Export, Open in Agent) are in the main header bar.
 */
export const CanvasApp: FC = () => {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Main Content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Components Sidebar */}
        <ResizablePanel minSize={160} preferredSize={200} maxSize={300}>
          <ComponentsSidebar />
        </ResizablePanel>

        {/* Preview Panel */}
        <ResizablePanel minSize={400}>
          <PreviewPanel />
        </ResizablePanel>

        {/* Properties Panel */}
        <ResizablePanel minSize={200} preferredSize={260} maxSize={400}>
          <PropertiesPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
