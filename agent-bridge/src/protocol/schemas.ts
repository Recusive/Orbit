/**
 * Zod schemas for runtime validation of IPC messages
 * Uses strict mode to reject unknown keys and branded types for type safety
 */

import { ModelSchema, CommandScopeSchema, DecisionSchema } from '@orbit/shared-schemas';
import { z } from 'zod';

import type { CanvasEdge, CanvasNode } from '../canvas/types/types.js';

// Re-export shared schemas
export {
  ModelSchema,
  CommandScopeSchema,
  DecisionSchema,
  type Model,
  type CommandScope,
  type Decision,
} from '@orbit/shared-schemas';

// ============================================================================
// Branded Primitive Types (Nominal Typing)
// Prevents mixing different string-based IDs even when they're the same primitive
// ============================================================================

/** Session ID - unique identifier for a conversation session */
export const SessionIdSchema = z.string().min(1).brand<'SessionId'>();
export type SessionId = z.infer<typeof SessionIdSchema>;

/** SDK Session ID - Claude SDK's internal session identifier */
export const SDKSessionIdSchema = z.string().min(1).brand<'SDKSessionId'>();
export type SDKSessionId = z.infer<typeof SDKSessionIdSchema>;

/** Request ID - unique identifier for permission requests */
export const RequestIdSchema = z.string().min(1).brand<'RequestId'>();
export type RequestId = z.infer<typeof RequestIdSchema>;

/** Workspace Path - file system path to workspace directory */
export const WorkspacePathSchema = z.string().min(1).brand<'WorkspacePath'>();
export type WorkspacePath = z.infer<typeof WorkspacePathSchema>;

/** Agent Name - unique identifier for a subagent definition */
export const AgentNameSchema = z.string().min(1).brand<'AgentName'>();
export type AgentName = z.infer<typeof AgentNameSchema>;

/** Command Name - unique identifier for a slash command */
export const CommandNameSchema = z.string().min(1).brand<'CommandName'>();
export type CommandName = z.infer<typeof CommandNameSchema>;

// ============================================================================
// Enums and Primitives (bridge-specific)
// ============================================================================

export const AttachmentTypeSchema = z.enum(['document', 'image', 'text']);
export type AttachmentType = z.infer<typeof AttachmentTypeSchema>;

export const SubagentModelSchema = z.enum([
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'haiku',
  'inherit',
]);
export type SubagentModel = z.infer<typeof SubagentModelSchema>;

// ============================================================================
// Shared Schemas (all using .strict())
// ============================================================================

export const SessionConfigSchema = z
  .object({
    cwd: z.string().optional(),
    thinkingEnabled: z.boolean().optional(),
    maxThinkingTokens: z.number().optional(),
    planEnabled: z.boolean().optional(),
    acceptEnabled: z.boolean().optional(),
    model: ModelSchema.optional(),
    // Resume an existing SDK session (for session continuity after app restart).
    // NOTE: This is NOT used for rewind scenarios. Rewind creates a fresh session
    // and prepends truncated context to the first message instead.
    resumeSessionId: z.string().optional(),
  })
  .strict();
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export const AttachmentSourceSchema = z
  .object({
    type: z.literal('base64'),
    mediaType: z.string(),
    data: z.string(),
  })
  .strict();
export type AttachmentSource = z.infer<typeof AttachmentSourceSchema>;

export const AttachmentContentBlockSchema = z
  .object({
    type: AttachmentTypeSchema,
    source: AttachmentSourceSchema.optional(),
    text: z.string().optional(),
    name: z.string().optional(),
    filePath: z.string().optional(),
    lineStart: z.number().optional(),
    lineEnd: z.number().optional(),
    terminalName: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .strict();
export type AttachmentContentBlock = z.infer<typeof AttachmentContentBlockSchema>;

export const SubagentDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    prompt: z.string(),
    tools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    model: SubagentModelSchema.optional(),
  })
  .strict();
export type SubagentDefinition = z.infer<typeof SubagentDefinitionSchema>;

export const SlashCommandDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    content: z.string(),
    allowedTools: z.array(z.string()).optional(),
    argumentHint: z.string().optional(),
    model: ModelSchema.optional(),
    scope: CommandScopeSchema,
    readonly: z.boolean().optional(),
  })
  .strict();
export type SlashCommandDefinition = z.infer<typeof SlashCommandDefinitionSchema>;

export const PermissionResponseSchema = z
  .object({
    requestId: z.string(),
    decision: DecisionSchema,
    always: z.boolean(),
    answers: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type PermissionResponse = z.infer<typeof PermissionResponseSchema>;

// ============================================================================
// Request Schemas (Rust → Node.js) - all using .strict()
// ============================================================================

export const CreateSessionRequestSchema = z
  .object({
    type: z.literal('create_session'),
    sessionId: z.string(),
    config: SessionConfigSchema.optional(),
  })
  .strict();
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const DeleteSessionRequestSchema = z
  .object({
    type: z.literal('delete_session'),
    sessionId: z.string(),
  })
  .strict();
export type DeleteSessionRequest = z.infer<typeof DeleteSessionRequestSchema>;

export const SendMessageRequestSchema = z
  .object({
    type: z.literal('send_message'),
    sessionId: z.string(),
    message: z.string(),
    attachments: z.array(AttachmentContentBlockSchema).optional(),
    /**
     * UUID of the previous message in the conversation chain.
     * Used for Claude Code-style rewind: after rewinding, the next message
     * should have parentUuid set to the message we rewound to.
     * - null for the first message in a conversation
     * - undefined if not specified (default behavior)
     *
     * TODO(code-review/cycle-1#6): parentUuid is defined in the schema but not yet
     * wired through to the SDK via sendMessage(). The forkSessionAt flow reads
     * parentUuid from JSONL data, but the send_message handler in index.ts does
     * not forward this field to session-manager. Wire to SDK or remove if unneeded.
     */
    parentUuid: z.string().nullish(),
  })
  .strict();
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const InterruptRequestSchema = z
  .object({
    type: z.literal('interrupt'),
    sessionId: z.string(),
  })
  .strict();
export type InterruptRequest = z.infer<typeof InterruptRequestSchema>;

export const PermissionResponseRequestSchema = z
  .object({
    type: z.literal('permission_response'),
    response: PermissionResponseSchema,
  })
  .strict();
export type PermissionResponseRequest = z.infer<typeof PermissionResponseRequestSchema>;

export const SetThinkingModeRequestSchema = z
  .object({
    type: z.literal('set_thinking_mode'),
    sessionId: z.string(),
    enabled: z.boolean(),
    maxTokens: z.number().optional(),
  })
  .strict();
export type SetThinkingModeRequest = z.infer<typeof SetThinkingModeRequestSchema>;

export const GetThinkingModeRequestSchema = z
  .object({
    type: z.literal('get_thinking_mode'),
    sessionId: z.string(),
  })
  .strict();
export type GetThinkingModeRequest = z.infer<typeof GetThinkingModeRequestSchema>;

export const SetEffortLevelRequestSchema = z
  .object({
    type: z.literal('set_effort_level'),
    sessionId: z.string(),
    effort: z.enum(['low', 'medium', 'high', 'max']),
  })
  .strict();
export type SetEffortLevelRequest = z.infer<typeof SetEffortLevelRequestSchema>;

export const SetModelRequestSchema = z
  .object({
    type: z.literal('set_model'),
    sessionId: z.string(),
    model: ModelSchema,
  })
  .strict();
export type SetModelRequest = z.infer<typeof SetModelRequestSchema>;

export const SetPlanModeRequestSchema = z
  .object({
    type: z.literal('set_plan_mode'),
    sessionId: z.string(),
    enabled: z.boolean(),
  })
  .strict();
export type SetPlanModeRequest = z.infer<typeof SetPlanModeRequestSchema>;

export const GetPlanModeRequestSchema = z
  .object({
    type: z.literal('get_plan_mode'),
    sessionId: z.string(),
  })
  .strict();
export type GetPlanModeRequest = z.infer<typeof GetPlanModeRequestSchema>;

export const SetAcceptModeRequestSchema = z
  .object({
    type: z.literal('set_accept_mode'),
    sessionId: z.string(),
    enabled: z.boolean(),
  })
  .strict();
export type SetAcceptModeRequest = z.infer<typeof SetAcceptModeRequestSchema>;

export const GetAcceptModeRequestSchema = z
  .object({
    type: z.literal('get_accept_mode'),
    sessionId: z.string(),
  })
  .strict();
export type GetAcceptModeRequest = z.infer<typeof GetAcceptModeRequestSchema>;

export const IsSessionReadyRequestSchema = z
  .object({
    type: z.literal('is_session_ready'),
    sessionId: z.string(),
  })
  .strict();
export type IsSessionReadyRequest = z.infer<typeof IsSessionReadyRequestSchema>;

export const GetSDKSessionIdRequestSchema = z
  .object({
    type: z.literal('get_sdk_session_id'),
    sessionId: z.string(),
  })
  .strict();
export type GetSDKSessionIdRequest = z.infer<typeof GetSDKSessionIdRequestSchema>;

export const GetStoredSessionRequestSchema = z
  .object({
    type: z.literal('get_stored_session'),
    sessionId: z.string(),
  })
  .strict();
export type GetStoredSessionRequest = z.infer<typeof GetStoredSessionRequestSchema>;

export const CleanupSessionsRequestSchema = z
  .object({
    type: z.literal('cleanup_sessions'),
    maxAgeDays: z.number().optional(),
  })
  .strict();
export type CleanupSessionsRequest = z.infer<typeof CleanupSessionsRequestSchema>;

export const ListAgentsRequestSchema = z
  .object({
    type: z.literal('list_agents'),
    workspacePath: z.string(),
  })
  .strict();
export type ListAgentsRequest = z.infer<typeof ListAgentsRequestSchema>;

export const GetAgentRequestSchema = z
  .object({
    type: z.literal('get_agent'),
    workspacePath: z.string(),
    name: z.string(),
  })
  .strict();
export type GetAgentRequest = z.infer<typeof GetAgentRequestSchema>;

export const CreateAgentRequestSchema = z
  .object({
    type: z.literal('create_agent'),
    workspacePath: z.string(),
    agent: SubagentDefinitionSchema,
  })
  .strict();
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

export const UpdateAgentRequestSchema = z
  .object({
    type: z.literal('update_agent'),
    workspacePath: z.string(),
    originalName: z.string(),
    agent: SubagentDefinitionSchema,
  })
  .strict();
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>;

export const DeleteAgentRequestSchema = z
  .object({
    type: z.literal('delete_agent'),
    workspacePath: z.string(),
    name: z.string(),
  })
  .strict();
export type DeleteAgentRequest = z.infer<typeof DeleteAgentRequestSchema>;

export const ListCommandsRequestSchema = z
  .object({
    type: z.literal('list_commands'),
    workspacePath: z.string(),
  })
  .strict();
export type ListCommandsRequest = z.infer<typeof ListCommandsRequestSchema>;

export const GetCommandRequestSchema = z
  .object({
    type: z.literal('get_command'),
    workspacePath: z.string(),
    name: z.string(),
    scope: CommandScopeSchema,
  })
  .strict();
export type GetCommandRequest = z.infer<typeof GetCommandRequestSchema>;

export const CreateCommandRequestSchema = z
  .object({
    type: z.literal('create_command'),
    workspacePath: z.string(),
    command: SlashCommandDefinitionSchema,
  })
  .strict();
export type CreateCommandRequest = z.infer<typeof CreateCommandRequestSchema>;

export const UpdateCommandRequestSchema = z
  .object({
    type: z.literal('update_command'),
    workspacePath: z.string(),
    originalName: z.string(),
    command: SlashCommandDefinitionSchema,
  })
  .strict();
export type UpdateCommandRequest = z.infer<typeof UpdateCommandRequestSchema>;

export const DeleteCommandRequestSchema = z
  .object({
    type: z.literal('delete_command'),
    workspacePath: z.string(),
    name: z.string(),
    scope: CommandScopeSchema,
  })
  .strict();
export type DeleteCommandRequest = z.infer<typeof DeleteCommandRequestSchema>;

// ============================================================================
// Skill Schemas
// ============================================================================

export const SkillSourceSchema = z.enum(['project', 'user']);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    source: SkillSourceSchema,
    triggers: z.array(z.string()).optional(),
    filePath: z.string().optional(),
  })
  .strict();
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const ListSkillsRequestSchema = z
  .object({
    type: z.literal('list_skills'),
    workspacePath: z.string(),
  })
  .strict();
export type ListSkillsRequest = z.infer<typeof ListSkillsRequestSchema>;

export const ForkSessionOptionsSchema = z
  .object({
    keepAlive: z.boolean().optional(),
    checkpointPrompt: z.string().optional(),
    displayName: z.string().optional(),
  })
  .strict();
export type ForkSessionOptions = z.infer<typeof ForkSessionOptionsSchema>;

export const ForkSessionRequestSchema = z
  .object({
    type: z.literal('fork_session'),
    sessionId: z.string(),
    options: ForkSessionOptionsSchema.optional(),
  })
  .strict();
export type ForkSessionRequest = z.infer<typeof ForkSessionRequestSchema>;

export const RewindFilesRequestSchema = z
  .object({
    type: z.literal('rewind_files'),
    sessionId: z.string(),
    checkpointId: z.string(),
  })
  .strict();
export type RewindFilesRequest = z.infer<typeof RewindFilesRequestSchema>;

export const ForkSessionAtRequestSchema = z
  .object({
    type: z.literal('fork_session_at'),
    sessionId: z.string(),
    atMessageUuid: z.string(),
  })
  .strict();
export type ForkSessionAtRequest = z.infer<typeof ForkSessionAtRequestSchema>;

export const GenerateAgentDefinitionRequestSchema = z
  .object({
    type: z.literal('generate_agent_definition'),
    description: z.string(),
  })
  .strict();
export type GenerateAgentDefinitionRequest = z.infer<typeof GenerateAgentDefinitionRequestSchema>;

export const GenerateCommandDefinitionRequestSchema = z
  .object({
    type: z.literal('generate_command_definition'),
    description: z.string(),
  })
  .strict();
export type GenerateCommandDefinitionRequest = z.infer<
  typeof GenerateCommandDefinitionRequestSchema
>;

export const EnhanceBugReportRequestSchema = z
  .object({
    type: z.literal('enhance_bug_report'),
    description: z.string(),
    messageContent: z.string(),
  })
  .strict();
export type EnhanceBugReportRequest = z.infer<typeof EnhanceBugReportRequestSchema>;

export const ShutdownRequestSchema = z
  .object({
    type: z.literal('shutdown'),
  })
  .strict();
export type ShutdownRequest = z.infer<typeof ShutdownRequestSchema>;

// ============================================================================
// Canvas Schemas
// ============================================================================

export const CanvasSessionConfigSchema = z
  .object({
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    model: z.string().optional(),
    thinkingEnabled: z.boolean().optional(),
    planModeEnabled: z.boolean().optional(),
  })
  .strict();
export type CanvasSessionConfig = z.infer<typeof CanvasSessionConfigSchema>;

export const CanvasStateSchema = z
  .object({
    // ReactFlow nodes/edges — validated with z.custom to ensure each element is
    // a non-null object while preserving CanvasNode/CanvasEdge TypeScript types.
    // Full type definitions live in canvas/types/types.ts; the protocol layer
    // does loose boundary validation without coupling to ReactFlow internals.
    // (Code review: Opus cycle 3, issue #9)
    nodes: z.array(z.custom<CanvasNode>((val) => typeof val === 'object' && val !== null)),
    edges: z.array(z.custom<CanvasEdge>((val) => typeof val === 'object' && val !== null)),
    selectedNodeId: z.string().nullable().optional(),
    selectedNodeType: z.enum(['sandpack', 'page']).optional(),
  })
  .strict();
export type CanvasState = z.infer<typeof CanvasStateSchema>;

export const McpToolResponseSchema = z
  .object({
    requestId: z.string(),
    success: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  })
  .strict();
export type McpToolResponse = z.infer<typeof McpToolResponseSchema>;

// ============================================================================
// Canvas Request Schemas
// ============================================================================

export const CanvasCreateSessionRequestSchema = z
  .object({
    type: z.literal('canvas:create_session'),
    sessionId: z.string(),
    config: CanvasSessionConfigSchema.optional(),
  })
  .strict();
export type CanvasCreateSessionRequest = z.infer<typeof CanvasCreateSessionRequestSchema>;

export const CanvasDeleteSessionRequestSchema = z
  .object({
    type: z.literal('canvas:delete_session'),
    sessionId: z.string(),
  })
  .strict();
export type CanvasDeleteSessionRequest = z.infer<typeof CanvasDeleteSessionRequestSchema>;

export const CanvasSendMessageRequestSchema = z
  .object({
    type: z.literal('canvas:send_message'),
    sessionId: z.string(),
    message: z.string(),
    state: CanvasStateSchema,
  })
  .strict();
export type CanvasSendMessageRequest = z.infer<typeof CanvasSendMessageRequestSchema>;

export const CanvasInterruptRequestSchema = z
  .object({
    type: z.literal('canvas:interrupt'),
    sessionId: z.string(),
  })
  .strict();
export type CanvasInterruptRequest = z.infer<typeof CanvasInterruptRequestSchema>;

export const CanvasToolResponseRequestSchema = z
  .object({
    type: z.literal('canvas:tool_response'),
    sessionId: z.string(),
    response: McpToolResponseSchema,
  })
  .strict();
export type CanvasToolResponseRequest = z.infer<typeof CanvasToolResponseRequestSchema>;

export const BrowserToolResponseRequestSchema = z
  .object({
    type: z.literal('browser:tool_response'),
    sessionId: z.string(),
    response: McpToolResponseSchema,
  })
  .strict();
export type BrowserToolResponseRequest = z.infer<typeof BrowserToolResponseRequestSchema>;

// Combined discriminated union for all requests
export const BridgeRequestSchema = z.discriminatedUnion('type', [
  CreateSessionRequestSchema,
  DeleteSessionRequestSchema,
  SendMessageRequestSchema,
  InterruptRequestSchema,
  PermissionResponseRequestSchema,
  SetThinkingModeRequestSchema,
  GetThinkingModeRequestSchema,
  SetEffortLevelRequestSchema,
  SetModelRequestSchema,
  SetPlanModeRequestSchema,
  GetPlanModeRequestSchema,
  SetAcceptModeRequestSchema,
  GetAcceptModeRequestSchema,
  IsSessionReadyRequestSchema,
  GetSDKSessionIdRequestSchema,
  GetStoredSessionRequestSchema,
  CleanupSessionsRequestSchema,
  ListAgentsRequestSchema,
  GetAgentRequestSchema,
  CreateAgentRequestSchema,
  UpdateAgentRequestSchema,
  DeleteAgentRequestSchema,
  ListCommandsRequestSchema,
  GetCommandRequestSchema,
  CreateCommandRequestSchema,
  UpdateCommandRequestSchema,
  DeleteCommandRequestSchema,
  ListSkillsRequestSchema,
  ForkSessionRequestSchema,
  RewindFilesRequestSchema,
  ForkSessionAtRequestSchema,
  GenerateAgentDefinitionRequestSchema,
  GenerateCommandDefinitionRequestSchema,
  EnhanceBugReportRequestSchema,
  ShutdownRequestSchema,
  CanvasCreateSessionRequestSchema,
  CanvasDeleteSessionRequestSchema,
  CanvasSendMessageRequestSchema,
  CanvasInterruptRequestSchema,
  CanvasToolResponseRequestSchema,
  BrowserToolResponseRequestSchema,
]);
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;

// ============================================================================
// Session Storage Schemas
// ============================================================================

export const StoredSessionSchema = z
  .object({
    sessionId: z.string(),
    sdkSessionId: z.string(),
    createdAt: z.number(),
    lastActiveAt: z.number(),
    workspacePath: z.string().optional(),
    displayName: z.string().optional(),
  })
  .strict();
export type StoredSession = z.infer<typeof StoredSessionSchema>;

export const SessionStorageDataSchema = z
  .object({
    version: z.number(),
    sessions: z.array(StoredSessionSchema),
  })
  .strict();
export type SessionStorageData = z.infer<typeof SessionStorageDataSchema>;

// ============================================================================
// Credentials Schemas
// ============================================================================

// OAuth token schema - allows additional fields from Claude CLI (refreshToken, scopes, etc.)
// expiresAt can be number (timestamp) or string (ISO date or stringified timestamp)
// External API schemas: default strip mode accepts unknown keys without error,
// strips them from output. No .loose()/.catchall() needed since we only read known fields.

export const OAuthTokenSchema = z.object({
  accessToken: z.string().optional(),
  expiresAt: z.union([z.number(), z.string()]).optional(),
  refreshToken: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  subscriptionType: z.string().optional(),
  rateLimitTier: z.string().optional(),
});
export type OAuthToken = z.infer<typeof OAuthTokenSchema>;

export const KeychainCredentialsSchema = z.object({
  claudeAiOauth: OAuthTokenSchema.optional(),
});
export type KeychainCredentials = z.infer<typeof KeychainCredentialsSchema>;

// OAuthRefreshResponseSchema is defined locally in credentials.ts (its sole consumer)
// to avoid cross-file type resolution issues with ESLint's projectService.
