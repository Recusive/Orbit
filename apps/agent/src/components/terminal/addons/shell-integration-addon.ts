/**
 * Shell Integration Addon for xterm.js
 *
 * Parses OSC sequences emitted by shell integration scripts to provide:
 * - Command detection (prompt/command boundaries)
 * - CWD tracking
 * - Command line capture
 *
 * OSC 633 sequences (VS Code shell integration):
 * - OSC 633;A ST - Mark prompt start
 * - OSC 633;B ST - Mark prompt end (command input start)
 * - OSC 633;C ST - Mark command execution start (output start)
 * - OSC 633;D[;exitcode] ST - Mark command finished
 * - OSC 633;E;commandline;nonce ST - Command line with nonce
 * - OSC 633;P;Cwd=path ST - Set current working directory
 *
 * OSC 1337 sequences (iTerm2 compatible):
 * - OSC 1337;CurrentDir=path ST - Set current working directory
 */

import type { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';

// ============================================================================
// Types
// ============================================================================

/** Command detection state */
export enum CommandState {
  /** At shell prompt, waiting for input */
  Prompt = 'prompt',
  /** User is typing command */
  Input = 'input',
  /** Command is executing */
  Executing = 'executing',
  /** Command has finished */
  Finished = 'finished',
}

/** Shell integration capabilities */
export interface ShellIntegrationCapabilities {
  cwdDetection: boolean;
  commandDetection: boolean;
  shellIntegration: boolean;
}

/** Command execution info */
export interface CommandExecution {
  commandLine?: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  state: CommandState;
}

/** Shell integration event callbacks */
export interface ShellIntegrationCallbacks {
  onCommandStart?: (commandLine?: string) => void;
  onCommandEnd?: (commandLine?: string, exitCode?: number) => void;
  onCwdChange?: (cwd: string) => void;
  onCapabilitiesChange?: (capabilities: ShellIntegrationCapabilities) => void;
}

// ============================================================================
// ShellIntegrationAddon
// ============================================================================

export class ShellIntegrationAddon implements ITerminalAddon {
  private _disposables: IDisposable[] = [];

  // State tracking
  private _commandState: CommandState = CommandState.Prompt;
  private _currentCommand: CommandExecution | undefined;
  private _cwd = '';
  private _nonce: string | undefined;

  // Capabilities
  private _capabilities: ShellIntegrationCapabilities = {
    cwdDetection: false,
    commandDetection: false,
    shellIntegration: false,
  };

  constructor(
    private readonly _callbacks: ShellIntegrationCallbacks = {},
    nonce?: string
  ) {
    this._nonce = nonce;
  }

  // ========================================================================
  // ITerminalAddon Implementation
  // ========================================================================

  activate(terminal: Terminal): void {
    // Listen for data and parse OSC sequences
    const dataDisposable = terminal.parser.registerOscHandler(633, (data) => {
      this._handleOsc633(data);
      return false; // Don't consume - let terminal render normally
    });
    this._disposables.push(dataDisposable);

    // Also handle iTerm2-style CurrentDir
    const iterm2Disposable = terminal.parser.registerOscHandler(1337, (data) => {
      this._handleOsc1337(data);
      return false;
    });
    this._disposables.push(iterm2Disposable);

    // Mark shell integration as available
    this._updateCapabilities({ shellIntegration: true });
  }

  dispose(): void {
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables = [];
  }

  // ========================================================================
  // Getters
  // ========================================================================

  get commandState(): CommandState {
    return this._commandState;
  }

  get currentCommand(): CommandExecution | undefined {
    return this._currentCommand;
  }

  get cwd(): string {
    return this._cwd;
  }

  get capabilities(): ShellIntegrationCapabilities {
    return { ...this._capabilities };
  }

  // ========================================================================
  // OSC Handlers
  // ========================================================================

  /**
   * Handle OSC 633 sequences (VS Code shell integration)
   */
  private _handleOsc633(data: string): void {
    const parts = data.split(';');
    const command = parts[0] ?? '';

    switch (command) {
      case 'A':
        // Prompt start
        this._handlePromptStart();
        break;

      case 'B':
        // Prompt end / command input start
        this._handlePromptEnd();
        break;

      case 'C':
        // Command execution start (output start)
        this._handleCommandStart();
        break;

      case 'D':
        // Command finished
        {
          const exitCode = parts[1] ? parseInt(parts[1], 10) : undefined;
          this._handleCommandEnd(exitCode);
        }
        break;

      case 'E':
        // Command line with optional nonce
        {
          const commandLine = parts[1] ?? '';
          const nonce = parts[2];

          // Verify nonce if we have one
          if (this._nonce && nonce && nonce !== this._nonce) {
            // Nonce mismatch - ignore
            return;
          }

          this._setCommandLine(commandLine);
        }
        break;

      case 'P':
        // Property
        {
          const property = parts.slice(1).join(';');
          this._handleProperty(property);
        }
        break;

      default:
        // Unknown command - ignore
        break;
    }
  }

  /**
   * Handle OSC 1337 sequences (iTerm2 compatible)
   */
  private _handleOsc1337(data: string): void {
    // CurrentDir=path
    if (data.startsWith('CurrentDir=')) {
      const cwd = data.slice(11);
      this._setCwd(cwd);
    }
  }

  // ========================================================================
  // State Handlers
  // ========================================================================

  private _handlePromptStart(): void {
    this._commandState = CommandState.Prompt;
    this._updateCapabilities({ commandDetection: true });
  }

  private _handlePromptEnd(): void {
    this._commandState = CommandState.Input;
    this._currentCommand = {
      startTime: Date.now(),
      state: CommandState.Input,
    };
  }

  private _handleCommandStart(): void {
    this._commandState = CommandState.Executing;
    if (this._currentCommand) {
      this._currentCommand.state = CommandState.Executing;
    }

    // Notify callback
    this._callbacks.onCommandStart?.(this._currentCommand?.commandLine);
  }

  private _handleCommandEnd(exitCode?: number): void {
    this._commandState = CommandState.Finished;

    if (this._currentCommand) {
      this._currentCommand.endTime = Date.now();
      if (exitCode !== undefined) {
        this._currentCommand.exitCode = exitCode;
      }
      this._currentCommand.state = CommandState.Finished;
    }

    // Notify callback
    this._callbacks.onCommandEnd?.(this._currentCommand?.commandLine, exitCode);

    // Reset for next command
    this._currentCommand = undefined;
  }

  private _setCommandLine(commandLine: string): void {
    if (this._currentCommand) {
      this._currentCommand.commandLine = commandLine;
    }
  }

  private _handleProperty(property: string): void {
    // Parse property=value
    const eqIndex = property.indexOf('=');
    if (eqIndex === -1) return;

    const key = property.slice(0, eqIndex);
    const value = property.slice(eqIndex + 1);

    switch (key) {
      case 'Cwd':
        this._setCwd(value);
        break;
      // Other properties can be handled here
    }
  }

  private _setCwd(cwd: string): void {
    if (cwd !== this._cwd) {
      this._cwd = cwd;
      this._updateCapabilities({ cwdDetection: true });
      this._callbacks.onCwdChange?.(cwd);
    }
  }

  private _updateCapabilities(updates: Partial<ShellIntegrationCapabilities>): void {
    let changed = false;

    for (const [key, value] of Object.entries(updates)) {
      const capKey = key as keyof ShellIntegrationCapabilities;
      if (this._capabilities[capKey] !== value) {
        this._capabilities[capKey] = value;
        changed = true;
      }
    }

    if (changed) {
      this._callbacks.onCapabilitiesChange?.(this.capabilities);
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export default ShellIntegrationAddon;
