import { z } from 'zod';

/**
 * Editor settings with coercion for form/localStorage inputs
 * z.coerce handles string→number/boolean conversion automatically
 */
export const EditorSettingsSchema = z
  .object({
    fontSize: z.coerce.number().min(8).max(72).default(14),
    tabSize: z.coerce.number().min(1).max(8).default(4),
    lineHeight: z.coerce.number().min(1).max(3).default(1.5),
    wordWrap: z.coerce.boolean().default(true),
    showLineNumbers: z.coerce.boolean().default(true),
    showMinimap: z.coerce.boolean().default(false),
    fontFamily: z.string().default('monospace'),
  })
  .strict();
export type EditorSettings = z.infer<typeof EditorSettingsSchema>;

/**
 * Terminal settings with coercion
 */
export const TerminalSettingsSchema = z
  .object({
    fontSize: z.coerce.number().min(8).max(32).default(14),
    fontFamily: z.string().default('monospace'),
    cursorStyle: z.enum(['block', 'underline', 'bar']).default('block'),
    cursorBlink: z.coerce.boolean().default(true),
    scrollback: z.coerce.number().min(100).max(100000).default(10000),
  })
  .strict();
export type TerminalSettings = z.infer<typeof TerminalSettingsSchema>;

/**
 * UI preferences with coercion
 */
export const UIPreferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'auto']).default('auto'),
    compactMode: z.coerce.boolean().default(false),
    animations: z.coerce.boolean().default(true),
    soundEffects: z.coerce.boolean().default(false),
    autoSave: z.coerce.boolean().default(true),
    autoScroll: z.coerce.boolean().default(true),
  })
  .strict();
export type UIPreferences = z.infer<typeof UIPreferencesSchema>;

/**
 * Agent settings with coercion
 */
export const AgentSettingsSchema = z
  .object({
    autoApprove: z.coerce.boolean().default(false),
    verboseLogging: z.coerce.boolean().default(false),
    maxIterations: z.coerce.number().min(1).max(100).default(50),
    timeout: z.coerce.number().min(1000).max(600000).default(120000),
  })
  .strict();
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

/**
 * Parse settings from localStorage or form data
 * Handles string values gracefully with coercion
 */
export function parseEditorSettings(data: unknown): EditorSettings {
  return EditorSettingsSchema.parse(data);
}

export function safeParseEditorSettings(data: unknown): EditorSettings | null {
  const result = EditorSettingsSchema.safeParse(data);
  return result.success ? result.data : null;
}
