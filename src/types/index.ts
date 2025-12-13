/**
 * Central export file for all types in the orbit-agent-ui application
 */

// Protocol types - VS Code postMessage communication
// Export selectively to avoid conflicts with domain types
export {
  // Schemas
  WebviewMessageSchema,
  ExtensionMessageSchema,
  // Types
  type WebviewMessage,
  type ExtensionMessage,
  // Specific message types (prefixed to avoid conflicts)
  type SendMessage,
  type EditMessage,
  type DeleteMessage,
  type CreateConversation,
  type DeleteConversation,
  type GetConversations,
  type AgentStart,
  type AgentStop,
  type AgentPause,
  type AgentResume,
  type TerminalCreate,
  type TerminalClose,
  type TerminalClear,
  type FileOpen,
  type FileRead,
  type FileWrite,
  type FileAccept,
  type FileReject,
  type FileAcceptAll,
  type FileRejectAll,
  type DiffOpen,
  // Extension -> Webview types
  type SystemInit,
  type AgentChunk,
  type AgentComplete,
  type AgentError,
  type ToolStart,
  type ToolEnd,
  type TerminalCreated,
  type TerminalExited,
  type FileChanged,
  type FileWritten,
  type ConversationCreated,
  type ConversationDeleted,
  type ConversationList,
  type ProtocolError,
  // Type guards
  isProtocolAgentMessage,
  isProtocolToolMessage,
  isProtocolTerminalMessage,
  isProtocolFileMessage,
  // Helpers
  generateUUID,
} from './protocol';

// Re-export protocol terminal types with aliases to avoid conflicts
export {
  TerminalCommandSchema as ProtocolTerminalCommandSchema,
  TerminalOutputSchema as ProtocolTerminalOutputSchema,
  FileContentSchema as ProtocolFileContentSchema,
  type TerminalCommand as ProtocolTerminalCommand,
  type TerminalOutput as ProtocolTerminalOutput,
  type FileContent as ProtocolFileContent,
} from './protocol';

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

// Context types - @ mentions and attached context
export * from './context';
