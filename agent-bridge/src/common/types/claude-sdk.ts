/**
 * Local type definitions for Claude Agent SDK messages.
 *
 * ESLint's projectService cannot resolve the SDK's exported types across
 * the agent-bridge tsconfig boundary (moduleResolution: "bundler").
 * TypeScript's own resolver handles this fine — `tsc --noEmit` passes —
 * but ESLint sees `SDKMessage` as unresolvable, triggering false
 * no-unsafe-member-access errors.
 *
 * These local types mirror the subset of the SDK's `SDKMessage` union
 * that agent-bridge actually uses. Cast at the iteration boundary:
 *
 *   for await (const raw of query) {
 *     const message = raw as LocalSDKMessage;
 *     // ESLint-safe property access
 *   }
 *
 * session-manager.ts already uses this same pattern with its own local types.
 */

// =============================================================================
// Content Blocks (assistant message content)
// =============================================================================

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock;

// =============================================================================
// Tool Result Blocks (user message content)
// =============================================================================

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown[];
  is_error?: boolean;
}

// =============================================================================
// SDK Message Variants
// =============================================================================

export interface LocalSDKSystemMessage {
  type: 'system';
  subtype?: string;
  session_id?: string;
  betas?: string[];
  model?: string;
}

export interface LocalSDKAssistantMessage {
  type: 'assistant';
  uuid?: string;
  session_id?: string;
  message: {
    content: ContentBlock[];
  };
  parent_tool_use_id?: string | null;
  error?: string;
}

export interface LocalSDKUserMessage {
  type: 'user';
  uuid?: string;
  session_id?: string;
  message: {
    content: string | unknown[];
  };
  parent_tool_use_id?: string | null;
}

export interface LocalSDKResultMessage {
  type: 'result';
  subtype?: string;
  result?: string;
  is_error?: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  total_cost_usd?: number;
  duration_ms?: number;
  structured_output?: unknown;
  modelUsage?: Record<string, { contextWindow?: number | undefined }>;
}

export interface LocalSDKStreamEventMessage {
  type: 'stream_event';
  uuid?: string;
  session_id?: string;
  event?: {
    type: string;
    delta?: {
      type: string;
      text?: string;
      thinking?: string;
    };
  };
  parent_tool_use_id?: string | null;
}

/** Catch-all for message types we observe but don't destructure */
export interface LocalSDKOtherMessage {
  type:
    | 'tool_use_summary'
    | 'tool_progress'
    | 'auth_status'
    | 'compact_boundary'
    | 'status'
    | 'hook_started'
    | 'hook_progress'
    | 'hook_response'
    | 'files_persisted'
    | 'rate_limit'
    | 'prompt_suggestion'
    | 'task_notification'
    | 'task_started';
}

/**
 * Local discriminated union of all SDK message types we handle.
 * Cast the SDK's `SDKMessage` to this at the `for await` boundary.
 */
export type LocalSDKMessage =
  | LocalSDKSystemMessage
  | LocalSDKAssistantMessage
  | LocalSDKUserMessage
  | LocalSDKResultMessage
  | LocalSDKStreamEventMessage
  | LocalSDKOtherMessage;
