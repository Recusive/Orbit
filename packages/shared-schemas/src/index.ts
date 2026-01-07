/**
 * @orbit/shared-schemas
 *
 * Centralized Zod schemas shared between agent-bridge and frontend apps.
 * All schemas use .strict() by default for maximum type safety.
 */

// Model and mode schemas
export {
  ModelSchema,
  ThinkingModeSchema,
  InputModeSchema,
  type Model,
  type ThinkingMode,
  type InputMode,
} from './agent/model';

// Terminal schemas
export {
  ShellTypeSchema,
  TerminalCapabilitiesSchema,
  type ShellType,
  type TerminalCapabilities,
} from './terminal/terminal';

// File schemas with path validation
export {
  FilePathSchema,
  FileStatusSchema,
  FileDataSchema,
  createFilePath,
  safeFilePath,
  type FilePath,
  type FileStatus,
  type FileData,
} from './file/file';

// Agent schemas
export {
  CommandScopeSchema,
  DecisionSchema,
  AgentPhaseSchema,
  TaskStatusSchema,
  ToolCallStatusSchema,
  type CommandScope,
  type Decision,
  type AgentPhase,
  type TaskStatus,
  type ToolCallStatus,
} from './agent/agent';

// SDK boundary handling - comprehensive schemas validated against real SDK data
export {
  // Base schemas
  SDKUsageSchema,
  SDKModelUsageEntrySchema,
  SDKModelUsageSchema,
  // Content block schemas
  SDKTextBlockSchema,
  SDKThinkingBlockSchema,
  SDKToolUseBlockSchema,
  SDKContentBlockSchema,
  // Stream event schemas
  SDKStreamDeltaSchema,
  SDKStreamMessageSchema,
  SDKStreamContentBlockSchema,
  SDKStreamEventPayloadSchema,
  // Top-level message schemas
  SDKSystemMessageSchema,
  SDKStreamEventMessageSchema,
  SDKAssistantMessageSchema,
  SDKUserMessageSchema,
  SDKResultMessageSchema,
  // Permissive base schema
  SDKMessageSchema,
  // Tool result
  SDKToolResultSchema,
  // Utilities
  processSDKResponse,
  getSDKMessageSchema,
  // Types
  type SafeParseResult,
  type SDKUsage,
  type SDKModelUsageEntry,
  type SDKModelUsage,
  type SDKTextBlock,
  type SDKThinkingBlock,
  type SDKToolUseBlock,
  type SDKContentBlock,
  type SDKStreamDelta,
  type SDKStreamMessage,
  type SDKStreamContentBlock,
  type SDKStreamEventPayload,
  type SDKSystemMessage,
  type SDKStreamEventMessage,
  type SDKAssistantMessage,
  type SDKUserMessage,
  type SDKResultMessage,
  type SDKMessage,
  type SDKToolResult,
} from './sdk/sdk';

// Settings schemas with coercion
export {
  EditorSettingsSchema,
  TerminalSettingsSchema,
  UIPreferencesSchema,
  AgentSettingsSchema,
  parseEditorSettings,
  safeParseEditorSettings,
  type EditorSettings,
  type TerminalSettings,
  type UIPreferences,
  type AgentSettings,
} from './settings/settings';

// Error utilities
export {
  formatZodError,
  getFieldErrors,
  getFirstFieldErrors,
  hasFieldError,
} from './common/errors';
