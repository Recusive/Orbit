// Export all stores
export { useChatStore } from './chat-store';
export type { ChatState, Conversation, Message } from './chat-store';

export { useAgentStore } from './agent-store';
export type { AgentState, AgentTask, AgentPhase, ToolCall } from './agent-store';

export { useFileStore } from './file-store';
export type {
  FileState,
  FileChange,
  FileChangeType,
  FileChangeStatus,
  FileDiff,
  DiffHunk,
  DiffLine,
} from './file-store';

export { useTerminalStore } from './terminal-store';
export type {
  TerminalState,
  TerminalSession,
  TerminalOutput,
} from './terminal-store';

export { useUIStore, useIsLeftSidebarCollapsed } from './ui-store';
