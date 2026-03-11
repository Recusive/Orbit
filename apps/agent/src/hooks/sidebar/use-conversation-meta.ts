import { useMemo } from 'react';

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
      title: ocActiveSession?.title ?? null,
      isTitleLoading: false,
    };
  }, [
    activeBackend,
    claudeActiveSessionId,
    claudeTitle,
    claudeTitleLoading,
    ocActiveSessionId,
    ocActiveSession,
  ]);
}
