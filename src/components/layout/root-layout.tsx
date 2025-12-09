import { BottomPanel } from './bottom-panel';
import { CenterPanel } from './center-panel';
import { HeaderBar } from './header-bar';
import { LeftSidebar } from './left-sidebar';
import { ResizeHandle } from './resize-handle';
import { RightSidebar } from './right-sidebar';

import type { FC } from 'react';

import { useUIStore } from '@/stores/ui-store';

export const RootLayout: FC = () => {
  const {
    leftSidebarWidth,
    rightSidebarOpen,
    bottomPanelOpen,
    bottomPanelHeight,
  } = useUIStore();

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
      <HeaderBar />

      <div className="flex-1 flex min-h-0">
        <LeftSidebar width={leftSidebarWidth} />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex min-h-0">
            {/* CenterPanel contains Chat + Review split internally */}
            <CenterPanel />

            {/* Right Sidebar (Sessions) - separate from Review */}
            {rightSidebarOpen ? <RightSidebar /> : null}
          </div>

          {bottomPanelOpen ? <>
              <ResizeHandle direction="horizontal" target="bottom" />
              <BottomPanel height={bottomPanelHeight} />
            </> : null}
        </div>
      </div>
    </div>
  );
};
