import { CenterPanel } from './center-panel';
import { HeaderBar } from './header-bar';
import { LeftSidebar } from './left-sidebar';
import { RightSidebar } from './right-sidebar';

import type { FC } from 'react';

import { useUIStore } from '@/stores/ui-store';

export const RootLayout: FC = () => {
  const {
    leftSidebarWidth,
    rightSidebarOpen,
  } = useUIStore();

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background text-foreground">
      <HeaderBar />

      <div className="flex-1 flex min-h-0">
        <LeftSidebar width={leftSidebarWidth} />

        {/* CenterPanel contains Chat + Review split (with terminal inside review) */}
        <CenterPanel />

        {/* Right Sidebar (Sessions) - separate from Review */}
        {rightSidebarOpen ? <RightSidebar /> : null}
      </div>
    </div>
  );
};
