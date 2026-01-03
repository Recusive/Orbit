import { z } from 'zod';

/**
 * SDK Boundary Schemas - Corrected to match Claude Agent SDK documentation
 *
 * Uses .looseObject() for forward compatibility, but fields match SDK types exactly.
 * Reference: https://docs.anthropic.com/en/docs/agent-sdk/typescript
 */

// ============================================================================
// Enums from SDK
// ============================================================================

export const ApiKeySourceSchema = z.enum(['user', 'project', 'org', 'temporary']);
export type ApiKeySource = z.infer<typeof ApiKeySourceSchema>;

export const PermissionModeSchema = z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan']);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

// ============================================================================
// Usage Schemas (matches SDK NonNullableUsage)
// ============================================================================

/**
 * Usage statistics - SDK sends these as required (non-nullable) in result messages
 */
export const SDKUsageSchema = z.looseObject({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});
export type SDKUsage = z.infer<typeof SDKUsageSchema>;

/**
 * Per-model usage breakdown - all fields required per SDK docs
 */
export const SDKModelUsageEntrySchema = z.looseObject({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  webSearchRequests: z.number(),
  costUSD: z.number(),
  contextWindow: z.number(),
});
export type SDKModelUsageEntry = z.infer<typeof SDKModelUsageEntrySchema>;

export const SDKModelUsageSchema = z.record(z.string(), SDKModelUsageEntrySchema);
export type SDKModelUsage = z.infer<typeof SDKModelUsageSchema>;

// ============================================================================
// Permission Denial Schema
// ============================================================================

export const SDKPermissionDenialSchema = z.looseObject({
  tool_name: z.string(),
  tool_use_id: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
});
export type SDKPermissionDenial = z.infer<typeof SDKPermissionDenialSchema>;

// ============================================================================
// Content Block Schemas (from Anthropic SDK)
// ============================================================================

export const SDKTextBlockSchema = z.looseObject({
  type: z.literal('text'),
  text: z.string(),
});
export type SDKTextBlock = z.infer<typeof SDKTextBlockSchema>;

export const SDKThinkingBlockSchema = z.looseObject({
  type: z.literal('thinking'),
  thinking: z.string(),
});
export type SDKThinkingBlock = z.infer<typeof SDKThinkingBlockSchema>;

export const SDKToolUseBlockSchema = z.looseObject({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});
export type SDKToolUseBlock = z.infer<typeof SDKToolUseBlockSchema>;

export const SDKContentBlockSchema = z.union([
  SDKTextBlockSchema,
  SDKThinkingBlockSchema,
  SDKToolUseBlockSchema,
]);
export type SDKContentBlock = z.infer<typeof SDKContentBlockSchema>;

// ============================================================================
// MCP Server Status
// ============================================================================

export const SDKMcpServerStatusSchema = z.looseObject({
  name: z.string(),
  status: z.string(),
});
export type SDKMcpServerStatus = z.infer<typeof SDKMcpServerStatusSchema>;

// ============================================================================
// Stream Event Schemas (from Anthropic SDK RawMessageStreamEvent)
// ============================================================================

export const SDKStreamDeltaSchema = z.looseObject({
  type: z.string().optional(), // Not present on message_delta
  text: z.string().optional(),
  thinking: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  stop_sequence: z.string().nullable().optional(),
});
export type SDKStreamDelta = z.infer<typeof SDKStreamDeltaSchema>;

export const SDKStreamContentBlockSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  thinking: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});
export type SDKStreamContentBlock = z.infer<typeof SDKStreamContentBlockSchema>;

export const SDKStreamMessageSchema = z.looseObject({
  model: z.string().optional(),
  id: z.string().optional(),
  type: z.string().optional(),
  role: z.string().optional(),
  content: z.array(SDKContentBlockSchema).optional(),
  stop_reason: z.string().nullable().optional(),
  stop_sequence: z.string().nullable().optional(),
  usage: SDKUsageSchema.optional(),
});
export type SDKStreamMessage = z.infer<typeof SDKStreamMessageSchema>;

export const SDKStreamEventPayloadSchema = z.looseObject({
  type: z.string(),
  index: z.number().optional(),
  delta: SDKStreamDeltaSchema.optional(),
  usage: SDKUsageSchema.optional(),
  message: SDKStreamMessageSchema.optional(),
  content_block: SDKStreamContentBlockSchema.optional(),
});
export type SDKStreamEventPayload = z.infer<typeof SDKStreamEventPayloadSchema>;

// ============================================================================
// Top-Level Message Schemas (matches SDK exactly)
// ============================================================================

/**
 * System message - initialization
 * SDK docs: All fields required except where noted
 */
export const SDKSystemMessageSchema = z.looseObject({
  type: z.literal('system'),
  subtype: z.literal('init'),
  uuid: z.string(),
  session_id: z.string(),
  apiKeySource: ApiKeySourceSchema,
  cwd: z.string(),
  tools: z.array(z.string()),
  mcp_servers: z.array(SDKMcpServerStatusSchema),
  model: z.string(),
  permissionMode: PermissionModeSchema,
  slash_commands: z.array(z.string()),
  output_style: z.string(),
  parent_tool_use_id: z.string().nullable().optional(),
});
export type SDKSystemMessage = z.infer<typeof SDKSystemMessageSchema>;

/**
 * Compact boundary message (system subtype)
 */
export const SDKCompactBoundaryMessageSchema = z.looseObject({
  type: z.literal('system'),
  subtype: z.literal('compact_boundary'),
  uuid: z.string(),
  session_id: z.string(),
  compact_metadata: z.looseObject({
    trigger: z.enum(['manual', 'auto']),
    pre_tokens: z.number(),
  }),
});
export type SDKCompactBoundaryMessage = z.infer<typeof SDKCompactBoundaryMessageSchema>;

/**
 * Stream event message - partial assistant response
 */
export const SDKStreamEventMessageSchema = z.looseObject({
  type: z.literal('stream_event'),
  event: SDKStreamEventPayloadSchema,
  parent_tool_use_id: z.string().nullable(),
  uuid: z.string(),
  session_id: z.string(),
});
export type SDKStreamEventMessage = z.infer<typeof SDKStreamEventMessageSchema>;

/**
 * Assistant message - complete response
 */
export const SDKAssistantMessageSchema = z.looseObject({
  type: z.literal('assistant'),
  uuid: z.string(),
  session_id: z.string(),
  message: z.looseObject({
    model: z.string().optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    role: z.string().optional(),
    content: z.array(SDKContentBlockSchema).optional(),
    stop_reason: z.string().nullable().optional(),
    stop_sequence: z.string().nullable().optional(),
    usage: SDKUsageSchema.optional(),
  }),
  parent_tool_use_id: z.string().nullable(),
});
export type SDKAssistantMessage = z.infer<typeof SDKAssistantMessageSchema>;

/**
 * User message - user input or tool results
 */
export const SDKUserMessageSchema = z.looseObject({
  type: z.literal('user'),
  uuid: z.string().optional(), // Optional per SDK docs
  session_id: z.string(),
  message: z.looseObject({
    role: z.literal('user'),
    content: z.union([z.string(), z.array(z.unknown())]),
  }),
  parent_tool_use_id: z.string().nullable(),
});
export type SDKUserMessage = z.infer<typeof SDKUserMessageSchema>;

/**
 * Result message - success variant
 */
export const SDKResultSuccessMessageSchema = z.looseObject({
  type: z.literal('result'),
  subtype: z.literal('success'),
  uuid: z.string(),
  session_id: z.string(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  is_error: z.boolean(),
  num_turns: z.number(),
  result: z.string(),
  total_cost_usd: z.number(),
  usage: SDKUsageSchema,
  modelUsage: SDKModelUsageSchema,
  permission_denials: z.array(SDKPermissionDenialSchema),
  structured_output: z.unknown().optional(), // Only on success
});
export type SDKResultSuccessMessage = z.infer<typeof SDKResultSuccessMessageSchema>;

/**
 * Result message - error variant
 */
export const SDKResultErrorMessageSchema = z.looseObject({
  type: z.literal('result'),
  subtype: z.enum([
    'error_max_turns',
    'error_during_execution',
    'error_max_budget_usd',
    'error_max_structured_output_retries',
  ]),
  uuid: z.string(),
  session_id: z.string(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  is_error: z.boolean(),
  num_turns: z.number(),
  total_cost_usd: z.number(),
  usage: SDKUsageSchema,
  modelUsage: SDKModelUsageSchema,
  permission_denials: z.array(SDKPermissionDenialSchema),
  errors: z.array(z.string()), // Only on error subtypes
});
export type SDKResultErrorMessage = z.infer<typeof SDKResultErrorMessageSchema>;

/**
 * Combined result message (discriminated union)
 */
export const SDKResultMessageSchema = z.discriminatedUnion('subtype', [
  SDKResultSuccessMessageSchema,
  SDKResultErrorMessageSchema,
]);
export type SDKResultMessage = z.infer<typeof SDKResultMessageSchema>;

// ============================================================================
// Union of all SDK message types
// ============================================================================

export const SDKMessageSchema = z.union([
  SDKSystemMessageSchema,
  SDKCompactBoundaryMessageSchema,
  SDKStreamEventMessageSchema,
  SDKAssistantMessageSchema,
  SDKUserMessageSchema,
  SDKResultMessageSchema,
]);
export type SDKMessage = z.infer<typeof SDKMessageSchema>;

// ============================================================================
// Tool Result Schema (for user messages containing tool results)
// ============================================================================

export const SDKToolResultSchema = z.looseObject({
  tool_use_id: z.string(),
  content: z.unknown(),
  is_error: z.boolean().optional(),
});
export type SDKToolResult = z.infer<typeof SDKToolResultSchema>;

// ============================================================================
// Utility Types and Functions
// ============================================================================

/**
 * Safe parse result type - matches Zod's safeParse return structure
 */
export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: z.ZodError };

/**
 * Helper to process SDK responses with boundary validation
 * First validates loosely, then transforms to strict internal type
 */
export function processSDKResponse<T>(
  raw: unknown,
  looseSchema: z.ZodType,
  strictSchema: z.ZodType<T>,
  transform: (loose: unknown) => unknown
): SafeParseResult<T> {
  const looseResult = looseSchema.safeParse(raw);
  if (!looseResult.success) {
    return { success: false, error: looseResult.error };
  }

  const transformed = transform(looseResult.data);
  const strictResult = strictSchema.safeParse(transformed);
  if (!strictResult.success) {
    return { success: false, error: strictResult.error };
  }
  return { success: true, data: strictResult.data };
}

/**
 * Get the appropriate schema for a message type
 */
export function getSDKMessageSchema(type: string, subtype?: string): z.ZodType {
  switch (type) {
    case 'system':
      if (subtype === 'compact_boundary') {
        return SDKCompactBoundaryMessageSchema;
      }
      return SDKSystemMessageSchema;
    case 'stream_event':
      return SDKStreamEventMessageSchema;
    case 'assistant':
      return SDKAssistantMessageSchema;
    case 'user':
      return SDKUserMessageSchema;
    case 'result':
      return SDKResultMessageSchema;
    default:
      return SDKMessageSchema;
  }
}
