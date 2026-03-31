import { claudeConversationRepo } from './claude-conversation-repo';
import { claudeUiBridge } from './claude-ui-bridge';

import type { ConversationRepository, ConversationUiBridge } from './types';

export type {
  ConversationListContext,
  ConversationRepository,
  ConversationSummary,
  ConversationUiBridge,
  RestoreSelectionInput,
} from './types';

export function getConversationRepo(): ConversationRepository {
  return claudeConversationRepo;
}

export function getConversationUiBridge(): ConversationUiBridge {
  return claudeUiBridge;
}
