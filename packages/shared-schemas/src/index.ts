/**
 * @snowflake/shared-schemas
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
} from './model';

// Terminal schemas
export {
  ShellTypeSchema,
  TerminalCapabilitiesSchema,
  type ShellType,
  type TerminalCapabilities,
} from './terminal';

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
} from './file';

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
} from './agent';

// SDK boundary handling
export {
  SDKMessageSchema,
  SDKToolResultSchema,
  SDKUsageSchema,
  processSDKResponse,
  type SafeParseResult,
  type SDKMessage,
  type SDKToolResult,
  type SDKUsage,
} from './sdk';

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
} from './settings';

// Error utilities
export { formatZodError, getFieldErrors, getFirstFieldErrors, hasFieldError } from './errors';
