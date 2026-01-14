import {
  ModelSchema,
  ThinkingModeSchema,
  InputModeSchema,
  CommandScopeSchema,
  ShellTypeSchema,
} from '@orbit/shared-schemas';
import { z } from 'zod';

// Re-export shared schemas for consumers
export {
  ModelSchema,
  ThinkingModeSchema,
  InputModeSchema,
  CommandScopeSchema,
  ShellTypeSchema,
  type Model,
  type ThinkingMode,
  type InputMode,
  type CommandScope,
  type ShellType,
} from '@orbit/shared-schemas';

// ═══════════════════════════════════════════════════════════════
// SCHEMA VALIDATORS (for use in message schemas)
// ═══════════════════════════════════════════════════════════════

/** UUID validator for schema fields */
const UUIDSchema = z.uuid();

/** Session ID validator for schema fields */
const SessionIdSchema = z.string().min(1);

// ═══════════════════════════════════════════════════════════════
// BRANDED TYPES (Optional Nominal Typing)
// Use these for compile-time type safety to prevent mixing different IDs
// ═══════════════════════════════════════════════════════════════

/** Branded schema for maximum type safety */
const BrandedUUIDSchema = z.uuid().brand<'UUID'>();
export type UUID = z.infer<typeof BrandedUUIDSchema>;

const BrandedSessionIdSchema = z.string().min(1).brand<'SessionId'>();
export type SessionId = z.infer<typeof BrandedSessionIdSchema>;

const BrandedMessageIdSchema = z.string().min(1).brand<'MessageId'>();
export type MessageId = z.infer<typeof BrandedMessageIdSchema>;

const BrandedRequestIdSchema = z.string().min(1).brand<'RequestId'>();
export type RequestId = z.infer<typeof BrandedRequestIdSchema>;

const BrandedToolIdSchema = z.string().min(1).brand<'ToolId'>();
export type ToolId = z.infer<typeof BrandedToolIdSchema>;

const BrandedTerminalIdSchema = z.string().min(1).brand<'TerminalId'>();
export type TerminalId = z.infer<typeof BrandedTerminalIdSchema>;

const BrandedBrowserIdSchema = z.string().min(1).brand<'BrowserId'>();
export type BrowserId = z.infer<typeof BrandedBrowserIdSchema>;

const BrandedFilePathSchema = z.string().min(1).brand<'FilePath'>();
export type FilePath = z.infer<typeof BrandedFilePathSchema>;

// ─────────────────────────────────────────────────────────────────
// BRAND FACTORY FUNCTIONS
// Create branded types from raw values (validates and casts)
// ─────────────────────────────────────────────────────────────────

/** Create a branded UUID from a string (validates UUID format) */
export function createUUID(value: string): UUID {
  return BrandedUUIDSchema.parse(value);
}

/** Create a UUID using crypto.randomUUID() */
export function generateUUID(): UUID {
  return BrandedUUIDSchema.parse(crypto.randomUUID());
}

/** Create a branded SessionId from a string */
export function createSessionId(value: string): SessionId {
  return BrandedSessionIdSchema.parse(value);
}

/** Create a branded MessageId from a string */
export function createMessageId(value: string): MessageId {
  return BrandedMessageIdSchema.parse(value);
}

/** Create a branded RequestId from a string */
export function createRequestId(value: string): RequestId {
  return BrandedRequestIdSchema.parse(value);
}

/** Create a branded ToolId from a string */
export function createToolId(value: string): ToolId {
  return BrandedToolIdSchema.parse(value);
}

/** Create a branded TerminalId from a string */
export function createTerminalId(value: string): TerminalId {
  return BrandedTerminalIdSchema.parse(value);
}

/** Create a branded BrowserId from a string */
export function createBrowserId(value: string): BrowserId {
  return BrandedBrowserIdSchema.parse(value);
}

/** Create a branded FilePath from a string */
export function createFilePath(value: string): FilePath {
  return BrandedFilePathSchema.parse(value);
}

// ═══════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════

// Note: InputModeSchema, ThinkingModeSchema, ModelSchema, CommandScopeSchema
// are imported and re-exported from @orbit/shared-schemas above

// Minimal conversation summary for sidebar list (stored in localStorage)
// Note: Different from conversation.ts ConversationSummarySchema which has more fields
export const StoredConversationSummarySchema = z
  .object({
    sessionId: z.string(),
    title: z.string(),
    updatedAt: z.number(),
    messageCount: z.number(),
    workspacePath: z.string().optional(),
  })
  .strict();

export const StoredConversationSummaryArraySchema = z.array(StoredConversationSummarySchema);

// Image attachment for localStorage (chat messages)
export const StoredImageAttachmentSchema = z
  .object({
    name: z.string(),
    mimeType: z.string(),
    data: z.string(), // Base64 encoded
    previewUrl: z.string(), // Data URL for display
  })
  .strict();

// Chat message for localStorage persistence
export const StoredChatMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    displayedContent: z.string(),
    isStreaming: z.boolean().optional(),
    isInterrupted: z.boolean().optional(),
    thinking: z.string().optional(),
    thinkingDurationMs: z.number().optional(),
    attachedFiles: z.array(z.string()).optional(),
    attachedImages: z.array(StoredImageAttachmentSchema).optional(),
  })
  .strict();

export const StoredChatMessageArraySchema = z.array(StoredChatMessageSchema);

// ═══════════════════════════════════════════════════════════════
// WEBVIEW → EXTENSION (requests)
// ═══════════════════════════════════════════════════════════════

// Image attachment for message:send
export const ImageAttachmentSchema = z
  .object({
    name: z.string(),
    mimeType: z.string(),
    data: z.string(), // Base64 encoded
  })
  .strict();

// Element context for browser-selected React components
export const ElementContextSchema = z
  .object({
    componentName: z.string(),
    filePath: z.string(),
    lineNumber: z.number(),
    props: z.record(z.string(), z.unknown()),
    componentStack: z.array(z.string()),
    tagName: z.string(),
    selector: z.string(),
    outerHTML: z.string(),
    displayName: z.string(),
  })
  .strict();

// Chat
export const SendMessageSchema = z
  .object({
    type: z.literal('message:send'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    content: z.string().min(1),
    context: z
      .object({
        files: z.array(z.string()).optional(),
        images: z.array(ImageAttachmentSchema).optional(),
        elements: z.array(ElementContextSchema).optional(),
        selection: z
          .object({
            filePath: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            text: z.string(),
          })
          .strict()
          .optional(),
      })
      .optional(),
  })
  .strict();

export const EditMessageSchema = z
  .object({
    type: z.literal('message:edit'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    message_id: z.string(),
    content: z.string().min(1),
  })
  .strict();

export const DeleteMessageSchema = z
  .object({
    type: z.literal('message:delete'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    message_id: z.string(),
  })
  .strict();

// Conversation
export const CreateConversationSchema = z
  .object({
    type: z.literal('conversation:create'),
    uuid: UUIDSchema,
    title: z.string().optional(),
    workspace_path: z.string().optional(),
  })
  .strict();

export const DeleteConversationSchema = z
  .object({
    type: z.literal('conversation:delete'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
  })
  .strict();

export const GetConversationsSchema = z
  .object({
    type: z.literal('conversation:list'),
    uuid: UUIDSchema,
    workspace_path: z.string().optional(),
  })
  .strict();

export const LoadConversationSchema = z
  .object({
    type: z.literal('conversation:load'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
  })
  .strict();

export const RewindConversationSchema = z
  .object({
    type: z.literal('conversation:rewind'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    /** The message ID to rewind to (keep this message, discard all after in UI) */
    message_id: z.string(),
    /** The user message ID for checkpoint lookup (checkpoints are stored by user message) */
    user_message_id: z.string(),
  })
  .strict();

export const UpdateConversationTitleSchema = z
  .object({
    type: z.literal('conversation:updateTitle'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    title: z.string(),
  })
  .strict();

// Agent control
export const AgentStartSchema = z
  .object({
    type: z.literal('agent:start'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    task: z.string(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const AgentStopSchema = z
  .object({
    type: z.literal('agent:stop'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
  })
  .strict();

export const AgentPauseSchema = z
  .object({
    type: z.literal('agent:pause'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
  })
  .strict();

export const AgentResumeSchema = z
  .object({
    type: z.literal('agent:resume'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
  })
  .strict();

// Terminal
export const TerminalCreateSchema = z
  .object({
    type: z.literal('terminal:create'),
    uuid: UUIDSchema,
    session_id: z.string(),
    name: z.string().optional(),
    cwd: z.string().optional(),
    cols: z.number().optional(),
    rows: z.number().optional(),
    shell_integration: z.boolean().optional(),
  })
  .strict();

export const TerminalCloseSchema = z
  .object({
    type: z.literal('terminal:close'),
    uuid: UUIDSchema,
    session_id: z.string(),
    terminal_id: z.string(),
  })
  .strict();

export const TerminalCommandMessageSchema = z
  .object({
    type: z.literal('terminal:command'),
    uuid: UUIDSchema,
    session_id: z.string(),
    command: z.string(),
  })
  .strict();

export const TerminalClearSchema = z
  .object({
    type: z.literal('terminal:clear'),
    uuid: UUIDSchema,
    session_id: z.string(),
  })
  .strict();

// PTY Terminal - Raw input write
export const TerminalWriteSchema = z
  .object({
    type: z.literal('terminal:write'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    data: z.string(),
  })
  .strict();

// PTY Terminal - Resize
export const TerminalResizeSchema = z
  .object({
    type: z.literal('terminal:resize'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    cols: z.number(),
    rows: z.number(),
  })
  .strict();

// PTY Terminal - Send signal
export const TerminalSignalSchema = z
  .object({
    type: z.literal('terminal:signal'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    signal: z.enum(['SIGINT', 'SIGTERM', 'SIGKILL']),
  })
  .strict();

// PTY Terminal - Flow control acknowledgment
export const TerminalAckSchema = z
  .object({
    type: z.literal('terminal:ack'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    byte_count: z.number(),
  })
  .strict();

// Files
export const FileOpenSchema = z
  .object({
    type: z.literal('file:open'),
    uuid: UUIDSchema,
    path: z.string(),
  })
  .strict();

export const FileReadSchema = z
  .object({
    type: z.literal('file:read'),
    uuid: UUIDSchema,
    path: z.string(),
  })
  .strict();

export const FileWriteSchema = z
  .object({
    type: z.literal('file:write'),
    uuid: UUIDSchema,
    path: z.string(),
    content: z.string(),
  })
  .strict();

export const FileAcceptSchema = z
  .object({
    type: z.literal('file:accept'),
    uuid: UUIDSchema,
    path: z.string(),
  })
  .strict();

export const FileRejectSchema = z
  .object({
    type: z.literal('file:reject'),
    uuid: UUIDSchema,
    path: z.string(),
  })
  .strict();

export const FileAcceptAllSchema = z
  .object({
    type: z.literal('file:accept_all'),
    uuid: UUIDSchema,
  })
  .strict();

export const FileRejectAllSchema = z
  .object({
    type: z.literal('file:reject_all'),
    uuid: UUIDSchema,
  })
  .strict();

export const FileTreeRequestSchema = z
  .object({
    type: z.literal('file:tree:request'),
    uuid: UUIDSchema,
    /** Path to get children for. If omitted, returns workspace root children */
    path: z.string().optional(),
  })
  .strict();

export const FileListRequestSchema = z
  .object({
    type: z.literal('file:list:request'),
    uuid: UUIDSchema,
  })
  .strict();

// Diff
export const DiffOpenSchema = z
  .object({
    type: z.literal('diff:open'),
    uuid: UUIDSchema,
    original_path: z.string(),
    modified_path: z.string(),
    title: z.string().optional(),
  })
  .strict();

// URL (open external links)
export const UrlOpenSchema = z
  .object({
    type: z.literal('url:open'),
    uuid: UUIDSchema,
    url: z.url(),
  })
  .strict();

// Permission response (webview → extension)
export const PermissionResponseSchema = z
  .object({
    type: z.literal('permission:response'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    request_id: z.string(),
    decision: z.enum(['approve', 'deny']),
    always: z.boolean().optional(),
  })
  .strict();

// Set input mode (webview → extension)
export const SetInputModeSchema = z
  .object({
    type: z.literal('inputMode:set'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    mode: InputModeSchema,
  })
  .strict();

// Set thinking mode (webview → extension)
export const SetThinkingModeSchema = z
  .object({
    type: z.literal('thinking:set'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    mode: ThinkingModeSchema,
  })
  .strict();

// Set model (webview → extension)
export const SetModelSchema = z
  .object({
    type: z.literal('model:set'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    model: ModelSchema,
  })
  .strict();

// System
export const WebviewReadySchema = z
  .object({
    type: z.literal('webview:ready'),
    uuid: UUIDSchema,
  })
  .strict();

// ═══════════════════════════════════════════════════════════════
// BROWSER (Webview → Extension)
// ═══════════════════════════════════════════════════════════════

// Create an embedded browser webview
export const BrowserCreateSchema = z
  .object({
    type: z.literal('browser:create'),
    uuid: UUIDSchema,
    bounds: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        url: z.string().optional(),
      })
      .strict(),
  })
  .strict();

// @deprecated - Use browser:create instead. Detect external browser (legacy)
export const BrowserDetectSchema = z
  .object({
    type: z.literal('browser:detect'),
    uuid: UUIDSchema,
  })
  .strict();

// Navigate to URL
export const BrowserNavigateSchema = z
  .object({
    type: z.literal('browser:navigate'),
    uuid: UUIDSchema,
    url: z.string(),
  })
  .strict();

// Navigation actions
export const BrowserBackSchema = z
  .object({
    type: z.literal('browser:back'),
    uuid: UUIDSchema,
  })
  .strict();

export const BrowserForwardSchema = z
  .object({
    type: z.literal('browser:forward'),
    uuid: UUIDSchema,
  })
  .strict();

export const BrowserReloadSchema = z
  .object({
    type: z.literal('browser:reload'),
    uuid: UUIDSchema,
  })
  .strict();

export const BrowserStopSchema = z
  .object({
    type: z.literal('browser:stop'),
    uuid: UUIDSchema,
  })
  .strict();

// Element selection (React-grab)
export const BrowserSelectElementStartSchema = z
  .object({
    type: z.literal('browser:select-element:start'),
    uuid: UUIDSchema,
  })
  .strict();

export const BrowserSelectElementCancelSchema = z
  .object({
    type: z.literal('browser:select-element:cancel'),
    uuid: UUIDSchema,
  })
  .strict();

// Update browser view bounds (for positioning over webview)
export const BrowserBoundsSchema = z
  .object({
    type: z.literal('browser:bounds'),
    uuid: UUIDSchema,
    bounds: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .strict(),
  })
  .strict();

// Clear browser tracking (doesn't close browser - Playwright handles that)
export const BrowserClearSchema = z
  .object({
    type: z.literal('browser:clear'),
    uuid: UUIDSchema,
  })
  .strict();

// Open browser DevTools
export const BrowserDevToolsSchema = z
  .object({
    type: z.literal('browser:devtools'),
    uuid: UUIDSchema,
  })
  .strict();

// Show browser view (when Browser tab becomes visible)
export const BrowserShowSchema = z
  .object({
    type: z.literal('browser:show'),
    uuid: UUIDSchema,
  })
  .strict();

// Hide browser view (when Browser tab is hidden)
export const BrowserHideSchema = z
  .object({
    type: z.literal('browser:hide'),
    uuid: UUIDSchema,
  })
  .strict();

// ═══════════════════════════════════════════════════════════════
// SUBAGENTS (Webview → Extension)
// ═══════════════════════════════════════════════════════════════

// Subagent definition
export const SubagentDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    prompt: z.string(),
    tools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    model: z.enum(['sonnet', 'opus', 'haiku', 'inherit']).optional(),
  })
  .strict();

export type SubagentDefinition = z.infer<typeof SubagentDefinitionSchema>;

// List all subagents
export const SubagentsListSchema = z
  .object({
    type: z.literal('subagents:list'),
    uuid: UUIDSchema,
  })
  .strict();

// Create a new subagent
export const SubagentCreateSchema = z
  .object({
    type: z.literal('subagents:create'),
    uuid: UUIDSchema,
    agent: SubagentDefinitionSchema,
  })
  .strict();

// Update an existing subagent
export const SubagentUpdateSchema = z
  .object({
    type: z.literal('subagents:update'),
    uuid: UUIDSchema,
    originalName: z.string(),
    agent: SubagentDefinitionSchema,
  })
  .strict();

// Delete a subagent
export const SubagentDeleteSchema = z
  .object({
    type: z.literal('subagents:delete'),
    uuid: UUIDSchema,
    name: z.string(),
  })
  .strict();

// ═══════════════════════════════════════════════════════════════
// SLASH COMMANDS (Webview → Extension)
// ═══════════════════════════════════════════════════════════════

// Note: CommandScopeSchema is imported from @orbit/shared-schemas

// Slash command definition
export const SlashCommandDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    content: z.string(), // The actual prompt content
    allowedTools: z.array(z.string()).optional(),
    argumentHint: z.string().optional(),
    model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
    scope: CommandScopeSchema,
    /** Whether this command is read-only (builtin/default commands) */
    readonly: z.boolean().optional(),
  })
  .strict();

export type SlashCommandDefinition = z.infer<typeof SlashCommandDefinitionSchema>;
// Note: CommandScope type is exported from @orbit/shared-schemas

// List all slash commands
export const CommandsListSchema = z
  .object({
    type: z.literal('commands:list'),
    uuid: UUIDSchema,
  })
  .strict();

// Create a new slash command
export const CommandCreateSchema = z
  .object({
    type: z.literal('commands:create'),
    uuid: UUIDSchema,
    command: SlashCommandDefinitionSchema,
  })
  .strict();

// Update an existing slash command
export const CommandUpdateSchema = z
  .object({
    type: z.literal('commands:update'),
    uuid: UUIDSchema,
    originalName: z.string(),
    command: SlashCommandDefinitionSchema,
  })
  .strict();

// Delete a slash command
export const CommandDeleteSchema = z
  .object({
    type: z.literal('commands:delete'),
    uuid: UUIDSchema,
    name: z.string(),
    scope: CommandScopeSchema,
  })
  .strict();

// ───────────────────────────────────────────────────────────────
// AI Generation (Webview → Extension)
// ───────────────────────────────────────────────────────────────

// Generate a subagent from natural language description
export const SubagentGenerateSchema = z
  .object({
    type: z.literal('subagents:generate'),
    uuid: UUIDSchema,
    /** Natural language description of what the agent should do */
    description: z.string(),
  })
  .strict();

// Generate a slash command from natural language description
export const CommandGenerateSchema = z
  .object({
    type: z.literal('commands:generate'),
    uuid: UUIDSchema,
    /** Natural language description of what the command should do */
    description: z.string(),
  })
  .strict();

// Combined webview → extension
export const WebviewMessageSchema = z.discriminatedUnion('type', [
  // System
  WebviewReadySchema,
  // Chat
  SendMessageSchema,
  EditMessageSchema,
  DeleteMessageSchema,
  // Conversation
  CreateConversationSchema,
  DeleteConversationSchema,
  GetConversationsSchema,
  LoadConversationSchema,
  RewindConversationSchema,
  UpdateConversationTitleSchema,
  // Agent
  AgentStartSchema,
  AgentStopSchema,
  AgentPauseSchema,
  AgentResumeSchema,
  // Terminal
  TerminalCreateSchema,
  TerminalCloseSchema,
  TerminalCommandMessageSchema,
  TerminalClearSchema,
  TerminalWriteSchema,
  TerminalResizeSchema,
  TerminalSignalSchema,
  TerminalAckSchema,
  // Files
  FileOpenSchema,
  FileReadSchema,
  FileWriteSchema,
  FileAcceptSchema,
  FileRejectSchema,
  FileAcceptAllSchema,
  FileRejectAllSchema,
  FileTreeRequestSchema,
  FileListRequestSchema,
  // Diff
  DiffOpenSchema,
  // URL
  UrlOpenSchema,
  // Permissions
  PermissionResponseSchema,
  SetInputModeSchema,
  // Thinking
  SetThinkingModeSchema,
  // Model
  SetModelSchema,
  // Browser
  BrowserCreateSchema,
  BrowserDetectSchema, // @deprecated
  BrowserNavigateSchema,
  BrowserBackSchema,
  BrowserForwardSchema,
  BrowserReloadSchema,
  BrowserStopSchema,
  BrowserSelectElementStartSchema,
  BrowserSelectElementCancelSchema,
  BrowserBoundsSchema,
  BrowserClearSchema, // @deprecated
  BrowserDevToolsSchema,
  BrowserShowSchema,
  BrowserHideSchema,
  // Subagents
  SubagentsListSchema,
  SubagentCreateSchema,
  SubagentUpdateSchema,
  SubagentDeleteSchema,
  // Slash Commands
  CommandsListSchema,
  CommandCreateSchema,
  CommandUpdateSchema,
  CommandDeleteSchema,
  // AI Generation
  SubagentGenerateSchema,
  CommandGenerateSchema,
]);

// ═══════════════════════════════════════════════════════════════
// EXTENSION → WEBVIEW (responses & streaming)
// ═══════════════════════════════════════════════════════════════

// System
export const SystemInitSchema = z
  .object({
    type: z.literal('system:init'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    // Custom fields from Rust SessionManager
    sdk_session_id: z.string().optional(),
    is_resumed: z.boolean().optional(),
    is_forked: z.boolean().optional(),
    // SDK fields (optional for flexibility)
    cwd: z.string().optional(),
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
  })
  .strict();

// Layout (sent when editor container resizes)
export const LayoutSchema = z
  .object({
    type: z.literal('layout'),
    width: z.number(),
    height: z.number(),
  })
  .strict();

// Agent streaming (matches SDK pattern)
// message_id is required - backend TextEventBatcher captures stable UUID from SDK's stream_event
// Frontend handler adds defensive check for falsy message_id and emits error if missing
export const AgentChunkSchema = z
  .object({
    type: z.literal('agent:chunk'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    message_id: z.string(),
    content: z.string(),
  })
  .strict();

// Agent thinking content (extended thinking)
export const AgentThinkingSchema = z
  .object({
    type: z.literal('agent:thinking'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    message_id: z.string(),
    thinking: z.string(),
    thinking_duration_ms: z.number().optional(),
  })
  .strict();

export const AgentCompleteSchema = z
  .object({
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
      .strict()
      .optional(),
  })
  .strict();

export const AgentErrorSchema = z
  .object({
    type: z.literal('agent:error'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    message_id: z.string(),
    error: z.string(),
    code: z.string().optional(),
  })
  .strict();

// Plan mode changed (from extension to webview)
export const AgentPlanModeSchema = z
  .object({
    type: z.literal('agent:plan_mode'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    enabled: z.boolean(),
  })
  .strict();

// Accept mode changed (from extension to webview)
export const AgentAcceptModeSchema = z
  .object({
    type: z.literal('agent:accept_mode'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    enabled: z.boolean(),
  })
  .strict();

// Checkpoint event (for file rewind functionality)
export const AgentCheckpointSchema = z
  .object({
    type: z.literal('agent:checkpoint'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    checkpoint_id: z.string(),
  })
  .strict();

// Tool events (matches SDK pattern)
export const ToolStartSchema = z
  .object({
    type: z.literal('tool:start'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    message_id: z.string(),
    tool_id: z.string(),
    tool_name: z.string(),
    tool_input: z.record(z.string(), z.unknown()),
    /**
     * Position in the text stream where this tool was invoked.
     * This is the character offset in the accumulated text at the time
     * the tool was called. Used to interleave tool widgets at the correct
     * position when rendering the message.
     */
    content_offset: z.number().optional(),
  })
  .strict();

export const ToolEndSchema = z
  .object({
    type: z.literal('tool:end'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    message_id: z.string(),
    tool_id: z.string(),
    tool_name: z.string(),
    tool_output: z.unknown(),
    success: z.boolean(),
  })
  .strict();

// Permission request (from extension to webview)
export const PermissionRequestSchema = z
  .object({
    type: z.literal('permission:request'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    request_id: z.string(),
    tool_name: z.string(),
    tool_input: z.record(z.string(), z.unknown()),
  })
  .strict();

// Input mode changed (from extension to webview)
export const InputModeChangedSchema = z
  .object({
    type: z.literal('inputMode:changed'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    mode: InputModeSchema,
  })
  .strict();

// Thinking mode changed (from extension to webview)
export const ThinkingModeChangedSchema = z
  .object({
    type: z.literal('thinking:changed'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    mode: ThinkingModeSchema,
  })
  .strict();

// Model changed (from extension to webview)
export const ModelChangedSchema = z
  .object({
    type: z.literal('model:changed'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    model: ModelSchema,
  })
  .strict();

// Panel command (from extension to webview)
export const PanelCommandTypeSchema = z.enum(['quick-open']);

export const PanelCommandSchema = z
  .object({
    type: z.literal('panel:command'),
    uuid: UUIDSchema,
    command: PanelCommandTypeSchema,
  })
  .strict();

// Panel visibility (sent when VS Code panel becomes visible after being hidden)
export const PanelVisibleSchema = z
  .object({
    type: z.literal('panel:visible'),
    uuid: UUIDSchema,
  })
  .strict();

// Note: ShellTypeSchema is imported from @orbit/shared-schemas

// Terminal - Capabilities state
export const TerminalCapabilitiesStateSchema = z
  .object({
    cwd_detection: z.boolean(),
    command_detection: z.boolean(),
    shell_integration: z.boolean(),
  })
  .strict();

// Terminal - Legacy output (for backwards compat)
export const TerminalOutputMessageSchema = z
  .object({
    type: z.literal('terminal:output'),
    uuid: UUIDSchema,
    session_id: z.string(),
    data: z.string(),
  })
  .strict();

// PTY Terminal - Raw data stream
export const TerminalDataSchema = z
  .object({
    type: z.literal('terminal:data'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    data: z.string(),
  })
  .strict();

// PTY Terminal - Created with full PTY info
export const TerminalCreatedSchema = z
  .object({
    type: z.literal('terminal:created'),
    uuid: UUIDSchema,
    session_id: z.string(),
    terminal_id: z.string(),
    name: z.string(),
    pid: z.number().optional(),
    cwd: z.string().optional(),
    shell_type: ShellTypeSchema.optional(),
    capabilities: TerminalCapabilitiesStateSchema.optional(),
  })
  .strict();

// PTY Terminal - Exited
export const TerminalExitedSchema = z
  .object({
    type: z.literal('terminal:exited'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    exit_code: z.number().optional(),
  })
  .strict();

// PTY Terminal - Foreground process changed
export const TerminalForegroundSchema = z
  .object({
    type: z.literal('terminal:foreground'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    process_name: z.string(),
    pid: z.number(),
  })
  .strict();

// PTY Terminal - CWD changed (from shell integration)
export const TerminalCwdChangedSchema = z
  .object({
    type: z.literal('terminal:cwd'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    cwd: z.string(),
  })
  .strict();

// PTY Terminal - Command started (from shell integration)
export const TerminalCommandStartSchema = z
  .object({
    type: z.literal('terminal:command:start'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    command_line: z.string().optional(),
  })
  .strict();

// PTY Terminal - Command ended (from shell integration)
export const TerminalCommandEndSchema = z
  .object({
    type: z.literal('terminal:command:end'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    command_line: z.string().optional(),
    exit_code: z.number().optional(),
  })
  .strict();

// PTY Terminal - Capabilities changed
export const TerminalCapabilitiesChangedSchema = z
  .object({
    type: z.literal('terminal:capabilities'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    capabilities: TerminalCapabilitiesStateSchema,
  })
  .strict();

// PTY Terminal - Title/process name changed (from PTY title escape sequence)
export const TerminalTitleChangedSchema = z
  .object({
    type: z.literal('terminal:title'),
    uuid: UUIDSchema,
    terminal_id: z.string(),
    title: z.string(),
  })
  .strict();

// Files - IPC response with file content
export const FileContentResponseSchema = z
  .object({
    type: z.literal('file:content'),
    uuid: UUIDSchema,
    request_uuid: z.string(),
    path: z.string(),
    content: z.string(),
  })
  .strict();

export const FileChangedSchema = z
  .object({
    type: z.literal('file:changed'),
    uuid: UUIDSchema,
    path: z.string(),
    change_type: z.enum(['created', 'modified', 'deleted']),
  })
  .strict();

export const FileWrittenSchema = z
  .object({
    type: z.literal('file:written'),
    uuid: UUIDSchema,
    request_uuid: z.string().optional(),
    path: z.string(),
    success: z.boolean(),
  })
  .strict();

/** Node in the file tree */
export const FileNodeSchema = z
  .object({
    name: z.string(),
    path: z.string(),
    isDirectory: z.boolean(),
    isFile: z.boolean(),
    isSymlink: z.boolean().optional(),
  })
  .strict();

export const FileTreeResponseSchema = z
  .object({
    type: z.literal('file:tree:response'),
    uuid: UUIDSchema,
    request_uuid: z.string(),
    /** The path that was queried */
    path: z.string(),
    /** Children of the path */
    children: z.array(FileNodeSchema),
  })
  .strict();

export const FileTreeErrorSchema = z
  .object({
    type: z.literal('file:tree:error'),
    uuid: UUIDSchema,
    request_uuid: z.string(),
    error: z.string(),
  })
  .strict();

/** Flat list entry for file:list:response */
export const FileListEntrySchema = z
  .object({
    name: z.string(),
    path: z.string(),
    isDirectory: z.boolean().optional(),
  })
  .strict();

export const FileListResponseSchema = z
  .object({
    type: z.literal('file:list:response'),
    uuid: UUIDSchema,
    request_uuid: z.string(),
    /** All files in the workspace (recursively) */
    files: z.array(FileListEntrySchema),
  })
  .strict();

// Conversation
export const ConversationCreatedSchema = z
  .object({
    type: z.literal('conversation:created'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    title: z.string(),
    workspace_path: z.string().optional(),
  })
  .strict();

export const ConversationDeletedSchema = z
  .object({
    type: z.literal('conversation:deleted'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
  })
  .strict();

export const ConversationListSchema = z
  .object({
    type: z.literal('conversation:list'),
    uuid: UUIDSchema,
    conversations: z.array(
      z
        .object({
          session_id: z.string(),
          title: z.string(),
          updated_at: z.number(),
          message_count: z.number(),
          workspace_path: z.string().optional(),
        })
        .strict()
    ),
  })
  .strict();

export const ConversationLoadingSchema = z
  .object({
    type: z.literal('conversation:loading'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
  })
  .strict();

// Tool use schema for persisted messages (matches Rust ToolUseDto)
const PersistedToolUseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
    output: z.string().optional(),
    success: z.boolean().default(true),
  })
  .strict();

// Token usage schema for persisted messages (matches Rust TokenUsageDto)
const PersistedTokenUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number().optional(),
    cacheCreationInputTokens: z.number().optional(),
    totalCostUsd: z.number().optional(),
  })
  .strict();

// Message schema for conversation:loaded (matches Rust MessageDto)
// Uses transform to handle backwards compatibility with old data that may have
// 'timestamp' instead of 'createdAt', or missing fields
const PersistedMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    thinking: z.string().optional(),
    // Support both old 'timestamp' and new 'createdAt' field names
    createdAt: z.number().optional(),
    timestamp: z.number().optional(),
    toolUses: z.array(PersistedToolUseSchema).optional(),
    usage: PersistedTokenUsageSchema.optional(),
  })
  .strip() // Remove extra fields from old data instead of rejecting
  .transform((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    thinking: msg.thinking,
    // Prefer createdAt, fall back to timestamp, default to 0
    createdAt: msg.createdAt ?? msg.timestamp ?? 0,
    toolUses: msg.toolUses ?? [],
    usage: msg.usage,
  }));

export const ConversationLoadedSchema = z
  .object({
    type: z.literal('conversation:loaded'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    title: z.string(),
    messages: z.array(PersistedMessageSchema),
  })
  .strict();

export const ConversationRewoundSchema = z
  .object({
    type: z.literal('conversation:rewound'),
    uuid: UUIDSchema,
    session_id: SessionIdSchema,
    /** New session ID after forking (for future messages) */
    new_session_id: z.string(),
    /** The message ID we rewound to */
    rewind_to_message_id: z.string(),
    /** Messages remaining after rewind */
    messages: z.array(
      z
        .object({
          id: z.string(),
          role: z.enum(['user', 'assistant']),
          content: z.string(),
          timestamp: z.number(),
          /** Tool uses for this message (for restoring tool widgets) */
          toolUses: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                input: z.record(z.string(), z.unknown()),
                output: z.string().optional(),
                success: z.boolean(),
              })
            )
            .optional(),
        })
        .strict()
    ),
  })
  .strict();

// General error
export const ErrorSchema = z
  .object({
    type: z.literal('error'),
    uuid: UUIDSchema,
    request_uuid: z.string().optional(),
    message: z.string(),
    code: z.string().optional(),
  })
  .strict();

// ═══════════════════════════════════════════════════════════════
// BROWSER (Extension → Webview)
// ═══════════════════════════════════════════════════════════════

// React element context (from element selection)
export const ReactElementContextSchema = z
  .object({
    // React component info
    componentName: z.string(),
    filePath: z.string(),
    lineNumber: z.number(),
    props: z.record(z.string(), z.unknown()),
    componentStack: z.array(z.string()),
    // DOM info
    tagName: z.string(),
    selector: z.string(),
    outerHTML: z.string(),
    // Display helper
    displayName: z.string(),
  })
  .strict();

// Embedded browser created
export const BrowserCreatedSchema = z
  .object({
    type: z.literal('browser:created'),
    uuid: UUIDSchema,
    /** UUID of the original request (for request/response correlation) */
    request_uuid: UUIDSchema.optional(),
    label: z.string(),
    url: z.string(),
  })
  .strict();

// @deprecated - Legacy: Browser window detected (Playwright-spawned)
export const BrowserDetectedSchema = z
  .object({
    type: z.literal('browser:detected'),
    uuid: UUIDSchema,
    pid: z.number(),
  })
  .strict();

// Navigation state update
export const BrowserNavigatedSchema = z
  .object({
    type: z.literal('browser:navigated'),
    uuid: UUIDSchema,
    url: z.string(),
    title: z.string(),
    canGoBack: z.boolean(),
    canGoForward: z.boolean(),
    isLoading: z.boolean(),
  })
  .strict();

// Element selected via React-grab
export const BrowserElementSelectedSchema = z
  .object({
    type: z.literal('browser:element-selected'),
    uuid: UUIDSchema,
    element: ReactElementContextSchema,
  })
  .strict();

// Loading state changed
export const BrowserLoadingSchema = z
  .object({
    type: z.literal('browser:loading'),
    uuid: UUIDSchema,
    isLoading: z.boolean(),
  })
  .strict();

// Browser error
export const BrowserErrorSchema = z
  .object({
    type: z.literal('browser:error'),
    uuid: UUIDSchema,
    error: z.string(),
    code: z.string().optional(),
  })
  .strict();

// Browser tracking cleared
export const BrowserClearedSchema = z
  .object({
    type: z.literal('browser:cleared'),
    uuid: UUIDSchema,
    /** UUID of the original request (for request/response correlation) */
    request_uuid: UUIDSchema.optional(),
  })
  .strict();

// Browser open command (from extension to open browser panel and navigate)
export const BrowserOpenSchema = z
  .object({
    type: z.literal('browser:open'),
    uuid: UUIDSchema,
    /** URL to navigate to (defaults to about:blank if not provided) */
    url: z.string().optional(),
  })
  .strict();

// Browser close command (from extension to close browser panel)
export const BrowserCloseSchema = z
  .object({
    type: z.literal('browser:close'),
    uuid: UUIDSchema,
  })
  .strict();

// ═══════════════════════════════════════════════════════════════
// SUBAGENTS (Extension → Webview)
// ═══════════════════════════════════════════════════════════════

// Response with list of all subagents
export const SubagentsListResponseSchema = z
  .object({
    type: z.literal('subagents:list:response'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    agents: z.array(SubagentDefinitionSchema),
  })
  .strict();

// Confirmation that a subagent was created
export const SubagentCreatedSchema = z
  .object({
    type: z.literal('subagents:created'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    agent: SubagentDefinitionSchema,
  })
  .strict();

// Confirmation that a subagent was updated
export const SubagentUpdatedSchema = z
  .object({
    type: z.literal('subagents:updated'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    agent: SubagentDefinitionSchema,
  })
  .strict();

// Confirmation that a subagent was deleted
export const SubagentDeletedSchema = z
  .object({
    type: z.literal('subagents:deleted'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    name: z.string(),
  })
  .strict();

// Error during subagent operation
export const SubagentErrorSchema = z
  .object({
    type: z.literal('subagents:error'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    error: z.string(),
  })
  .strict();

// ═══════════════════════════════════════════════════════════════
// SLASH COMMANDS (Extension → Webview)
// ═══════════════════════════════════════════════════════════════

// Response with list of all slash commands
export const CommandsListResponseSchema = z
  .object({
    type: z.literal('commands:list:response'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    commands: z.array(SlashCommandDefinitionSchema),
  })
  .strict();

// Confirmation that a command was created
export const CommandCreatedSchema = z
  .object({
    type: z.literal('commands:created'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    command: SlashCommandDefinitionSchema,
  })
  .strict();

// Confirmation that a command was updated
export const CommandUpdatedSchema = z
  .object({
    type: z.literal('commands:updated'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    command: SlashCommandDefinitionSchema,
  })
  .strict();

// Confirmation that a command was deleted
export const CommandDeletedSchema = z
  .object({
    type: z.literal('commands:deleted'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    name: z.string(),
  })
  .strict();

// Error during command operation
export const CommandErrorSchema = z
  .object({
    type: z.literal('commands:error'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    error: z.string(),
  })
  .strict();

// ═══════════════════════════════════════════════════════════════
// AI GENERATION (Extension → Webview)
// ═══════════════════════════════════════════════════════════════

// Generated subagent definition from AI
export const SubagentGeneratedSchema = z
  .object({
    type: z.literal('subagents:generated'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    agent: SubagentDefinitionSchema,
  })
  .strict();

// Generated slash command definition from AI
export const CommandGeneratedSchema = z
  .object({
    type: z.literal('commands:generated'),
    uuid: UUIDSchema,
    request_uuid: UUIDSchema,
    command: SlashCommandDefinitionSchema,
  })
  .strict();

// Combined extension → webview
export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  // System
  SystemInitSchema,
  LayoutSchema,
  // Agent
  AgentChunkSchema,
  AgentThinkingSchema,
  AgentCompleteSchema,
  AgentErrorSchema,
  AgentPlanModeSchema,
  AgentAcceptModeSchema,
  AgentCheckpointSchema,
  // Tools
  ToolStartSchema,
  ToolEndSchema,
  // Permissions
  PermissionRequestSchema,
  InputModeChangedSchema,
  // Thinking
  ThinkingModeChangedSchema,
  // Model
  ModelChangedSchema,
  // Panel commands
  PanelCommandSchema,
  PanelVisibleSchema,
  // Terminal
  TerminalOutputMessageSchema,
  TerminalDataSchema,
  TerminalCreatedSchema,
  TerminalExitedSchema,
  TerminalForegroundSchema,
  TerminalCwdChangedSchema,
  TerminalCommandStartSchema,
  TerminalCommandEndSchema,
  TerminalCapabilitiesChangedSchema,
  TerminalTitleChangedSchema,
  // Files
  FileContentResponseSchema,
  FileChangedSchema,
  FileWrittenSchema,
  FileTreeResponseSchema,
  FileTreeErrorSchema,
  FileListResponseSchema,
  // Conversation
  ConversationCreatedSchema,
  ConversationDeletedSchema,
  ConversationListSchema,
  ConversationLoadingSchema,
  ConversationLoadedSchema,
  ConversationRewoundSchema,
  // Error
  ErrorSchema,
  // Browser
  BrowserCreatedSchema,
  BrowserDetectedSchema, // @deprecated
  BrowserNavigatedSchema,
  BrowserElementSelectedSchema,
  BrowserLoadingSchema,
  BrowserErrorSchema,
  BrowserClearedSchema,
  BrowserOpenSchema,
  BrowserCloseSchema,
  // Subagents
  SubagentsListResponseSchema,
  SubagentCreatedSchema,
  SubagentUpdatedSchema,
  SubagentDeletedSchema,
  SubagentErrorSchema,
  // Slash Commands
  CommandsListResponseSchema,
  CommandCreatedSchema,
  CommandUpdatedSchema,
  CommandDeletedSchema,
  CommandErrorSchema,
  // AI Generation
  SubagentGeneratedSchema,
  CommandGeneratedSchema,
]);

// ═══════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

// Shared primitives
export type StoredConversationSummary = z.infer<typeof StoredConversationSummarySchema>;

// Webview → Extension
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type EditMessage = z.infer<typeof EditMessageSchema>;
export type DeleteMessage = z.infer<typeof DeleteMessageSchema>;
export type CreateConversation = z.infer<typeof CreateConversationSchema>;
export type DeleteConversation = z.infer<typeof DeleteConversationSchema>;
export type GetConversations = z.infer<typeof GetConversationsSchema>;
export type LoadConversation = z.infer<typeof LoadConversationSchema>;
export type RewindConversation = z.infer<typeof RewindConversationSchema>;
export type UpdateConversationTitle = z.infer<typeof UpdateConversationTitleSchema>;
export type AgentStart = z.infer<typeof AgentStartSchema>;
export type AgentStop = z.infer<typeof AgentStopSchema>;
export type AgentPause = z.infer<typeof AgentPauseSchema>;
export type AgentResume = z.infer<typeof AgentResumeSchema>;
export type TerminalCreate = z.infer<typeof TerminalCreateSchema>;
export type TerminalClose = z.infer<typeof TerminalCloseSchema>;
export type TerminalCommandMessage = z.infer<typeof TerminalCommandMessageSchema>;
export type TerminalClear = z.infer<typeof TerminalClearSchema>;
export type TerminalWrite = z.infer<typeof TerminalWriteSchema>;
export type TerminalResize = z.infer<typeof TerminalResizeSchema>;
export type TerminalSignal = z.infer<typeof TerminalSignalSchema>;
export type TerminalAck = z.infer<typeof TerminalAckSchema>;
export type FileOpen = z.infer<typeof FileOpenSchema>;
export type FileRead = z.infer<typeof FileReadSchema>;
export type FileWrite = z.infer<typeof FileWriteSchema>;
export type FileAccept = z.infer<typeof FileAcceptSchema>;
export type FileReject = z.infer<typeof FileRejectSchema>;
export type FileAcceptAll = z.infer<typeof FileAcceptAllSchema>;
export type FileRejectAll = z.infer<typeof FileRejectAllSchema>;
export type FileTreeRequest = z.infer<typeof FileTreeRequestSchema>;
export type FileListRequest = z.infer<typeof FileListRequestSchema>;
export type DiffOpen = z.infer<typeof DiffOpenSchema>;
export type UrlOpen = z.infer<typeof UrlOpenSchema>;
export type WebviewReady = z.infer<typeof WebviewReadySchema>;
export type PermissionResponse = z.infer<typeof PermissionResponseSchema>;
export type SetInputMode = z.infer<typeof SetInputModeSchema>;
export type SetThinkingMode = z.infer<typeof SetThinkingModeSchema>;
export type SetModel = z.infer<typeof SetModelSchema>;
// Note: Model type is exported from @orbit/shared-schemas at file top
// Browser (Webview → Extension)
export type BrowserCreate = z.infer<typeof BrowserCreateSchema>;
export type BrowserDetect = z.infer<typeof BrowserDetectSchema>; // @deprecated
export type BrowserNavigate = z.infer<typeof BrowserNavigateSchema>;
export type BrowserBack = z.infer<typeof BrowserBackSchema>;
export type BrowserForward = z.infer<typeof BrowserForwardSchema>;
export type BrowserReload = z.infer<typeof BrowserReloadSchema>;
export type BrowserStop = z.infer<typeof BrowserStopSchema>;
export type BrowserSelectElementStart = z.infer<typeof BrowserSelectElementStartSchema>;
export type BrowserSelectElementCancel = z.infer<typeof BrowserSelectElementCancelSchema>;
export type BrowserBounds = z.infer<typeof BrowserBoundsSchema>;
export type BrowserClear = z.infer<typeof BrowserClearSchema>;
export type BrowserDevTools = z.infer<typeof BrowserDevToolsSchema>;
export type BrowserShow = z.infer<typeof BrowserShowSchema>;
export type BrowserHide = z.infer<typeof BrowserHideSchema>;

// Extension → Webview
export type SystemInit = z.infer<typeof SystemInitSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type AgentChunk = z.infer<typeof AgentChunkSchema>;
export type AgentThinking = z.infer<typeof AgentThinkingSchema>;
export type AgentComplete = z.infer<typeof AgentCompleteSchema>;
export type AgentError = z.infer<typeof AgentErrorSchema>;
export type AgentPlanMode = z.infer<typeof AgentPlanModeSchema>;
export type AgentAcceptMode = z.infer<typeof AgentAcceptModeSchema>;
export type AgentCheckpoint = z.infer<typeof AgentCheckpointSchema>;
export type ToolStart = z.infer<typeof ToolStartSchema>;
export type ToolEnd = z.infer<typeof ToolEndSchema>;
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;
export type InputModeChanged = z.infer<typeof InputModeChangedSchema>;
// Note: InputMode type is exported from @orbit/shared-schemas at file top
export type ThinkingModeChanged = z.infer<typeof ThinkingModeChangedSchema>;
// Note: ThinkingMode type is exported from @orbit/shared-schemas at file top
export type ModelChanged = z.infer<typeof ModelChangedSchema>;
export type PanelCommandType = z.infer<typeof PanelCommandTypeSchema>;
export type PanelCommand = z.infer<typeof PanelCommandSchema>;
export type PanelVisible = z.infer<typeof PanelVisibleSchema>;
// Note: ShellType type is exported from @orbit/shared-schemas at file top
export type TerminalCapabilitiesState = z.infer<typeof TerminalCapabilitiesStateSchema>;
export type TerminalOutputMessage = z.infer<typeof TerminalOutputMessageSchema>;
export type TerminalData = z.infer<typeof TerminalDataSchema>;
export type TerminalCreated = z.infer<typeof TerminalCreatedSchema>;
export type TerminalExited = z.infer<typeof TerminalExitedSchema>;
export type TerminalCwdChanged = z.infer<typeof TerminalCwdChangedSchema>;
export type TerminalCommandStart = z.infer<typeof TerminalCommandStartSchema>;
export type TerminalCommandEnd = z.infer<typeof TerminalCommandEndSchema>;
export type TerminalCapabilitiesChanged = z.infer<typeof TerminalCapabilitiesChangedSchema>;
export type TerminalTitleChanged = z.infer<typeof TerminalTitleChangedSchema>;
export type FileContentResponse = z.infer<typeof FileContentResponseSchema>;
export type FileChanged = z.infer<typeof FileChangedSchema>;
export type FileWritten = z.infer<typeof FileWrittenSchema>;
export type FileNode = z.infer<typeof FileNodeSchema>;
export type FileTreeResponse = z.infer<typeof FileTreeResponseSchema>;
export type FileTreeError = z.infer<typeof FileTreeErrorSchema>;
export type FileListEntry = z.infer<typeof FileListEntrySchema>;
export type FileListResponse = z.infer<typeof FileListResponseSchema>;
export type ConversationCreated = z.infer<typeof ConversationCreatedSchema>;
export type ConversationDeleted = z.infer<typeof ConversationDeletedSchema>;
export type ConversationList = z.infer<typeof ConversationListSchema>;
export type ConversationLoading = z.infer<typeof ConversationLoadingSchema>;
export type ConversationLoaded = z.infer<typeof ConversationLoadedSchema>;
export type ConversationRewound = z.infer<typeof ConversationRewoundSchema>;
export type ProtocolError = z.infer<typeof ErrorSchema>;
// Browser (Extension → Webview)
export type ReactElementContext = z.infer<typeof ReactElementContextSchema>;
export type BrowserCreated = z.infer<typeof BrowserCreatedSchema>;
export type BrowserDetected = z.infer<typeof BrowserDetectedSchema>; // @deprecated
export type BrowserNavigated = z.infer<typeof BrowserNavigatedSchema>;
export type BrowserElementSelected = z.infer<typeof BrowserElementSelectedSchema>;
export type BrowserLoading = z.infer<typeof BrowserLoadingSchema>;
export type BrowserError = z.infer<typeof BrowserErrorSchema>;
export type BrowserCleared = z.infer<typeof BrowserClearedSchema>;
export type BrowserOpen = z.infer<typeof BrowserOpenSchema>;
export type BrowserClose = z.infer<typeof BrowserCloseSchema>;

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
): msg is
  | TerminalOutputMessage
  | TerminalData
  | TerminalCreated
  | TerminalExited
  | TerminalCwdChanged
  | TerminalCommandStart
  | TerminalCommandEnd
  | TerminalCapabilitiesChanged {
  return msg.type.startsWith('terminal:');
}

export function isProtocolFileMessage(
  msg: ExtensionMessage
): msg is
  | FileContentResponse
  | FileChanged
  | FileWritten
  | FileTreeResponse
  | FileTreeError
  | FileListResponse {
  return msg.type.startsWith('file:');
}

export function isProtocolBrowserMessage(
  msg: ExtensionMessage
): msg is
  | BrowserCreated
  | BrowserDetected
  | BrowserNavigated
  | BrowserElementSelected
  | BrowserLoading
  | BrowserError
  | BrowserCleared
  | BrowserOpen
  | BrowserClose {
  return msg.type.startsWith('browser:');
}
