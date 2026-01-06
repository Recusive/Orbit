import { z } from 'zod';

/**
 * Shell type detected by the backend
 */
export const ShellTypeSchema = z.enum(['bash', 'zsh', 'fish', 'pwsh', 'cmd', 'unknown']);
export type ShellType = z.infer<typeof ShellTypeSchema>;

/**
 * Terminal capabilities provided by shell integration
 */
export const TerminalCapabilitiesSchema = z
  .object({
    cwdDetection: z.boolean(),
    commandDetection: z.boolean(),
    shellIntegration: z.boolean(),
  })
  .strict();
export type TerminalCapabilities = z.infer<typeof TerminalCapabilitiesSchema>;
