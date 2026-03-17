export interface ConversationSummary {
  readonly sessionId: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messageCount: number;
  readonly workspacePath?: string;
  readonly worktreePath?: string;
  readonly messagePreview?: string;
}

export interface ConversationListContext {
  readonly workspacePath: string | null;
  readonly worktreePath: string | null;
}

export interface ConversationRepository {
  list(context: ConversationListContext): Promise<ConversationSummary[]>;
  load(sessionId: string): Promise<void>;
  create(input?: { title?: string }): Promise<ConversationSummary>;
  remove(sessionId: string): Promise<void>;
  updateTitle(sessionId: string, title: string): Promise<void>;
  getActiveSessionKey(): string;
  restoreActiveSession(): string | null;
}
