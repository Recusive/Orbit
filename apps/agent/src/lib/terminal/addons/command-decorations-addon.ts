/**
 * Command Decorations Addon for xterm.js
 *
 * Adds visual decorations for command boundaries:
 * - Gutter markers at command start lines
 * - Success/failure indicators (green checkmark / red X)
 * - Hover tooltips with command info
 *
 * Works in conjunction with ShellIntegrationAddon to receive command events.
 */

import type {
  IBufferRange,
  IDecoration,
  IDisposable,
  IMarker,
  ITerminalAddon,
  Terminal,
} from '@xterm/xterm';

// ============================================================================
// Types
// ============================================================================

/** Command mark representing a command execution */
export interface CommandMark {
  /** Unique identifier */
  id: string;
  /** Command line text (if available) */
  commandLine?: string;
  /** Terminal marker at command start */
  marker: IMarker;
  /** Start line in buffer */
  startLine: number;
  /** End line in buffer (set when command ends) */
  endLine?: number;
  /** Exit code (set when command ends) */
  exitCode?: number;
  /** Whether command is still running */
  isRunning: boolean;
  /** Timestamp when command started */
  startTime: number;
  /** Timestamp when command ended */
  endTime?: number;
}

/** Decoration configuration */
export interface DecorationConfig {
  /** Show gutter markers */
  showGutterMarkers: boolean;
  /** Show success/failure icons */
  showStatusIcons: boolean;
  /** Gutter width in pixels */
  gutterWidth: number;
}

/** Overview ruler colors - used by xterm's overview ruler, not the gutter icons */
const OVERVIEW_RULER_COLORS = {
  running: '#3b8eea',
  success: '#23d18b',
  error: '#f14c4c',
} as const;

// ============================================================================
// CommandDecorationsAddon
// ============================================================================

export class CommandDecorationsAddon implements ITerminalAddon {
  private _terminal: Terminal | undefined;
  private _disposables: IDisposable[] = [];
  private _decorations = new Map<string, IDecoration>();
  private _commandMarks: CommandMark[] = [];
  private _config: DecorationConfig;

  constructor(config?: Partial<DecorationConfig>) {
    this._config = {
      showGutterMarkers: true,
      showStatusIcons: true,
      gutterWidth: 24,
      ...config,
    };
  }

  // ========================================================================
  // ITerminalAddon Implementation
  // ========================================================================

  activate(terminal: Terminal): void {
    this._terminal = terminal;

    // Handle terminal scroll to update decorations
    const scrollDisposable = terminal.onScroll(() => {
      this._updateDecorationVisibility();
    });
    this._disposables.push(scrollDisposable);

    // Handle buffer clear
    const clearDisposable = terminal.onData((data) => {
      // Check for clear screen sequences
      if (data.includes('\x1b[2J') || data.includes('\x1b[H\x1b[2J')) {
        this._clearAllMarks();
      }
    });
    this._disposables.push(clearDisposable);
  }

  dispose(): void {
    this._clearAllMarks();
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables = [];
    this._terminal = undefined;
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Mark the start of a command execution
   */
  markCommandStart(commandLine?: string): string {
    if (!this._terminal) {
      return '';
    }

    const buffer = this._terminal.buffer.active;
    const currentLine = buffer.baseY + buffer.cursorY;

    // Create a marker at the current line
    const marker = this._terminal.registerMarker(0);
    const id = `cmd_${String(Date.now())}_${String(Math.random()).slice(2, 10)}`;

    const mark: CommandMark = {
      id,
      marker,
      startLine: currentLine,
      isRunning: true,
      startTime: Date.now(),
    };

    if (commandLine !== undefined) {
      mark.commandLine = commandLine;
    }

    this._commandMarks.push(mark);
    this._createDecoration(mark);

    // Dispose marker when it's invalid
    const markerDisposable = marker.onDispose(() => {
      this._removeDecoration(id);
    });
    this._disposables.push(markerDisposable);

    return id;
  }

  /**
   * Mark the end of a command execution
   */
  markCommandEnd(exitCode?: number): void {
    if (!this._terminal) {
      return;
    }

    // Find the most recent running command (iterate backwards)
    let runningMark: CommandMark | undefined;
    for (let i = this._commandMarks.length - 1; i >= 0; i--) {
      const mark = this._commandMarks[i];
      if (mark?.isRunning) {
        runningMark = mark;
        break;
      }
    }
    if (!runningMark) {
      return;
    }

    const buffer = this._terminal.buffer.active;
    const currentLine = buffer.baseY + buffer.cursorY;

    runningMark.isRunning = false;
    if (exitCode !== undefined) {
      runningMark.exitCode = exitCode;
    }
    runningMark.endLine = currentLine;
    runningMark.endTime = Date.now();

    // Update decoration to show exit status
    this._updateDecoration(runningMark);
  }

  /**
   * Get all command marks
   */
  getCommandMarks(): readonly CommandMark[] {
    return this._commandMarks;
  }

  /**
   * Get the most recent command mark
   */
  getLastCommandMark(): CommandMark | undefined {
    return this._commandMarks[this._commandMarks.length - 1];
  }

  /**
   * Navigate to a specific command mark
   */
  scrollToMark(markId: string): void {
    const mark = this._commandMarks.find((m) => m.id === markId);
    if (mark && this._terminal) {
      this._terminal.scrollToLine(mark.startLine);
    }
  }

  /**
   * Navigate to the previous command
   */
  scrollToPreviousCommand(): void {
    if (!this._terminal || this._commandMarks.length === 0) {
      return;
    }

    const buffer = this._terminal.buffer.active;
    const currentLine = buffer.baseY + buffer.cursorY;

    // Find the command before the current position (iterate backwards)
    let previousMark: CommandMark | undefined;
    for (let i = this._commandMarks.length - 1; i >= 0; i--) {
      const mark = this._commandMarks[i];
      if (mark && mark.startLine < currentLine - 1) {
        previousMark = mark;
        break;
      }
    }

    if (previousMark) {
      this._terminal.scrollToLine(previousMark.startLine);
    }
  }

  /**
   * Navigate to the next command
   */
  scrollToNextCommand(): void {
    if (!this._terminal || this._commandMarks.length === 0) {
      return;
    }

    const buffer = this._terminal.buffer.active;
    const currentLine = buffer.baseY + buffer.cursorY;

    // Find the command after the current position
    const nextMark = this._commandMarks.find((m) => m.startLine > currentLine);

    if (nextMark) {
      this._terminal.scrollToLine(nextMark.startLine);
    }
  }

  /**
   * Get the buffer range for a command's output
   */
  getCommandOutputRange(markId: string): IBufferRange | undefined {
    const mark = this._commandMarks.find((m) => m.id === markId);
    if (mark?.endLine === undefined) {
      return undefined;
    }

    return {
      start: { x: 0, y: mark.startLine + 1 },
      end: { x: 0, y: mark.endLine },
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DecorationConfig>): void {
    this._config = { ...this._config, ...config };
    // Refresh all decorations
    for (const mark of this._commandMarks) {
      this._updateDecoration(mark);
    }
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private _createDecoration(mark: CommandMark): void {
    if (!this._terminal || !this._config.showGutterMarkers) {
      return;
    }

    const decoration = this._terminal.registerDecoration({
      marker: mark.marker,
      anchor: 'left',
      width: this._config.gutterWidth,
      overviewRulerOptions: {
        color: OVERVIEW_RULER_COLORS.running,
        position: 'left',
      },
    });

    if (!decoration) {
      return;
    }

    this._decorations.set(mark.id, decoration);

    decoration.onRender((element) => {
      this._renderDecorationElement(element, mark);
    });
  }

  private _updateDecoration(mark: CommandMark): void {
    const decoration = this._decorations.get(mark.id);
    if (!decoration) {
      return;
    }

    // Update overview ruler color based on exit status
    if (mark.exitCode !== undefined) {
      const color =
        mark.exitCode === 0 ? OVERVIEW_RULER_COLORS.success : OVERVIEW_RULER_COLORS.error;
      decoration.options.overviewRulerOptions = {
        color,
        position: 'left',
      };
    }
  }

  private _removeDecoration(markId: string): void {
    const decoration = this._decorations.get(markId);
    if (decoration) {
      decoration.dispose();
      this._decorations.delete(markId);
    }

    const markIndex = this._commandMarks.findIndex((m) => m.id === markId);
    if (markIndex !== -1) {
      this._commandMarks.splice(markIndex, 1);
    }
  }

  private _clearAllMarks(): void {
    for (const decoration of this._decorations.values()) {
      decoration.dispose();
    }
    this._decorations.clear();
    this._commandMarks = [];
  }

  private _updateDecorationVisibility(): void {
    // Decorations are automatically managed by xterm.js
    // This is a hook for future optimization if needed
  }

  private _renderDecorationElement(element: HTMLElement, mark: CommandMark): void {
    // Apply CSS class for styling (defined in terminal.css)
    // Using CSS classes instead of inline styles for better maintainability
    element.className = 'terminal-command-decoration';
    element.style.cursor = 'pointer';

    // Clear existing content
    element.innerHTML = '';

    if (this._config.showStatusIcons) {
      const icon = document.createElement('span');

      if (mark.isRunning) {
        // Running indicator (spinning dot)
        icon.textContent = '●';
        icon.className = 'default-color';
      } else if (mark.exitCode === 0) {
        // Success checkmark
        icon.textContent = '✓';
        icon.className = 'success';
      } else {
        // Error X
        icon.textContent = '✕';
        icon.className = 'error';
      }

      element.appendChild(icon);
    }

    // Add tooltip with command info
    if (mark.commandLine) {
      element.title = mark.commandLine;
    } else if (mark.exitCode !== undefined) {
      element.title = `Exit code: ${String(mark.exitCode)}`;
    }

    // Add click handler to scroll to command
    element.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.scrollToMark(mark.id);
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default CommandDecorationsAddon;
