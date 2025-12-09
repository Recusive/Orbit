/**
 * Central export file for all types in the orbit-agent-ui application
 */

// Protocol types - VS Code postMessage communication
export * from './protocol';

// Message types - Chat messages and content
// Note: message.ts exports FileContent and FileContentSchema which conflict with file.ts
// We export message.ts with aliases for the conflicting types
export {
  MessageStatus,
  MessageContentType,
  TextContentSchema,
  CodeContentSchema,
  FileContentSchema as MessageFileContentSchema,
  ImageContentSchema,
  DiffContentSchema,
  ToolCallContentSchema,
  ToolResultContentSchema,
  MessageContentSchema,
  ChatBaseMessageSchema,
  UserMessageSchema,
  AgentMessageSchema,
  SystemMessageSchema,
  MessageSchema,
  type TextContent,
  type CodeContent,
  type FileContent as MessageFileContent,
  type ImageContent,
  type DiffContent,
  type ToolCallContent,
  type ToolResultContent,
  type MessageContent,
  type ChatBaseMessage,
  type UserMessage,
  type AgentMessage,
  type SystemMessage,
  type Message,
  isUserMessage,
  isAgentMessage,
  isSystemMessage,
  isTextContent,
  isCodeContent,
  isFileContent,
  isImageContent,
  isDiffContent,
  isToolCallContent,
  isToolResultContent,
} from './message';

// Conversation types - Conversations and workspaces
export * from './conversation';

// File types - File operations and metadata
export * from './file';

// Terminal types - Terminal sessions and commands
export * from './terminal';

// Agent types - Agent state and tasks
export * from './agent';

// Diff types - File diffs and comparisons
export * from './diff';

// UI types - UI state and preferences
export * from './ui';
