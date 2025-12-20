import { z } from 'zod';

/**
 * Message status enum
 */
export enum MessageStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  ERROR = 'error',
}

/**
 * Message content type enum
 */
export enum MessageContentType {
  TEXT = 'text',
  CODE = 'code',
  FILE = 'file',
  IMAGE = 'image',
  DIFF = 'diff',
  TOOL_CALL = 'toolCall',
  TOOL_RESULT = 'toolResult',
}

/**
 * Text content schema
 */
export const TextContentSchema = z.object({
  type: z.literal(MessageContentType.TEXT),
  text: z.string(),
});

/**
 * Code content schema
 */
export const CodeContentSchema = z.object({
  type: z.literal(MessageContentType.CODE),
  code: z.string(),
  language: z.string(),
  filename: z.string().optional(),
  lineNumbers: z.boolean().optional(),
});

/**
 * File content schema (for message attachments)
 */
export const FileContentSchema = z.object({
  type: z.literal(MessageContentType.FILE),
  filePath: z.string(),
  content: z.string().optional(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
});

/**
 * Image content schema
 */
export const ImageContentSchema = z.object({
  type: z.literal(MessageContentType.IMAGE),
  url: z.string(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * Diff content schema
 */
export const DiffContentSchema = z.object({
  type: z.literal(MessageContentType.DIFF),
  filePath: z.string(),
  diff: z.string(),
  oldContent: z.string().optional(),
  newContent: z.string().optional(),
});

/**
 * Tool call content schema
 */
export const ToolCallContentSchema = z.object({
  type: z.literal(MessageContentType.TOOL_CALL),
  toolName: z.string(),
  toolCallId: z.string(),
  parameters: z.record(z.string(), z.any()),
});

/**
 * Tool result content schema
 */
export const ToolResultContentSchema = z.object({
  type: z.literal(MessageContentType.TOOL_RESULT),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.any(),
  error: z.string().optional(),
  isError: z.boolean().optional(),
});

/**
 * Union of all message content types
 */
export const MessageContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  CodeContentSchema,
  FileContentSchema,
  ImageContentSchema,
  DiffContentSchema,
  ToolCallContentSchema,
  ToolResultContentSchema,
]);

/**
 * Base message schema (for chat messages)
 */
export const ChatBaseMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  timestamp: z.number(),
  status: z.enum(MessageStatus),
  content: z.array(MessageContentSchema),
  metadata: z
    .object({
      model: z.string().optional(),
      tokens: z.number().optional(),
      cost: z.number().optional(),
      duration: z.number().optional(),
      error: z.string().optional(),
    })
    .optional(),
});

/**
 * User message schema
 */
export const UserMessageSchema = ChatBaseMessageSchema.extend({
  role: z.literal('user'),
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
      terminalOutput: z.string().optional(),
    })
    .optional(),
});

/**
 * Agent message schema
 */
export const AgentMessageSchema = ChatBaseMessageSchema.extend({
  role: z.literal('agent'),
  thinking: z.string().optional(),
  toolCalls: z.array(z.string()).optional(), // Array of tool call IDs
});

/**
 * System message schema
 */
export const SystemMessageSchema = ChatBaseMessageSchema.extend({
  role: z.literal('system'),
  systemType: z
    .enum([
      'info',
      'warning',
      'error',
      'success',
      'task_started',
      'task_completed',
      'phase_changed',
    ])
    .optional(),
});

/**
 * Union of all message types
 */
export const MessageSchema = z.discriminatedUnion('role', [
  UserMessageSchema,
  AgentMessageSchema,
  SystemMessageSchema,
]);

/**
 * TypeScript types inferred from Zod schemas
 */
export type TextContent = z.infer<typeof TextContentSchema>;
export type CodeContent = z.infer<typeof CodeContentSchema>;
export type FileContent = z.infer<typeof FileContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type DiffContent = z.infer<typeof DiffContentSchema>;
export type ToolCallContent = z.infer<typeof ToolCallContentSchema>;
export type ToolResultContent = z.infer<typeof ToolResultContentSchema>;
export type MessageContent = z.infer<typeof MessageContentSchema>;

export type ChatBaseMessage = z.infer<typeof ChatBaseMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type SystemMessage = z.infer<typeof SystemMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;

/**
 * Helper type guards
 */
export function isUserMessage(message: Message): message is UserMessage {
  return message.role === 'user';
}

export function isAgentMessage(message: Message): message is AgentMessage {
  return message.role === 'agent';
}

export function isSystemMessage(message: Message): message is SystemMessage {
  return message.role === 'system';
}

export function isTextContent(content: MessageContent): content is TextContent {
  return content.type === MessageContentType.TEXT;
}

export function isCodeContent(content: MessageContent): content is CodeContent {
  return content.type === MessageContentType.CODE;
}

export function isFileContent(content: MessageContent): content is FileContent {
  return content.type === MessageContentType.FILE;
}

export function isImageContent(content: MessageContent): content is ImageContent {
  return content.type === MessageContentType.IMAGE;
}

export function isDiffContent(content: MessageContent): content is DiffContent {
  return content.type === MessageContentType.DIFF;
}

export function isToolCallContent(content: MessageContent): content is ToolCallContent {
  return content.type === MessageContentType.TOOL_CALL;
}

export function isToolResultContent(content: MessageContent): content is ToolResultContent {
  return content.type === MessageContentType.TOOL_RESULT;
}
