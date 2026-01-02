import { z } from 'zod';

/**
 * SDK Boundary Schemas
 *
 * Comprehensive schemas for Claude Agent SDK messages.
 * All schemas use .looseObject() to allow SDK evolution without breaking.
 *
 * Validated against 51 real SDK messages captured from production.
 * See: agent-bridge/src/__tests__/fixtures/
 */

// ============================================================================
// Base/Shared Schemas
// ============================================================================

/**
 * Usage statistics from SDK - appears in multiple message types
 */
export const SDKUsageSchema = z.looseObject({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  service_tier: z.string().optional(),
  cache_creation: z
    .looseObject({
      ephemeral_5m_input_tokens: z.number().optional(),
      ephemeral_1h_input_tokens: z.number().optional(),
    })
    .optional(),
  server_tool_use: z
    .looseObject({
      web_search_requests: z.number().optional(),
      web_fetch_requests: z.number().optional(),
    })
    .optional(),
});
export type SDKUsage = z.infer<typeof SDKUsageSchema>;

/**
 * Per-model usage breakdown in result messages
 */
export const SDKModelUsageEntrySchema = z.looseObject({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional(),
  webSearchRequests: z.number().optional(),
  costUSD: z.number().optional(),
  contextWindow: z.number().optional(),
});
export type SDKModelUsageEntry = z.infer<typeof SDKModelUsageEntrySchema>;

/**
 * Model usage map - keyed by model ID
 */
export const SDKModelUsageSchema = z.record(z.string(), SDKModelUsageEntrySchema);
export type SDKModelUsage = z.infer<typeof SDKModelUsageSchema>;

// ============================================================================
// Content Block Schemas
// ============================================================================

/**
 * Text content block
 */
export const SDKTextBlockSchema = z.looseObject({
  type: z.literal('text'),
  text: z.string().optional(),
});
export type SDKTextBlock = z.infer<typeof SDKTextBlockSchema>;

/**
 * Thinking content block (extended thinking)
 */
export const SDKThinkingBlockSchema = z.looseObject({
  type: z.literal('thinking'),
  thinking: z.string().optional(),
});
export type SDKThinkingBlock = z.infer<typeof SDKThinkingBlockSchema>;

/**
 * Tool use content block
 */
export const SDKToolUseBlockSchema = z.looseObject({
  type: z.literal('tool_use'),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});
export type SDKToolUseBlock = z.infer<typeof SDKToolUseBlockSchema>;

/**
 * Union of all content block types
 */
export const SDKContentBlockSchema = z.union([
  SDKTextBlockSchema,
  SDKThinkingBlockSchema,
  SDKToolUseBlockSchema,
]);
export type SDKContentBlock = z.infer<typeof SDKContentBlockSchema>;

// ============================================================================
// Stream Event Schemas
// ============================================================================

/**
 * Stream delta - varies by event type
 * - text_delta: has text
 * - thinking_delta: has thinking
 * - message_delta: has stop_reason/stop_sequence (no type field)
 */
export const SDKStreamDeltaSchema = z.looseObject({
  type: z.string().optional(), // Not present on message_delta
  text: z.string().optional(),
  thinking: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  stop_sequence: z.string().nullable().optional(),
});
export type SDKStreamDelta = z.infer<typeof SDKStreamDeltaSchema>;

/**
 * Message in stream event (for message_start)
 */
export const SDKStreamMessageSchema = z.looseObject({
  model: z.string().optional(),
  id: z.string().optional(),
  type: z.string().optional(),
  role: z.string().optional(),
  content: z.array(SDKContentBlockSchema).optional(),
  stop_reason: z.string().nullable().optional(),
  stop_sequence: z.string().nullable().optional(),
  usage: SDKUsageSchema.optional(),
  context_management: z.unknown().nullable().optional(),
});
export type SDKStreamMessage = z.infer<typeof SDKStreamMessageSchema>;

/**
 * Content block in stream event (for content_block_start)
 */
export const SDKStreamContentBlockSchema = z.looseObject({
  type: z.string().optional(),
  text: z.string().optional(),
  thinking: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});
export type SDKStreamContentBlock = z.infer<typeof SDKStreamContentBlockSchema>;

/**
 * Stream event payload - the "event" field in stream_event messages
 * Types: message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
 */
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
// Top-Level Message Schemas
// ============================================================================

/**
 * Common session fields present on most SDK messages
 */
const sessionFields = {
  session_id: z.string().optional(),
  parent_tool_use_id: z.string().nullable().optional(),
  uuid: z.string().optional(),
};

/**
 * System message - initialization and status
 */
export const SDKSystemMessageSchema = z.looseObject({
  type: z.literal('system'),
  subtype: z.string().optional(), // "init", etc.
  cwd: z.string().optional(),
  tools: z.array(z.string()).optional(),
  mcp_servers: z.array(z.unknown()).optional(),
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  slash_commands: z.array(z.string()).optional(),
  apiKeySource: z.string().optional(),
  claude_code_version: z.string().optional(),
  output_style: z.string().optional(),
  agents: z.array(z.string()).optional(),
  oauth_account_email: z.string().optional(),
  conversation_id: z.string().optional(),
  ...sessionFields,
});
export type SDKSystemMessage = z.infer<typeof SDKSystemMessageSchema>;

/**
 * Stream event message - streaming response chunks
 */
export const SDKStreamEventMessageSchema = z.looseObject({
  type: z.literal('stream_event'),
  event: SDKStreamEventPayloadSchema.optional(),
  ...sessionFields,
});
export type SDKStreamEventMessage = z.infer<typeof SDKStreamEventMessageSchema>;

/**
 * Assistant message - complete assistant response
 */
export const SDKAssistantMessageSchema = z.looseObject({
  type: z.literal('assistant'),
  message: z
    .looseObject({
      model: z.string().optional(),
      id: z.string().optional(),
      type: z.string().optional(),
      role: z.string().optional(),
      content: z.array(SDKContentBlockSchema).optional(),
      stop_reason: z.string().nullable().optional(),
      stop_sequence: z.string().nullable().optional(),
      usage: SDKUsageSchema.optional(),
      context_management: z.unknown().nullable().optional(),
    })
    .optional(),
  ...sessionFields,
});
export type SDKAssistantMessage = z.infer<typeof SDKAssistantMessageSchema>;

/**
 * User message - user input
 */
export const SDKUserMessageSchema = z.looseObject({
  type: z.literal('user'),
  message: z
    .looseObject({
      role: z.literal('user').optional(),
      content: z.union([z.string(), z.array(z.unknown())]).optional(),
    })
    .optional(),
  ...sessionFields,
});
export type SDKUserMessage = z.infer<typeof SDKUserMessageSchema>;

/**
 * Result message - turn completion with usage stats
 */
export const SDKResultMessageSchema = z.looseObject({
  type: z.literal('result'),
  subtype: z.string().optional(), // "success", "error", etc.
  is_error: z.boolean().optional(),
  result: z.string().optional(), // Final response text
  duration_ms: z.number().nullable().optional(),
  duration_api_ms: z.number().nullable().optional(),
  num_turns: z.number().optional(),
  total_cost_usd: z.number().nullable().optional(),
  usage: SDKUsageSchema.optional(),
  modelUsage: SDKModelUsageSchema.optional(),
  permission_denials: z.array(z.unknown()).optional(),
  ...sessionFields,
});
export type SDKResultMessage = z.infer<typeof SDKResultMessageSchema>;

// ============================================================================
// Permissive Base Schema
// ============================================================================

/**
 * Permissive message schema for unknown SDK message types
 * Use specific schemas above when type is known
 */
export const SDKMessageSchema = z.looseObject({
  type: z.string(),
  subtype: z.string().optional(),
  content: z.unknown().optional(),
  ...sessionFields,
});
export type SDKMessage = z.infer<typeof SDKMessageSchema>;

// ============================================================================
// Tool Result Schema
// ============================================================================

/**
 * Tool result for SDK tool execution
 */
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
export function getSDKMessageSchema(type: string): z.ZodType {
  switch (type) {
    case 'system':
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
