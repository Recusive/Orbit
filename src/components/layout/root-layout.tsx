import React from 'react';

import { useUiStore } from '../../stores/ui-store';

import { BottomPanel } from './bottom-panel';
import { CenterPanel } from './center-panel';
import { FarRightPanel } from './far-right-panel';
import { HeaderBar } from './header-bar';
import { LeftSidebar } from './left-sidebar';
import { ResizeHandle } from './resize-handle';
import { RightPanel } from './right-panel';

export const RootLayout: React.FC = () => {
  const {
    sidebarWidth,
    isSidebarCollapsed,
    filePanel,
    terminalPanel,
    agentPanel,
    setSidebarWidth,
    setFilePanelSize,
    setTerminalPanelSize,
    setAgentPanelSize,
  } = useUiStore();

  // Calculate effective widths based on visibility
  const effectiveSidebarWidth = isSidebarCollapsed ? 44 : sidebarWidth;
  const effectiveFilePanelWidth = filePanel.isVisible && !filePanel.isCollapsed ? filePanel.size : 0;
  const effectiveAgentPanelWidth = agentPanel.isVisible && !agentPanel.isCollapsed ? agentPanel.size : 0;
  const effectiveTerminalHeight = terminalPanel.isVisible && !terminalPanel.isCollapsed ? terminalPanel.size : 0;

  // Handle resize events
  const handleSidebarResize = (delta: number): void => {
    setSidebarWidth(effectiveSidebarWidth + delta);
  };

  const handleFilePanelResize = (delta: number): void => {
    setFilePanelSize(effectiveFilePanelWidth + delta);
  };

  const handleAgentPanelResize = (delta: number): void => {
    setAgentPanelSize(effectiveAgentPanelWidth + delta);
  };

  const handleTerminalResize = (delta: number): void => {
    setTerminalPanelSize(effectiveTerminalHeight - delta);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Header Bar - Fixed 35px height */}
      <HeaderBar />

      {/* Main content area - Flex row layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <LeftSidebar width={effectiveSidebarWidth} />

        {/* Resize handle for sidebar */}
        {!isSidebarCollapsed && (
          <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
        )}

        {/* Main content area - Contains center, right, and far-right panels */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Top section - Chat area and review panels */}
          <div className="flex flex-1 min-h-0">
            {/* Center Panel - Chat area (flexible) */}
            <CenterPanel />

            {/* Right Panel - Files/Source Control (resizable) */}
            {filePanel.isVisible && !filePanel.isCollapsed ? <>
                <ResizeHandle direction="horizontal" onResize={handleFilePanelResize} />
                <RightPanel width={effectiveFilePanelWidth} />
              </> : null}

            {/* Far Right Panel - Terminal Sessions (fixed 150px) */}
            {agentPanel.isVisible && !agentPanel.isCollapsed ? <>
                <ResizeHandle direction="horizontal" onResize={handleAgentPanelResize} />
                <FarRightPanel />
              </> : null}
          </div>

          {/* Bottom Panel - Terminal (resizable height) */}
          {terminalPanel.isVisible && !terminalPanel.isCollapsed ? <>
              <ResizeHandle direction="vertical" onResize={handleTerminalResize} />
              <BottomPanel height={effectiveTerminalHeight} />
            </> : null}
        </div>
      </div>
    </div>
  );
};
