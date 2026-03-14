import type { ConversationListContext, ConversationSummary } from './conversation-repository';

export interface RestoreSelectionInput {
  readonly listedSessionIds?: Set<string>;
}

export interface ConversationUiBridge {
  getActiveSessionId(): string | null;
  select(sessionId: string): Promise<void>;
  restoreSelection(input?: RestoreSelectionInput): Promise<void>;
  getActiveMeta(): {
    id: string | null;
    title: string | null;
    isTitleLoading: boolean;
  };
  list(): ConversationSummary[];
  create(input?: { title?: string }): Promise<void>;
  rename(sessionId: string, title: string): Promise<void>;
  remove(sessionId: string): Promise<void>;
  hydrateWorkspace(context: ConversationListContext): Promise<void>;
}
