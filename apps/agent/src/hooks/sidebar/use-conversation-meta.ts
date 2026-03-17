import { useMemo } from 'react';

import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';
import { useActiveBackend } from '@/stores/backend';
import { useOcActiveSession, useOcActiveSessionId } from '@/stores/opencode';
import {
  useActiveConversationId,
  useActiveConversationTitle,
  useIsTitleLoading,
} from '@/stores/ui/ui-store';

interface ConversationMeta {
  readonly activeSessionId: string | null;
  readonly title: string | null;
  readonly isTitleLoading: boolean;
}

export function useConversationMeta(): ConversationMeta {
  const activeBackend = useActiveBackend();
  const claudeActiveSessionId = useActiveConversationId();
  const claudeTitle = useActiveConversationTitle();
  const claudeTitleLoading = useIsTitleLoading(claudeActiveSessionId);
  const ocActiveSessionId = useOcActiveSessionId();
  const ocActiveSession = useOcActiveSession();
  const ocTitleLoading = useIsTitleLoading(ocActiveSessionId);
  const ocRawTitle = ocActiveSession?.title;
  const ocDisplayTitle =
    ocRawTitle === undefined ? null : isDefaultOcTitle(ocRawTitle) ? 'Untitled' : ocRawTitle;

  return useMemo(() => {
    if (activeBackend === 'claude') {
      return {
        activeSessionId: claudeActiveSessionId,
        title: claudeTitle,
        isTitleLoading: claudeTitleLoading,
      };
    }

    return {
      activeSessionId: ocActiveSessionId,
      title: ocDisplayTitle,
      isTitleLoading: ocTitleLoading,
    };
  }, [
    activeBackend,
    claudeActiveSessionId,
    claudeTitle,
    claudeTitleLoading,
    ocActiveSessionId,
    ocDisplayTitle,
    ocTitleLoading,
  ]);
}
