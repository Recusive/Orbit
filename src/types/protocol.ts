import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════

const UUIDSchema = z.string().uuid();
const SessionIdSchema = z.string().min(1);

// ═══════════════════════════════════════════════════════════════
// WEBVIEW → EXTENSION (requests)
// ═══════════════════════════════════════════════════════════════

// Chat
export const SendMessageSchema = z.object({
  type: z.literal('message:send'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  content: z.string().min(1),
  context: z
    .object({
      files: z.array(z.string()).optional(),
      selection: z
        .object({
          filePath: z.string(),
          startLine: z.number(),
          endLine: z.number(),
          text: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export const EditMessageSchema = z.object({
  type: z.literal('message:edit'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  content: z.string().min(1),
});

export const DeleteMessageSchema = z.object({
  type: z.literal('message:delete'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
});

// Conversation
export const CreateConversationSchema = z.object({
  type: z.literal('conversation:create'),
  uuid: UUIDSchema,
  title: z.string().optional(),
  workspace_id: z.string().optional(),
});

export const DeleteConversationSchema = z.object({
  type: z.literal('conversation:delete'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
});

export const GetConversationsSchema = z.object({
  type: z.literal('conversation:list'),
  uuid: UUIDSchema,
});

// Agent control
export const AgentStartSchema = z.object({
  type: z.literal('agent:start'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  task: z.string(),
  context: z.record(z.unknown()).optional(),
});

export const AgentStopSchema = z.object({
  type: z.literal('agent:stop'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
});

export const AgentPauseSchema = z.object({
  type: z.literal('agent:pause'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
});

export const AgentResumeSchema = z.object({
  type: z.literal('agent:resume'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
});

// Terminal
export const TerminalCreateSchema = z.object({
  type: z.literal('terminal:create'),
  uuid: UUIDSchema,
  session_id: z.string(),
  name: z.string().optional(),
  cwd: z.string().optional(),
});

export const TerminalCloseSchema = z.object({
  type: z.literal('terminal:close'),
  uuid: UUIDSchema,
  session_id: z.string(),
});

export const TerminalCommandSchema = z.object({
  type: z.literal('terminal:command'),
  uuid: UUIDSchema,
  session_id: z.string(),
  command: z.string(),
});

export const TerminalClearSchema = z.object({
  type: z.literal('terminal:clear'),
  uuid: UUIDSchema,
  session_id: z.string(),
});

// Files
export const FileOpenSchema = z.object({
  type: z.literal('file:open'),
  uuid: UUIDSchema,
  path: z.string(),
});

export const FileReadSchema = z.object({
  type: z.literal('file:read'),
  uuid: UUIDSchema,
  path: z.string(),
});

export const FileWriteSchema = z.object({
  type: z.literal('file:write'),
  uuid: UUIDSchema,
  path: z.string(),
  content: z.string(),
});

export const FileAcceptSchema = z.object({
  type: z.literal('file:accept'),
  uuid: UUIDSchema,
  path: z.string(),
});

export const FileRejectSchema = z.object({
  type: z.literal('file:reject'),
  uuid: UUIDSchema,
  path: z.string(),
});

export const FileAcceptAllSchema = z.object({
  type: z.literal('file:accept_all'),
  uuid: UUIDSchema,
});

export const FileRejectAllSchema = z.object({
  type: z.literal('file:reject_all'),
  uuid: UUIDSchema,
});

// Diff
export const DiffOpenSchema = z.object({
  type: z.literal('diff:open'),
  uuid: UUIDSchema,
  original_path: z.string(),
  modified_path: z.string(),
  title: z.string().optional(),
});

// Combined webview → extension
export const WebviewMessageSchema = z.discriminatedUnion('type', [
  // Chat
  SendMessageSchema,
  EditMessageSchema,
  DeleteMessageSchema,
  // Conversation
  CreateConversationSchema,
  DeleteConversationSchema,
  GetConversationsSchema,
  // Agent
  AgentStartSchema,
  AgentStopSchema,
  AgentPauseSchema,
  AgentResumeSchema,
  // Terminal
  TerminalCreateSchema,
  TerminalCloseSchema,
  TerminalCommandSchema,
  TerminalClearSchema,
  // Files
  FileOpenSchema,
  FileReadSchema,
  FileWriteSchema,
  FileAcceptSchema,
  FileRejectSchema,
  FileAcceptAllSchema,
  FileRejectAllSchema,
  // Diff
  DiffOpenSchema,
]);

// ═══════════════════════════════════════════════════════════════
// EXTENSION → WEBVIEW (responses & streaming)
// ═══════════════════════════════════════════════════════════════

// System
export const SystemInitSchema = z.object({
  type: z.literal('system:init'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  cwd: z.string(),
  model: z.string(),
  tools: z.array(z.string()),
});

// Layout (sent when editor container resizes)
export const LayoutSchema = z.object({
  type: z.literal('layout'),
  width: z.number(),
  height: z.number(),
});

// Agent streaming (matches SDK pattern)
export const AgentChunkSchema = z.object({
  type: z.literal('agent:chunk'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  content: z.string(),
});

export const AgentCompleteSchema = z.object({
  type: z.literal('agent:complete'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  duration_ms: z.number().optional(),
  total_cost_usd: z.number().optional(),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .optional(),
});

export const AgentErrorSchema = z.object({
  type: z.literal('agent:error'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  error: z.string(),
  code: z.string().optional(),
});

// Tool events (matches SDK pattern)
export const ToolStartSchema = z.object({
  type: z.literal('tool:start'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
});

export const ToolEndSchema = z.object({
  type: z.literal('tool:end'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  tool_name: z.string(),
  tool_output: z.unknown(),
  success: z.boolean(),
});

// Terminal
export const TerminalOutputSchema = z.object({
  type: z.literal('terminal:output'),
  uuid: UUIDSchema,
  session_id: z.string(),
  data: z.string(),
});

export const TerminalCreatedSchema = z.object({
  type: z.literal('terminal:created'),
  uuid: UUIDSchema,
  session_id: z.string(),
  name: z.string(),
});

export const TerminalExitedSchema = z.object({
  type: z.literal('terminal:exited'),
  uuid: UUIDSchema,
  session_id: z.string(),
  exit_code: z.number().optional(),
});

// Files
export const FileContentSchema = z.object({
  type: z.literal('file:content'),
  uuid: UUIDSchema,
  request_uuid: z.string(),
  path: z.string(),
  content: z.string(),
});

export const FileChangedSchema = z.object({
  type: z.literal('file:changed'),
  uuid: UUIDSchema,
  path: z.string(),
  change_type: z.enum(['created', 'modified', 'deleted']),
});

export const FileWrittenSchema = z.object({
  type: z.literal('file:written'),
  uuid: UUIDSchema,
  request_uuid: z.string().optional(),
  path: z.string(),
  success: z.boolean(),
});

// Conversation
export const ConversationCreatedSchema = z.object({
  type: z.literal('conversation:created'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  title: z.string(),
});

export const ConversationDeletedSchema = z.object({
  type: z.literal('conversation:deleted'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
});

export const ConversationListSchema = z.object({
  type: z.literal('conversation:list'),
  uuid: UUIDSchema,
  conversations: z.array(
    z.object({
      session_id: z.string(),
      title: z.string(),
      updated_at: z.number(),
      message_count: z.number(),
    })
  ),
});

// General error
export const ErrorSchema = z.object({
  type: z.literal('error'),
  uuid: UUIDSchema,
  request_uuid: z.string().optional(),
  message: z.string(),
  code: z.string().optional(),
});

// Combined extension → webview
export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  // System
  SystemInitSchema,
  LayoutSchema,
  // Agent
  AgentChunkSchema,
  AgentCompleteSchema,
  AgentErrorSchema,
  // Tools
  ToolStartSchema,
  ToolEndSchema,
  // Terminal
  TerminalOutputSchema,
  TerminalCreatedSchema,
  TerminalExitedSchema,
  // Files
  FileContentSchema,
  FileChangedSchema,
  FileWrittenSchema,
  // Conversation
  ConversationCreatedSchema,
  ConversationDeletedSchema,
  ConversationListSchema,
  // Error
  ErrorSchema,
]);

// ═══════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

// Webview → Extension
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type EditMessage = z.infer<typeof EditMessageSchema>;
export type DeleteMessage = z.infer<typeof DeleteMessageSchema>;
export type CreateConversation = z.infer<typeof CreateConversationSchema>;
export type DeleteConversation = z.infer<typeof DeleteConversationSchema>;
export type GetConversations = z.infer<typeof GetConversationsSchema>;
export type AgentStart = z.infer<typeof AgentStartSchema>;
export type AgentStop = z.infer<typeof AgentStopSchema>;
export type AgentPause = z.infer<typeof AgentPauseSchema>;
export type AgentResume = z.infer<typeof AgentResumeSchema>;
export type TerminalCreate = z.infer<typeof TerminalCreateSchema>;
export type TerminalClose = z.infer<typeof TerminalCloseSchema>;
export type TerminalCommand = z.infer<typeof TerminalCommandSchema>;
export type TerminalClear = z.infer<typeof TerminalClearSchema>;
export type FileOpen = z.infer<typeof FileOpenSchema>;
export type FileRead = z.infer<typeof FileReadSchema>;
export type FileWrite = z.infer<typeof FileWriteSchema>;
export type FileAccept = z.infer<typeof FileAcceptSchema>;
export type FileReject = z.infer<typeof FileRejectSchema>;
export type FileAcceptAll = z.infer<typeof FileAcceptAllSchema>;
export type FileRejectAll = z.infer<typeof FileRejectAllSchema>;
export type DiffOpen = z.infer<typeof DiffOpenSchema>;

// Extension → Webview
export type SystemInit = z.infer<typeof SystemInitSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type AgentChunk = z.infer<typeof AgentChunkSchema>;
export type AgentComplete = z.infer<typeof AgentCompleteSchema>;
export type AgentError = z.infer<typeof AgentErrorSchema>;
export type ToolStart = z.infer<typeof ToolStartSchema>;
export type ToolEnd = z.infer<typeof ToolEndSchema>;
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;
export type TerminalCreated = z.infer<typeof TerminalCreatedSchema>;
export type TerminalExited = z.infer<typeof TerminalExitedSchema>;
export type FileContent = z.infer<typeof FileContentSchema>;
export type FileChanged = z.infer<typeof FileChangedSchema>;
export type FileWritten = z.infer<typeof FileWrittenSchema>;
export type ConversationCreated = z.infer<typeof ConversationCreatedSchema>;
export type ConversationDeleted = z.infer<typeof ConversationDeletedSchema>;
export type ConversationList = z.infer<typeof ConversationListSchema>;
export type ProtocolError = z.infer<typeof ErrorSchema>;

// ═══════════════════════════════════════════════════════════════
// TYPE GUARDS (Protocol layer - prefixed to avoid conflicts with message.ts)
// ═══════════════════════════════════════════════════════════════

export function isProtocolAgentMessage(
  msg: ExtensionMessage
): msg is AgentChunk | AgentComplete | AgentError {
  return msg.type.startsWith('agent:');
}

export function isProtocolToolMessage(msg: ExtensionMessage): msg is ToolStart | ToolEnd {
  return msg.type.startsWith('tool:');
}

export function isProtocolTerminalMessage(
  msg: ExtensionMessage
): msg is TerminalOutput | TerminalCreated | TerminalExited {
  return msg.type.startsWith('terminal:');
}

export function isProtocolFileMessage(
  msg: ExtensionMessage
): msg is FileContent | FileChanged | FileWritten {
  return msg.type.startsWith('file:');
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Generate UUID
// ═══════════════════════════════════════════════════════════════

export function generateUUID(): string {
  return crypto.randomUUID();
}
