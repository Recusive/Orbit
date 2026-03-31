import { useMemo } from 'react';

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
  const activeSessionId = useActiveConversationId();
  const title = useActiveConversationTitle();
  const isTitleLoading = useIsTitleLoading(activeSessionId);

  return useMemo(
    () => ({
      activeSessionId,
      title,
      isTitleLoading,
    }),
    [activeSessionId, isTitleLoading, title]
  );
}
