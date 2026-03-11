/**
 * EditorChatPanel - AI chat assistant panel for Editor mode
 *
 * Self-contained chat unit: ContentTopBar + gradient + chat content.
 * In editor mode the chat moves from ContentCard to ActivityCard,
 * and this component carries the full chat UI (header included) with it.
 */
import type { FC } from 'react';

import { BackendChatSurface } from '@/components/chat/BackendChatSurface';
import { ContentTopBar } from '@/components/layout/content-top-bar';
import { SIDEBAR } from '@/lib/utils/constants';
import { useLeftSidebarWidth } from '@/stores/ui/ui-store';

export const EditorChatPanel: FC = () => {
  const leftSidebarWidth = useLeftSidebarWidth();
  const sidebarOpen = leftSidebarWidth > SIDEBAR.collapsed;

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header — same ContentTopBar from the agent page, relocated with the chat */}
      <ContentTopBar sidebarOpen={sidebarOpen} transparent={false} className="relative z-10" />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-0">
        <BackendChatSurface surface="editor" />
      </div>
    </div>
  );
};
