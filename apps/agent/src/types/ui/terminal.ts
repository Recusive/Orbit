import { ShellTypeSchema, TerminalCapabilitiesSchema } from '@orbit/shared-schemas';
import { z } from 'zod';

// Re-export shared terminal schemas for consumers
export {
  ShellTypeSchema,
  TerminalCapabilitiesSchema,
  type ShellType,
  type TerminalCapabilities,
} from '@orbit/shared-schemas';

// ============================================================================
// PTY Terminal Types (for real terminal backend)
// ============================================================================

/**
 * PTY terminal session (connected to real backend)
 */
export const PtyTerminalSessionSchema = z
  .object({
    /** Unique terminal ID from backend */
    terminalId: z.string(),
    /** Process ID of the shell */
    pid: z.number(),
    /** Current working directory */
    cwd: z.string(),
    /** Detected shell type */
    shellType: ShellTypeSchema,
    /** Terminal title (usually process name) */
    title: z.string(),
    /** Current capabilities */
    capabilities: TerminalCapabilitiesSchema,
    /** Linked chat session ID if any */
    sessionId: z.string().optional(),
    /** Whether the terminal is still alive */
    isAlive: z.boolean(),
    /** Creation timestamp */
    createdAt: z.number(),
  })
  .strict();
export type PtyTerminalSession = z.infer<typeof PtyTerminalSessionSchema>;

/**
 * Command detected by shell integration
 */
export const DetectedCommandSchema = z
  .object({
    /** Command line that was executed */
    commandLine: z.string().optional(),
    /** Exit code when command finished */
    exitCode: z.number().optional(),
    /** Marker position (line number) */
    marker: z.number().optional(),
    /** Whether command is still running */
    isRunning: z.boolean(),
    /** Start timestamp */
    startTime: z.number().optional(),
    /** End timestamp */
    endTime: z.number().optional(),
  })
  .strict();
export type DetectedCommand = z.infer<typeof DetectedCommandSchema>;

// ============================================================================
// Legacy Command Types (for command history)
// ============================================================================

/**
 * Command status enum
 */
export enum CommandStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Terminal output type enum
 */
export enum TerminalOutputType {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  SYSTEM = 'system',
}

/**
 * Terminal command schema
 */
export const TerminalCommandSchema = z
  .object({
    id: z.string(),
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    status: z.enum(CommandStatus),
    startTime: z.number(),
    endTime: z.number().optional(),
    exitCode: z.number().optional(),
    signal: z.string().optional(),
    pid: z.number().optional(),
  })
  .strict();

/**
 * Terminal output schema
 */
export const TerminalOutputSchema = z
  .object({
    id: z.string(),
    commandId: z.string(),
    type: z.enum(TerminalOutputType),
    data: z.string(),
    timestamp: z.number(),
    isError: z.boolean().optional(),
  })
  .strict();

/**
 * Terminal session schema
 */
export const TerminalSessionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    cwd: z.string(),
    shell: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    commands: z.array(TerminalCommandSchema),
    output: z.array(TerminalOutputSchema),
    isActive: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    metadata: z
      .object({
        totalCommands: z.number().optional(),
        successfulCommands: z.number().optional(),
        failedCommands: z.number().optional(),
        totalDuration: z.number().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Terminal session summary schema
 */
export const TerminalSessionSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    cwd: z.string(),
    isActive: z.boolean(),
    lastCommandPreview: z.string().optional(),
    lastCommandStatus: z.enum(CommandStatus).optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    commandCount: z.number(),
  })
  .strict();

/**
 * Terminal history entry schema
 */
export const TerminalHistoryEntrySchema = z
  .object({
    command: z.string(),
    timestamp: z.number(),
    cwd: z.string(),
    exitCode: z.number().optional(),
    duration: z.number().optional(),
  })
  .strict();

/**
 * Terminal settings schema
 */
export const TerminalSettingsSchema = z
  .object({
    shell: z.string().optional(),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional(),
    cursorStyle: z.enum(['block', 'underline', 'bar']).optional(),
    cursorBlink: z.boolean().optional(),
    scrollback: z.number().optional(),
    env: z.record(z.string(), z.string()).optional(),
    theme: z
      .object({
        foreground: z.string().optional(),
        background: z.string().optional(),
        cursor: z.string().optional(),
        selection: z.string().optional(),
        black: z.string().optional(),
        red: z.string().optional(),
        green: z.string().optional(),
        yellow: z.string().optional(),
        blue: z.string().optional(),
        magenta: z.string().optional(),
        cyan: z.string().optional(),
        white: z.string().optional(),
        brightBlack: z.string().optional(),
        brightRed: z.string().optional(),
        brightGreen: z.string().optional(),
        brightYellow: z.string().optional(),
        brightBlue: z.string().optional(),
        brightMagenta: z.string().optional(),
        brightCyan: z.string().optional(),
        brightWhite: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * TypeScript types inferred from Zod schemas
 */
export type TerminalCommand = z.infer<typeof TerminalCommandSchema>;
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;
export type TerminalSessionSummary = z.infer<typeof TerminalSessionSummarySchema>;
export type TerminalHistoryEntry = z.infer<typeof TerminalHistoryEntrySchema>;
export type TerminalSettings = z.infer<typeof TerminalSettingsSchema>;

/**
 * Helper functions
 */
export function createTerminalSession(
  id: string,
  name: string,
  cwd: string,
  shell?: string
): TerminalSession {
  const now = Date.now();
  return {
    id,
    name,
    cwd,
    shell,
    commands: [],
    output: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTerminalCommand(
  id: string,
  command: string,
  args?: string[],
  cwd?: string,
  env?: Record<string, string>
): TerminalCommand {
  return {
    id,
    command,
    args,
    cwd,
    env,
    status: CommandStatus.PENDING,
    startTime: Date.now(),
  };
}

export function createTerminalOutput(
  id: string,
  commandId: string,
  type: TerminalOutputType,
  data: string
): TerminalOutput {
  return {
    id,
    commandId,
    type,
    data,
    timestamp: Date.now(),
    isError: type === TerminalOutputType.STDERR,
  };
}

export function getCommandDuration(command: TerminalCommand): number | undefined {
  if (command.endTime === undefined) return undefined;
  return command.endTime - command.startTime;
}

export function getCommandStatusColor(status: CommandStatus): string {
  switch (status) {
    case CommandStatus.PENDING:
      return 'gray';
    case CommandStatus.RUNNING:
      return 'blue';
    case CommandStatus.COMPLETED:
      return 'green';
    case CommandStatus.FAILED:
      return 'red';
    case CommandStatus.CANCELLED:
      return 'orange';
    default:
      return 'gray';
  }
}

export function formatCommandDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${String(milliseconds)}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
    return `${String(minutes)}m ${seconds}s`;
  }
}

export function getFullCommand(command: TerminalCommand): string {
  if (!command.args || command.args.length === 0) {
    return command.command;
  }
  return `${command.command} ${command.args.join(' ')}`;
}

export function getSessionSummary(session: TerminalSession): TerminalSessionSummary {
  const lastCommand = session.commands[session.commands.length - 1];
  return {
    id: session.id,
    name: session.name,
    cwd: session.cwd,
    isActive: session.isActive,
    lastCommandPreview: lastCommand ? getFullCommand(lastCommand) : undefined,
    lastCommandStatus: lastCommand?.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    commandCount: session.commands.length,
  };
}

export function getSessionStatistics(session: TerminalSession): {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  cancelledCommands: number;
  totalDuration: number;
  averageDuration: number;
} {
  const stats = {
    totalCommands: session.commands.length,
    successfulCommands: 0,
    failedCommands: 0,
    cancelledCommands: 0,
    totalDuration: 0,
    averageDuration: 0,
  };

  for (const command of session.commands) {
    if (command.status === CommandStatus.COMPLETED) {
      stats.successfulCommands++;
    } else if (command.status === CommandStatus.FAILED) {
      stats.failedCommands++;
    } else if (command.status === CommandStatus.CANCELLED) {
      stats.cancelledCommands++;
    }

    const duration = getCommandDuration(command);
    if (duration !== undefined) {
      stats.totalDuration += duration;
    }
  }

  if (stats.totalCommands > 0) {
    stats.averageDuration = stats.totalDuration / stats.totalCommands;
  }

  return stats;
}

export function filterTerminalOutput(
  output: TerminalOutput[],
  commandId?: string,
  type?: TerminalOutputType
): TerminalOutput[] {
  let filtered = output;

  if (commandId !== undefined) {
    filtered = filtered.filter((o) => o.commandId === commandId);
  }

  if (type !== undefined) {
    filtered = filtered.filter((o) => o.type === type);
  }

  return filtered;
}

export function getTerminalHistory(sessions: TerminalSession[]): TerminalHistoryEntry[] {
  const history: TerminalHistoryEntry[] = [];

  for (const session of sessions) {
    for (const command of session.commands) {
      history.push({
        command: getFullCommand(command),
        timestamp: command.startTime,
        cwd: command.cwd ?? session.cwd,
        exitCode: command.exitCode,
        duration: getCommandDuration(command),
      });
    }
  }

  // Sort by timestamp descending
  history.sort((a, b) => b.timestamp - a.timestamp);

  return history;
}
