import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════

const UUIDSchema = z.string().uuid();
const SessionIdSchema = z.string().min(1);

// Input mode: default (ask permission), accept (auto-approve), plan (read-only)
export const InputModeSchema = z.enum(['default', 'accept', 'plan']);

// Thinking mode: off, think (4k), hard (10k), ultra (32k)
export const ThinkingModeSchema = z.enum(['off', 'think', 'hard', 'ultra']);

// Model selection: haiku (fast), sonnet (balanced), opus (best)
export const ModelSchema = z.enum(['haiku', 'sonnet', 'opus']);

// ═══════════════════════════════════════════════════════════════
// WEBVIEW → EXTENSION (requests)
// ═══════════════════════════════════════════════════════════════

// Image attachment for message:send
export const ImageAttachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  data: z.string(), // Base64 encoded
});

// Element context for browser-selected React components
export const ElementContextSchema = z.object({
  componentName: z.string(),
  filePath: z.string(),
  lineNumber: z.number(),
  props: z.record(z.unknown()),
  componentStack: z.array(z.string()),
  tagName: z.string(),
  selector: z.string(),
  outerHTML: z.string(),
  displayName: z.string(),
});

// Chat
export const SendMessageSchema = z.object({
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

export const LoadConversationSchema = z.object({
  type: z.literal('conversation:load'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
});

export const RewindConversationSchema = z.object({
  type: z.literal('conversation:rewind'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  /** The message ID to rewind to (keep this message, discard all after) */
  message_id: z.string(),
});

export const UpdateConversationTitleSchema = z.object({
  type: z.literal('conversation:updateTitle'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  title: z.string(),
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
  cols: z.number().optional(),
  rows: z.number().optional(),
  shell_integration: z.boolean().optional(),
});

export const TerminalCloseSchema = z.object({
  type: z.literal('terminal:close'),
  uuid: UUIDSchema,
  session_id: z.string(),
  terminal_id: z.string(),
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

// PTY Terminal - Raw input write
export const TerminalWriteSchema = z.object({
  type: z.literal('terminal:write'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  data: z.string(),
});

// PTY Terminal - Resize
export const TerminalResizeSchema = z.object({
  type: z.literal('terminal:resize'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  cols: z.number(),
  rows: z.number(),
});

// PTY Terminal - Send signal
export const TerminalSignalSchema = z.object({
  type: z.literal('terminal:signal'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  signal: z.enum(['SIGINT', 'SIGTERM', 'SIGKILL']),
});

// PTY Terminal - Flow control acknowledgment
export const TerminalAckSchema = z.object({
  type: z.literal('terminal:ack'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  byte_count: z.number(),
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

export const FileTreeRequestSchema = z.object({
  type: z.literal('file:tree:request'),
  uuid: UUIDSchema,
  /** Path to get children for. If omitted, returns workspace root children */
  path: z.string().optional(),
});

export const FileListRequestSchema = z.object({
  type: z.literal('file:list:request'),
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

// URL (open external links)
export const UrlOpenSchema = z.object({
  type: z.literal('url:open'),
  uuid: UUIDSchema,
  url: z.string().url(),
});

// Permission response (webview → extension)
export const PermissionResponseSchema = z.object({
  type: z.literal('permission:response'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  request_id: z.string(),
  decision: z.enum(['approve', 'deny']),
  always: z.boolean().optional(),
});

// Set input mode (webview → extension)
export const SetInputModeSchema = z.object({
  type: z.literal('inputMode:set'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  mode: InputModeSchema,
});

// Set thinking mode (webview → extension)
export const SetThinkingModeSchema = z.object({
  type: z.literal('thinking:set'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  mode: ThinkingModeSchema,
});

// Set model (webview → extension)
export const SetModelSchema = z.object({
  type: z.literal('model:set'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  model: ModelSchema,
});

// System
export const WebviewReadySchema = z.object({
  type: z.literal('webview:ready'),
  uuid: UUIDSchema,
});

// ═══════════════════════════════════════════════════════════════
// BROWSER (Webview → Extension)
// ═══════════════════════════════════════════════════════════════

// Create a browser view
export const BrowserCreateSchema = z.object({
  type: z.literal('browser:create'),
  uuid: UUIDSchema,
});

// Navigate to URL
export const BrowserNavigateSchema = z.object({
  type: z.literal('browser:navigate'),
  uuid: UUIDSchema,
  url: z.string(),
});

// Navigation actions
export const BrowserBackSchema = z.object({
  type: z.literal('browser:back'),
  uuid: UUIDSchema,
});

export const BrowserForwardSchema = z.object({
  type: z.literal('browser:forward'),
  uuid: UUIDSchema,
});

export const BrowserReloadSchema = z.object({
  type: z.literal('browser:reload'),
  uuid: UUIDSchema,
});

export const BrowserStopSchema = z.object({
  type: z.literal('browser:stop'),
  uuid: UUIDSchema,
});

// Element selection (React-grab)
export const BrowserSelectElementStartSchema = z.object({
  type: z.literal('browser:select-element:start'),
  uuid: UUIDSchema,
});

export const BrowserSelectElementCancelSchema = z.object({
  type: z.literal('browser:select-element:cancel'),
  uuid: UUIDSchema,
});

// Update browser view bounds (for positioning over webview)
export const BrowserBoundsSchema = z.object({
  type: z.literal('browser:bounds'),
  uuid: UUIDSchema,
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});

// Destroy browser view
export const BrowserDestroySchema = z.object({
  type: z.literal('browser:destroy'),
  uuid: UUIDSchema,
});

// Open browser DevTools
export const BrowserDevToolsSchema = z.object({
  type: z.literal('browser:devtools'),
  uuid: UUIDSchema,
});

// Show browser view (when Browser tab becomes visible)
export const BrowserShowSchema = z.object({
  type: z.literal('browser:show'),
  uuid: UUIDSchema,
});

// Hide browser view (when Browser tab is hidden)
export const BrowserHideSchema = z.object({
  type: z.literal('browser:hide'),
  uuid: UUIDSchema,
});

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
  TerminalCommandSchema,
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
  BrowserNavigateSchema,
  BrowserBackSchema,
  BrowserForwardSchema,
  BrowserReloadSchema,
  BrowserStopSchema,
  BrowserSelectElementStartSchema,
  BrowserSelectElementCancelSchema,
  BrowserBoundsSchema,
  BrowserDestroySchema,
  BrowserDevToolsSchema,
  BrowserShowSchema,
  BrowserHideSchema,
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

// Agent thinking content (extended thinking)
export const AgentThinkingSchema = z.object({
  type: z.literal('agent:thinking'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  thinking: z.string(),
  thinking_duration_ms: z.number().optional(),
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
  tool_id: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
});

export const ToolEndSchema = z.object({
  type: z.literal('tool:end'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  message_id: z.string(),
  tool_id: z.string(),
  tool_name: z.string(),
  tool_output: z.unknown(),
  success: z.boolean(),
});

// Permission request (from extension to webview)
export const PermissionRequestSchema = z.object({
  type: z.literal('permission:request'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  request_id: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
});

// Input mode changed (from extension to webview)
export const InputModeChangedSchema = z.object({
  type: z.literal('inputMode:changed'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  mode: InputModeSchema,
});

// Thinking mode changed (from extension to webview)
export const ThinkingModeChangedSchema = z.object({
  type: z.literal('thinking:changed'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  mode: ThinkingModeSchema,
});

// Model changed (from extension to webview)
export const ModelChangedSchema = z.object({
  type: z.literal('model:changed'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  model: ModelSchema,
});

// Panel command (from extension to webview)
export const PanelCommandTypeSchema = z.enum(['quick-open']);

export const PanelCommandSchema = z.object({
  type: z.literal('panel:command'),
  uuid: UUIDSchema,
  command: PanelCommandTypeSchema,
});

// Panel visibility (sent when VS Code panel becomes visible after being hidden)
export const PanelVisibleSchema = z.object({
  type: z.literal('panel:visible'),
  uuid: UUIDSchema,
});

// Terminal - Shell type enum
export const ShellTypeSchema = z.enum(['bash', 'zsh', 'fish', 'pwsh', 'cmd', 'unknown']);

// Terminal - Capabilities state
export const TerminalCapabilitiesStateSchema = z.object({
  cwd_detection: z.boolean(),
  command_detection: z.boolean(),
  shell_integration: z.boolean(),
});

// Terminal - Legacy output (for backwards compat)
export const TerminalOutputSchema = z.object({
  type: z.literal('terminal:output'),
  uuid: UUIDSchema,
  session_id: z.string(),
  data: z.string(),
});

// PTY Terminal - Raw data stream
export const TerminalDataSchema = z.object({
  type: z.literal('terminal:data'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  data: z.string(),
});

// PTY Terminal - Created with full PTY info
export const TerminalCreatedSchema = z.object({
  type: z.literal('terminal:created'),
  uuid: UUIDSchema,
  session_id: z.string(),
  terminal_id: z.string(),
  name: z.string(),
  pid: z.number().optional(),
  cwd: z.string().optional(),
  shell_type: ShellTypeSchema.optional(),
  capabilities: TerminalCapabilitiesStateSchema.optional(),
});

// PTY Terminal - Exited
export const TerminalExitedSchema = z.object({
  type: z.literal('terminal:exited'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  exit_code: z.number().optional(),
});

// PTY Terminal - CWD changed (from shell integration)
export const TerminalCwdChangedSchema = z.object({
  type: z.literal('terminal:cwd'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  cwd: z.string(),
});

// PTY Terminal - Command started (from shell integration)
export const TerminalCommandStartSchema = z.object({
  type: z.literal('terminal:command:start'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  command_line: z.string().optional(),
});

// PTY Terminal - Command ended (from shell integration)
export const TerminalCommandEndSchema = z.object({
  type: z.literal('terminal:command:end'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  command_line: z.string().optional(),
  exit_code: z.number().optional(),
});

// PTY Terminal - Capabilities changed
export const TerminalCapabilitiesChangedSchema = z.object({
  type: z.literal('terminal:capabilities'),
  uuid: UUIDSchema,
  terminal_id: z.string(),
  capabilities: TerminalCapabilitiesStateSchema,
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

/** Node in the file tree */
export const FileNodeSchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  isFile: z.boolean(),
});

export const FileTreeResponseSchema = z.object({
  type: z.literal('file:tree:response'),
  uuid: UUIDSchema,
  request_uuid: z.string(),
  /** The path that was queried */
  path: z.string(),
  /** Children of the path */
  children: z.array(FileNodeSchema),
});

export const FileTreeErrorSchema = z.object({
  type: z.literal('file:tree:error'),
  uuid: UUIDSchema,
  request_uuid: z.string(),
  error: z.string(),
});

/** Flat list entry for file:list:response */
export const FileListEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean().optional(),
});

export const FileListResponseSchema = z.object({
  type: z.literal('file:list:response'),
  uuid: UUIDSchema,
  request_uuid: z.string(),
  /** All files in the workspace (recursively) */
  files: z.array(FileListEntrySchema),
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

export const ConversationLoadedSchema = z.object({
  type: z.literal('conversation:loaded'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  title: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      timestamp: z.number(),
    })
  ),
});

export const ConversationRewoundSchema = z.object({
  type: z.literal('conversation:rewound'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,
  /** New session ID after forking (for future messages) */
  new_session_id: z.string(),
  /** The message ID we rewound to */
  rewind_to_message_id: z.string(),
  /** Messages remaining after rewind */
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      timestamp: z.number(),
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

// ═══════════════════════════════════════════════════════════════
// BROWSER (Extension → Webview)
// ═══════════════════════════════════════════════════════════════

// React element context (from element selection)
export const ReactElementContextSchema = z.object({
  // React component info
  componentName: z.string(),
  filePath: z.string(),
  lineNumber: z.number(),
  props: z.record(z.unknown()),
  componentStack: z.array(z.string()),
  // DOM info
  tagName: z.string(),
  selector: z.string(),
  outerHTML: z.string(),
  // Display helper
  displayName: z.string(),
});

// Browser view created
export const BrowserCreatedSchema = z.object({
  type: z.literal('browser:created'),
  uuid: UUIDSchema,
  viewId: z.string(),
});

// Navigation state update
export const BrowserNavigatedSchema = z.object({
  type: z.literal('browser:navigated'),
  uuid: UUIDSchema,
  url: z.string(),
  title: z.string(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isLoading: z.boolean(),
});

// Element selected via React-grab
export const BrowserElementSelectedSchema = z.object({
  type: z.literal('browser:element-selected'),
  uuid: UUIDSchema,
  element: ReactElementContextSchema,
});

// Loading state changed
export const BrowserLoadingSchema = z.object({
  type: z.literal('browser:loading'),
  uuid: UUIDSchema,
  isLoading: z.boolean(),
});

// Browser error
export const BrowserErrorSchema = z.object({
  type: z.literal('browser:error'),
  uuid: UUIDSchema,
  error: z.string(),
  code: z.string().optional(),
});

// Browser destroyed
export const BrowserDestroyedSchema = z.object({
  type: z.literal('browser:destroyed'),
  uuid: UUIDSchema,
});

// Browser open command (from extension to open browser panel and navigate)
export const BrowserOpenSchema = z.object({
  type: z.literal('browser:open'),
  uuid: UUIDSchema,
  /** URL to navigate to (defaults to about:blank if not provided) */
  url: z.string().optional(),
});

// Browser close command (from extension to close browser panel)
export const BrowserCloseSchema = z.object({
  type: z.literal('browser:close'),
  uuid: UUIDSchema,
});

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
  TerminalOutputSchema,
  TerminalDataSchema,
  TerminalCreatedSchema,
  TerminalExitedSchema,
  TerminalCwdChangedSchema,
  TerminalCommandStartSchema,
  TerminalCommandEndSchema,
  TerminalCapabilitiesChangedSchema,
  // Files
  FileContentSchema,
  FileChangedSchema,
  FileWrittenSchema,
  FileTreeResponseSchema,
  FileTreeErrorSchema,
  FileListResponseSchema,
  // Conversation
  ConversationCreatedSchema,
  ConversationDeletedSchema,
  ConversationListSchema,
  ConversationLoadedSchema,
  ConversationRewoundSchema,
  // Error
  ErrorSchema,
  // Browser
  BrowserCreatedSchema,
  BrowserNavigatedSchema,
  BrowserElementSelectedSchema,
  BrowserLoadingSchema,
  BrowserErrorSchema,
  BrowserDestroyedSchema,
  BrowserOpenSchema,
  BrowserCloseSchema,
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
export type LoadConversation = z.infer<typeof LoadConversationSchema>;
export type RewindConversation = z.infer<typeof RewindConversationSchema>;
export type UpdateConversationTitle = z.infer<typeof UpdateConversationTitleSchema>;
export type AgentStart = z.infer<typeof AgentStartSchema>;
export type AgentStop = z.infer<typeof AgentStopSchema>;
export type AgentPause = z.infer<typeof AgentPauseSchema>;
export type AgentResume = z.infer<typeof AgentResumeSchema>;
export type TerminalCreate = z.infer<typeof TerminalCreateSchema>;
export type TerminalClose = z.infer<typeof TerminalCloseSchema>;
export type TerminalCommand = z.infer<typeof TerminalCommandSchema>;
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
export type Model = z.infer<typeof ModelSchema>;
// Browser (Webview → Extension)
export type BrowserCreate = z.infer<typeof BrowserCreateSchema>;
export type BrowserNavigate = z.infer<typeof BrowserNavigateSchema>;
export type BrowserBack = z.infer<typeof BrowserBackSchema>;
export type BrowserForward = z.infer<typeof BrowserForwardSchema>;
export type BrowserReload = z.infer<typeof BrowserReloadSchema>;
export type BrowserStop = z.infer<typeof BrowserStopSchema>;
export type BrowserSelectElementStart = z.infer<typeof BrowserSelectElementStartSchema>;
export type BrowserSelectElementCancel = z.infer<typeof BrowserSelectElementCancelSchema>;
export type BrowserBounds = z.infer<typeof BrowserBoundsSchema>;
export type BrowserDestroy = z.infer<typeof BrowserDestroySchema>;
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
export type ToolStart = z.infer<typeof ToolStartSchema>;
export type ToolEnd = z.infer<typeof ToolEndSchema>;
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;
export type InputModeChanged = z.infer<typeof InputModeChangedSchema>;
export type InputMode = z.infer<typeof InputModeSchema>;
export type ThinkingModeChanged = z.infer<typeof ThinkingModeChangedSchema>;
export type ThinkingMode = z.infer<typeof ThinkingModeSchema>;
export type ModelChanged = z.infer<typeof ModelChangedSchema>;
export type PanelCommandType = z.infer<typeof PanelCommandTypeSchema>;
export type PanelCommand = z.infer<typeof PanelCommandSchema>;
export type PanelVisible = z.infer<typeof PanelVisibleSchema>;
export type ShellType = z.infer<typeof ShellTypeSchema>;
export type TerminalCapabilitiesState = z.infer<typeof TerminalCapabilitiesStateSchema>;
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;
export type TerminalData = z.infer<typeof TerminalDataSchema>;
export type TerminalCreated = z.infer<typeof TerminalCreatedSchema>;
export type TerminalExited = z.infer<typeof TerminalExitedSchema>;
export type TerminalCwdChanged = z.infer<typeof TerminalCwdChangedSchema>;
export type TerminalCommandStart = z.infer<typeof TerminalCommandStartSchema>;
export type TerminalCommandEnd = z.infer<typeof TerminalCommandEndSchema>;
export type TerminalCapabilitiesChanged = z.infer<typeof TerminalCapabilitiesChangedSchema>;
export type FileContent = z.infer<typeof FileContentSchema>;
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
export type ConversationLoaded = z.infer<typeof ConversationLoadedSchema>;
export type ConversationRewound = z.infer<typeof ConversationRewoundSchema>;
export type ProtocolError = z.infer<typeof ErrorSchema>;
// Browser (Extension → Webview)
export type ReactElementContext = z.infer<typeof ReactElementContextSchema>;
export type BrowserCreated = z.infer<typeof BrowserCreatedSchema>;
export type BrowserNavigated = z.infer<typeof BrowserNavigatedSchema>;
export type BrowserElementSelected = z.infer<typeof BrowserElementSelectedSchema>;
export type BrowserLoading = z.infer<typeof BrowserLoadingSchema>;
export type BrowserError = z.infer<typeof BrowserErrorSchema>;
export type BrowserDestroyed = z.infer<typeof BrowserDestroyedSchema>;
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
  | TerminalOutput
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
): msg is FileContent | FileChanged | FileWritten | FileTreeResponse | FileTreeError | FileListResponse {
  return msg.type.startsWith('file:');
}

export function isProtocolBrowserMessage(
  msg: ExtensionMessage
): msg is BrowserCreated | BrowserNavigated | BrowserElementSelected | BrowserLoading | BrowserError | BrowserDestroyed | BrowserOpen | BrowserClose {
  return msg.type.startsWith('browser:');
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Generate UUID
// ═══════════════════════════════════════════════════════════════

export function generateUUID(): string {
  return crypto.randomUUID();
}
