import { claudeConversationRepo } from './claude-conversation-repo';
import { claudeUiBridge } from './claude-ui-bridge';
import { ocConversationRepo } from './oc-conversation-repo';
import { ocUiBridge } from './oc-ui-bridge';

import type { ConversationRepository, ConversationUiBridge } from '@/types/backend';

import { useBackendStore } from '@/stores/backend';

export function getConversationRepo(
  backend = useBackendStore.getState().activeBackend
): ConversationRepository {
  return backend === 'claude' ? claudeConversationRepo : ocConversationRepo;
}

export function getConversationUiBridge(
  backend = useBackendStore.getState().activeBackend
): ConversationUiBridge {
  return backend === 'claude' ? claudeUiBridge : ocUiBridge;
}
