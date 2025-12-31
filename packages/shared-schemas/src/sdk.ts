import { z } from 'zod';

/**
 * SDK Boundary Handling
 *
 * When receiving data from external SDKs (like Claude Agent SDK),
 * use permissive schemas at the boundary then transform to strict internal types.
 */

/**
 * Permissive message schema for SDK responses
 * Uses .passthrough() to allow SDK to add fields without breaking
 */
export const SDKMessageSchema = z.looseObject({
  type: z.string(),
  content: z.unknown(),
});
export type SDKMessage = z.infer<typeof SDKMessageSchema>;

/**
 * Permissive tool result schema for SDK responses
 */
export const SDKToolResultSchema = z.looseObject({
  tool_use_id: z.string(),
  content: z.unknown(),
  is_error: z.boolean().optional(),
});
export type SDKToolResult = z.infer<typeof SDKToolResultSchema>;

/**
 * Permissive usage data from SDK
 */
export const SDKUsageSchema = z.looseObject({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});
export type SDKUsage = z.infer<typeof SDKUsageSchema>;

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
