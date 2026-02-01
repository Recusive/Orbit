/**
 * ChatHeader - Breadcrumb header showing workspace and conversation title
 *
 * NOTE: Header height comes from @/lib/utils/constants.
 * To change header dimensions, update HEIGHTS in constants.ts.
 */
import type { FC } from 'react';

import { HEIGHTS } from '@/lib/utils';
import { useWorkspaceName, useActiveConversationTitle, useVaultOpen } from '@/stores/ui/ui-store';

export const ChatHeader: FC = () => {
  const workspaceName = useWorkspaceName();
  const activeConversationTitle = useActiveConversationTitle();
  const vaultOpen = useVaultOpen();

  return (
    <header
      className="flex items-center justify-between px-4 border-b-[3px] border-border/50 shrink-0"
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center text-base min-w-0 flex-1 max-w-[280px]">
        {vaultOpen ? (
          /* Vault breadcrumb */
          <>
            <span className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity shrink-0">
              Vault
            </span>
            <span className="mx-2 opacity-30 shrink-0">/</span>
            <span
              className="opacity-70 whitespace-nowrap overflow-hidden flex-1 min-w-0"
              title="All Notes"
              style={{
                maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                maskSize: '100% 100%',
                WebkitMaskSize: '100% 100%',
              }}
            >
              All Notes
            </span>
          </>
        ) : (
          /* Normal workspace breadcrumb */
          <>
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
          </>
        )}
      </div>
    </header>
  );
};
