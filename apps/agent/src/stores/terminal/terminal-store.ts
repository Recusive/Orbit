import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { ShellType, TerminalCapabilitiesState } from '@/types/protocol';

import { TERMINAL } from '@/lib/utils/constants';

const logger = createLogger('TerminalStore');

// ============================================================================
// Types
// ============================================================================

export interface TerminalOutput {
  id: string;
  type: 'stdout' | 'stderr' | 'stdin' | 'system';
  content: string;
  timestamp: number;
}

/** Detected command from shell integration */
export interface DetectedCommand {
  id: string;
  commandLine?: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  isRunning: boolean;
}

/** Foreground process info from the backend */
export interface ForegroundProcess {
  /** Process ID */
  pid: number;
  /** Process name (e.g., "zsh", "node", "python") */
  name: string;
}

/** PTY Terminal Session */
export interface TerminalSession {
  /** Local session ID (for UI tracking) */
  id: string;
  /** Backend PTY terminal ID (from main process) */
  terminalId?: string;
  /** Default display name (e.g., "Terminal 1") */
  name: string;
  /** Custom name set by user (overrides default name) */
  customName?: string;
  /** Current working directory */
  cwd: string;
  /** Shell type (bash, zsh, fish, etc.) */
  shellType?: ShellType;
  /** Process ID */
  pid?: number;
  /** Terminal capabilities */
  capabilities: TerminalCapabilitiesState;
  /** Creation timestamp */
  createdAt: number;
  /** Terminal output buffer */
  output: TerminalOutput[];
  /** Whether the terminal process is alive */
  isAlive: boolean;
  /** Whether the terminal is connected to backend */
  isConnected: boolean;
  /** Exit code when process terminates */
  exitCode?: number;
  /** Currently running command (if any) */
  currentCommand?: DetectedCommand;
  /** Command history from shell integration */
  commandHistory: DetectedCommand[];
  /** Flow control: unacknowledged bytes */
  unacknowledgedBytes: number;
  /** Current foreground process (e.g., "zsh", "node") */
  foregroundProcess?: ForegroundProcess;
  /** Initial command to execute when terminal connects (e.g., "ssh user@host") */
  initialCommand?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CAPABILITIES: TerminalCapabilitiesState = {
  cwd_detection: false,
  command_detection: false,
  shell_integration: false,
};

const FLOW_CONTROL = {
  highWaterMark: 100000,
  ackThreshold: 50000,
} as const;

// ============================================================================
// Store Interface
// ============================================================================

/** Terminal preferences that can be configured */
export interface TerminalPreferences {
  /** Auto-copy selected text to clipboard */
  copyOnSelection: boolean;
}

export interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  maxOutputLines: number;
  preferences: TerminalPreferences;

  // Session Management
  createSession: (name?: string, cwd?: string, initialCommand?: string) => string;
  closeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  renameSession: (id: string, name: string) => void;

  // PTY Connection
  connectSession: (
    sessionId: string,
    terminalId: string,
    pid?: number,
    shellType?: ShellType,
    capabilities?: TerminalCapabilitiesState
  ) => void;
  disconnectSession: (sessionId: string, exitCode?: number) => void;

  // Output
  addOutput: (sessionId: string, output: Omit<TerminalOutput, 'id' | 'timestamp'>) => void;
  appendData: (terminalId: string, data: string) => number; // Returns bytes for ack
  clearOutput: (sessionId: string) => void;

  // Capabilities & CWD
  updateCapabilities: (terminalId: string, capabilities: TerminalCapabilitiesState) => void;
  updateCwd: (terminalId: string, cwd: string) => void;

  // Foreground Process
  updateForegroundProcess: (terminalId: string, processName: string, pid: number) => void;

  // Command Detection
  startCommand: (terminalId: string, commandLine?: string) => void;
  endCommand: (terminalId: string, exitCode?: number) => void;

  // Flow Control
  acknowledgeData: (terminalId: string, byteCount: number) => void;
  shouldPause: (terminalId: string) => boolean;

  // Session Updates
  updateSession: (sessionId: string, updates: Partial<TerminalSession>) => void;
  setMaxOutputLines: (lines: number) => void;

  // Preferences
  setCopyOnSelection: (enabled: boolean) => void;

  // Helpers
  getSessionByTerminalId: (terminalId: string) => TerminalSession | undefined;
  getActiveSession: () => TerminalSession | undefined;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useTerminalStore = create<TerminalState>()(
  immer((set, get) => ({
    sessions: [],
    activeSessionId: null,
    maxOutputLines: TERMINAL.maxOutputLines,
    preferences: {
      copyOnSelection: false,
    },

    // ========================================================================
    // Session Management
    // ========================================================================

    createSession: (name?: string, cwd?: string, initialCommand?: string) => {
      const random = Math.random().toString(36);
      const id = `term_${String(Date.now())}_${random.slice(2, 11)}`;
      logger.info(`Creating terminal session`, { id, name, cwd, initialCommand });

      let sessionNumber = 1;
      set((state) => {
        sessionNumber = state.sessions.length + 1;
      });

      set((state) => {
        const processExists = typeof process !== 'undefined';
        const defaultCwd = processExists && typeof process.cwd === 'function' ? process.cwd() : '~';

        const newSession: TerminalSession = {
          id,
          name: name ?? `Terminal ${String(sessionNumber)}`,
          cwd: cwd ?? defaultCwd,
          capabilities: { ...DEFAULT_CAPABILITIES },
          createdAt: Date.now(),
          output: [],
          isAlive: false,
          isConnected: false,
          commandHistory: [],
          unacknowledgedBytes: 0,
          ...(initialCommand !== undefined && { initialCommand }),
        };

        state.sessions.push(newSession);

        // Auto-select if it's the first session
        if (state.sessions.length === 1) {
          state.activeSessionId = id;
        }
      });

      return id;
    },

    closeSession: (id: string) => {
      logger.info(`Closing terminal session: ${id}`);
      set((state) => {
        const sessionIndex = state.sessions.findIndex((s) => s.id === id);
        if (sessionIndex === -1) return;

        state.sessions.splice(sessionIndex, 1);

        // Update active session if the closed one was active
        if (state.activeSessionId === id) {
          if (state.sessions.length > 0) {
            const newIndex = sessionIndex > 0 ? sessionIndex - 1 : 0;
            state.activeSessionId = state.sessions[newIndex]?.id ?? null;
          } else {
            state.activeSessionId = null;
          }
        }
      });
    },

    setActiveSession: (id: string | null) => {
      set((state) => {
        state.activeSessionId = id;
      });
    },

    renameSession: (id: string, name: string) => {
      set((state) => {
        const session = state.sessions.find((s) => s.id === id);
        if (session) {
          // If name is empty or same as default, clear customName
          if (!name.trim() || name.trim() === session.name) {
            delete session.customName;
          } else {
            session.customName = name.trim();
          }
        }
      });
    },

    // ========================================================================
    // PTY Connection
    // ========================================================================

    connectSession: (
      sessionId: string,
      terminalId: string,
      pid?: number,
      shellType?: ShellType,
      capabilities?: TerminalCapabilitiesState
    ) => {
      logger.info(`Terminal connected`, { sessionId, terminalId, pid, shellType });
      set((state) => {
        const session = state.sessions.find((s) => s.id === sessionId);
        if (session) {
          session.terminalId = terminalId;
          if (pid !== undefined) {
            session.pid = pid;
          }
          if (shellType !== undefined) {
            session.shellType = shellType;
          }
          session.isAlive = true;
          session.isConnected = true;
          delete session.exitCode;
          if (capabilities) {
            session.capabilities = capabilities;
          }
        }
      });
    },

    disconnectSession: (sessionId: string, exitCode?: number) => {
      logger.info(`Terminal disconnected`, { sessionId, exitCode });
      set((state) => {
        const session = state.sessions.find((s) => s.id === sessionId);
        if (session) {
          session.isAlive = false;
          session.isConnected = false;
          if (exitCode !== undefined) {
            session.exitCode = exitCode;
          }
          delete session.currentCommand;
        }
      });
    },

    // ========================================================================
    // Output
    // ========================================================================

    addOutput: (sessionId: string, output: Omit<TerminalOutput, 'id' | 'timestamp'>) => {
      set((state) => {
        const session = state.sessions.find((s) => s.id === sessionId);
        if (!session) return;

        const random = Math.random().toString(36);
        const newOutput: TerminalOutput = {
          ...output,
          id: `out_${String(Date.now())}_${random.slice(2, 11)}`,
          timestamp: Date.now(),
        };

        session.output.push(newOutput);

        // Trim output if it exceeds maxOutputLines
        if (session.output.length > state.maxOutputLines) {
          const excess = session.output.length - state.maxOutputLines;
          session.output.splice(0, excess);
        }
      });
    },

    appendData: (terminalId: string, data: string) => {
      const byteCount = data.length;

      set((state) => {
        const session = state.sessions.find((s) => s.terminalId === terminalId);
        if (!session) return;

        // Add raw data as output
        const random = Math.random().toString(36);
        session.output.push({
          id: `out_${String(Date.now())}_${random.slice(2, 11)}`,
          type: 'stdout',
          content: data,
          timestamp: Date.now(),
        });

        // Track unacknowledged bytes for flow control
        session.unacknowledgedBytes += byteCount;

        // Trim output if needed
        if (session.output.length > state.maxOutputLines) {
          const excess = session.output.length - state.maxOutputLines;
          session.output.splice(0, excess);
        }
      });

      return byteCount;
    },

    clearOutput: (sessionId: string) => {
      set((state) => {
        const session = state.sessions.find((s) => s.id === sessionId);
        if (session) {
          session.output = [];
        }
      });
    },

    // ========================================================================
    // Capabilities & CWD
    // ========================================================================

    updateCapabilities: (terminalId: string, capabilities: TerminalCapabilitiesState) => {
      set((state) => {
        const session = state.sessions.find((s) => s.terminalId === terminalId);
        if (session) {
          session.capabilities = capabilities;
        }
      });
    },

    updateCwd: (terminalId: string, cwd: string) => {
      set((state) => {
        const session = state.sessions.find((s) => s.terminalId === terminalId);
        if (session) {
          session.cwd = cwd;
        }
      });
    },

    // ========================================================================
    // Foreground Process
    // ========================================================================

    updateForegroundProcess: (terminalId: string, processName: string, pid: number) => {
      set((state) => {
        const session = state.sessions.find((s) => s.terminalId === terminalId);
        if (session) {
          session.foregroundProcess = { name: processName, pid };
        }
      });
    },

    // ========================================================================
    // Command Detection
    // ========================================================================

    startCommand: (terminalId: string, commandLine?: string) => {
      set((state) => {
        const session = state.sessions.find((s) => s.terminalId === terminalId);
        if (!session) return;

        const random = Math.random().toString(36);
        const command: DetectedCommand = {
          id: `cmd_${String(Date.now())}_${random.slice(2, 11)}`,
          startTime: Date.now(),
          isRunning: true,
        };

        if (commandLine !== undefined) {
          command.commandLine = commandLine;
        }

        session.currentCommand = command;
      });
    },

    endCommand: (terminalId: string, exitCode?: number) => {
      set((state) => {
        const session = state.sessions.find((s) => s.terminalId === terminalId);
        if (!session?.currentCommand) return;

        const finishedCommand: DetectedCommand = {
          ...session.currentCommand,
          endTime: Date.now(),
          isRunning: false,
        };

        if (exitCode !== undefined) {
          finishedCommand.exitCode = exitCode;
        }

        // Add to history
        session.commandHistory.push(finishedCommand);

        // Keep only last 100 commands
        if (session.commandHistory.length > 100) {
          session.commandHistory.splice(0, session.commandHistory.length - 100);
        }

        delete session.currentCommand;
      });
    },

    // ========================================================================
    // Flow Control
    // ========================================================================

    acknowledgeData: (terminalId: string, byteCount: number) => {
      set((state) => {
        const session = state.sessions.find((s) => s.terminalId === terminalId);
        if (session) {
          session.unacknowledgedBytes = Math.max(0, session.unacknowledgedBytes - byteCount);
        }
      });
    },

    shouldPause: (terminalId: string) => {
      const session = get().sessions.find((s) => s.terminalId === terminalId);
      if (!session) return false;
      return session.unacknowledgedBytes > FLOW_CONTROL.highWaterMark;
    },

    // ========================================================================
    // Session Updates
    // ========================================================================

    updateSession: (sessionId: string, updates: Partial<TerminalSession>) => {
      set((state) => {
        const session = state.sessions.find((s) => s.id === sessionId);
        if (session) {
          Object.assign(session, updates);
        }
      });
    },

    setMaxOutputLines: (lines: number) => {
      set((state) => {
        state.maxOutputLines = Math.max(TERMINAL.minOutputLines, lines);

        // Trim all sessions to the new limit
        state.sessions.forEach((session) => {
          if (session.output.length > lines) {
            const excess = session.output.length - lines;
            session.output.splice(0, excess);
          }
        });
      });
    },

    // ========================================================================
    // Preferences
    // ========================================================================

    setCopyOnSelection: (enabled: boolean) => {
      set((state) => {
        state.preferences.copyOnSelection = enabled;
      });
    },

    // ========================================================================
    // Helpers
    // ========================================================================

    getSessionByTerminalId: (terminalId: string) => {
      return get().sessions.find((s) => s.terminalId === terminalId);
    },

    getActiveSession: () => {
      const state = get();
      if (!state.activeSessionId) return undefined;
      return state.sessions.find((s) => s.id === state.activeSessionId);
    },
  }))
);
