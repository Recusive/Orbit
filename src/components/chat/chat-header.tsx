import type { FC } from 'react';

import { HEIGHTS } from '@/lib/constants';
import { useWorkspaceName, useActiveConversationTitle } from '@/stores/ui-store';

export const ChatHeader: FC = () => {
  const workspaceName = useWorkspaceName();
  const activeConversationTitle = useActiveConversationTitle();

  return (
    <header
      className="flex items-center justify-between px-4 border-b border-border shrink-0"
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center text-sm min-w-0 flex-1 max-w-[280px]">
        <span className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity shrink-0">
          {workspaceName ?? 'No workspace'}
        </span>
        {activeConversationTitle ? (
          <>
            <span className="mx-2 opacity-30 shrink-0">/</span>
            <span
              className="opacity-70 whitespace-nowrap overflow-hidden flex-1 min-w-0"
              title={activeConversationTitle}
              style={{
                maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                maskSize: '100% 100%',
                WebkitMaskSize: '100% 100%',
              }}
            >
              {activeConversationTitle}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );
};
