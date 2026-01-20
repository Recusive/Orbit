/**
 * CanvasRootLayout - Main layout for the Canvas UI Builder
 *
 * Mirrors the Agent app layout structure but with:
 * - Left sidebar (navigation, files)
 * - Center canvas area with input box
 * - Right sidebar (properties, layers)
 * - No activity panel, terminal, or editor
 *
 * On first launch, shows a setup wizard to:
 * 1. Initialize ~/.orbit/canvas directory
 * 2. Download shadcn components
 * 3. Scaffold and install preview server
 */
import { useCanvasSetup, usePreviewServer } from '@canvas/hooks';
import { useCallback, useEffect, useState } from 'react';

import { PreviewPanel } from '../preview';
import { CanvasSetupWizard } from '../setup';

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

  // Check if Canvas is set up (first-time setup flow)
  const { state: setupState, orbitPath, recheckSetup } = useCanvasSetup();

  // Preview server lifecycle (only used after setup is complete)
  const {
    state: serverState,
    url: serverUrl,
    error: serverError,
    startServer,
    restartServer,
  } = usePreviewServer();

  // Track restart state separately for UI feedback
  const [isRestarting, setIsRestarting] = useState(false);

  // Selected component name for preview
  const [selectedComponentName, setSelectedComponentName] = useState<string | null>(null);

  // Auto-start preview server once setup is complete
  useEffect(() => {
    if (setupState === 'ready' && serverState === 'stopped') {
      void startServer();
    }
  }, [setupState, serverState, startServer]);

  // Handle component selection from sidebar
  const handleComponentSelect = useCallback((componentName: string) => {
    setSelectedComponentName(componentName);
  }, []);

  // Handle setup wizard completion
  const handleSetupComplete = useCallback((): void => {
    void recheckSetup();
  }, [recheckSetup]);

  // Handle preview server restart with UI feedback
  const handleRestartServer = useCallback(async (): Promise<void> => {
    setIsRestarting(true);
    try {
      await restartServer();
    } finally {
      setIsRestarting(false);
    }
  }, [restartServer]);

  // Show setup wizard if Canvas is not initialized
  if (setupState === 'checking') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          <p className="text-sm text-muted-foreground">Checking Canvas setup...</p>
        </div>
      </div>
    );
  }

  if (setupState === 'needs-setup') {
    return (
      <CanvasSetupWizard
        orbitPath={orbitPath ?? '~/.orbit/canvas'}
        onComplete={handleSetupComplete}
      />
    );
  }

  if (setupState === 'error') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="text-center text-destructive p-8">
          <p className="text-lg font-medium mb-2">Failed to check Canvas setup</p>
          <p className="text-sm opacity-70">Please try reloading the app.</p>
        </div>
      </div>
    );
  }

  // Render preview content based on server state (only when setup is complete)
  // IMPORTANT: Keep PreviewPanel mounted during restart to avoid unmount/remount issues
  const renderPreviewContent = (): React.ReactNode => {
    // If we have a URL (even during restart), keep PreviewPanel mounted
    // PreviewPanel handles its own "restarting" overlay via isRestarting prop
    if (serverUrl) {
      return (
        <PreviewPanel
          serverUrl={serverUrl}
          componentName={selectedComponentName}
          componentType="ui"
          onRestart={handleRestartServer}
          isRestarting={isRestarting || serverState === 'starting'}
        />
      );
    }

    // Initial server start (no URL yet)
    if (serverState === 'starting') {
      return (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          <p className="text-sm">Starting preview server...</p>
        </div>
      );
    }

    if (serverState === 'error') {
      return (
        <div className="text-center text-destructive p-8">
          <p className="text-lg font-medium mb-2">Failed to start preview</p>
          <p className="text-sm opacity-70 font-mono">{serverError}</p>
        </div>
      );
    }

    // Fallback: stopped or unknown state
    return (
      <div className="text-center text-muted-foreground p-8">
        <p className="text-lg font-medium mb-2">Preview will load from ~/.orbit/canvas</p>
        <p className="text-sm opacity-70">
          {selectedComponentName
            ? `Selected: ${selectedComponentName}`
            : 'Select a component from the sidebar'}
        </p>
      </div>
    );
  };

  // Main layout (only shown when setup is complete)
  return (
    <div className="h-full w-full flex overflow-hidden bg-background text-foreground">
      {/* Left Sidebar - Navigation, files, sessions */}
      <CanvasLeftSidebar width={leftSidebarWidth} onComponentSelect={handleComponentSelect} />

      {/* Left Sidebar resize handle */}
      <LeftResizeHandle />

      {/* Canvas Area - Main design canvas with input */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-chat-area">
        {/* Component Preview - Connected to ~/.orbit/canvas */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
          <div
            className="relative rounded-lg border border-border/40 overflow-hidden flex items-center justify-center bg-muted/30"
            style={{ width: '100%', height: '100%', maxWidth: '800px', maxHeight: '600px' }}
          >
            {renderPreviewContent()}
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
