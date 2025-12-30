/**
 * Mark Navigation Addon for xterm.js
 *
 * Provides keyboard navigation between command marks:
 * - Ctrl+Up: Navigate to previous command
 * - Ctrl+Down: Navigate to next command
 * - Ctrl+Shift+Up: Navigate to previous failed command
 * - Ctrl+Shift+Down: Navigate to next failed command
 *
 * Works in conjunction with CommandDecorationsAddon.
 */

import type { CommandDecorationsAddon, CommandMark } from './command-decorations-addon';
import type { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';

// ============================================================================
// Types
// ============================================================================

/** Navigation direction */
export type NavigationDirection = 'previous' | 'next';

/** Navigation filter */
export type NavigationFilter = 'all' | 'failed' | 'successful';

/** Navigation callbacks */
export interface MarkNavigationCallbacks {
  onNavigate?: (mark: CommandMark | undefined, direction: NavigationDirection) => void;
  onMarkSelected?: (mark: CommandMark) => void;
}

/** Key binding configuration */
export interface KeyBindings {
  previousCommand: string;
  nextCommand: string;
  previousFailed: string;
  nextFailed: string;
}

const DEFAULT_KEY_BINDINGS: KeyBindings = {
  previousCommand: 'ctrl+up',
  nextCommand: 'ctrl+down',
  previousFailed: 'ctrl+shift+up',
  nextFailed: 'ctrl+shift+down',
};

// ============================================================================
// MarkNavigationAddon
// ============================================================================

export class MarkNavigationAddon implements ITerminalAddon {
  private _terminal: Terminal | undefined;
  private _decorationsAddon: CommandDecorationsAddon | undefined;
  private _disposables: IDisposable[] = [];
  private _currentMarkIndex = -1;
  private _keyBindings: KeyBindings;
  private _callbacks: MarkNavigationCallbacks;

  constructor(
    decorationsAddon?: CommandDecorationsAddon,
    callbacks: MarkNavigationCallbacks = {},
    keyBindings?: Partial<KeyBindings>
  ) {
    this._decorationsAddon = decorationsAddon;
    this._callbacks = callbacks;
    this._keyBindings = { ...DEFAULT_KEY_BINDINGS, ...keyBindings };
  }

  // ========================================================================
  // ITerminalAddon Implementation
  // ========================================================================

  activate(terminal: Terminal): void {
    this._terminal = terminal;

    // Set up keyboard event listener
    // Note: attachCustomKeyEventHandler doesn't return a disposable,
    // but we can clean up by setting a new handler in dispose
    terminal.attachCustomKeyEventHandler((event) => {
      return this._handleKeyEvent(event);
    });
  }

  dispose(): void {
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables = [];
    this._terminal = undefined;
    this._decorationsAddon = undefined;
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Set the decorations addon (can be set after construction)
   */
  setDecorationsAddon(addon: CommandDecorationsAddon): void {
    this._decorationsAddon = addon;
  }

  /**
   * Navigate to the previous command
   */
  navigatePrevious(filter: NavigationFilter = 'all'): CommandMark | undefined {
    return this._navigate('previous', filter);
  }

  /**
   * Navigate to the next command
   */
  navigateNext(filter: NavigationFilter = 'all'): CommandMark | undefined {
    return this._navigate('next', filter);
  }

  /**
   * Navigate to first command
   */
  navigateToFirst(): CommandMark | undefined {
    const marks = this._getFilteredMarks('all');
    if (marks.length === 0) {
      return undefined;
    }

    this._currentMarkIndex = 0;
    const mark = marks[0];
    if (mark) {
      this._scrollToMark(mark);
      return mark;
    }
    return undefined;
  }

  /**
   * Navigate to last command
   */
  navigateToLast(): CommandMark | undefined {
    const marks = this._getFilteredMarks('all');
    if (marks.length === 0) {
      return undefined;
    }

    this._currentMarkIndex = marks.length - 1;
    const mark = marks[this._currentMarkIndex];
    if (mark) {
      this._scrollToMark(mark);
      return mark;
    }
    return undefined;
  }

  /**
   * Get current mark
   */
  getCurrentMark(): CommandMark | undefined {
    const marks = this._getFilteredMarks('all');
    if (this._currentMarkIndex >= 0 && this._currentMarkIndex < marks.length) {
      return marks[this._currentMarkIndex];
    }
    return undefined;
  }

  /**
   * Clear navigation state
   */
  resetNavigation(): void {
    this._currentMarkIndex = -1;
  }

  /**
   * Update key bindings
   */
  setKeyBindings(bindings: Partial<KeyBindings>): void {
    this._keyBindings = { ...this._keyBindings, ...bindings };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private _handleKeyEvent(event: KeyboardEvent): boolean {
    const keyCombo = this._getKeyCombo(event);

    // Check for navigation keys
    if (keyCombo === this._keyBindings.previousCommand) {
      this.navigatePrevious('all');
      return false; // Prevent default
    }

    if (keyCombo === this._keyBindings.nextCommand) {
      this.navigateNext('all');
      return false;
    }

    if (keyCombo === this._keyBindings.previousFailed) {
      this.navigatePrevious('failed');
      return false;
    }

    if (keyCombo === this._keyBindings.nextFailed) {
      this.navigateNext('failed');
      return false;
    }

    // Allow default handling
    return true;
  }

  private _getKeyCombo(event: KeyboardEvent): string {
    const parts: string[] = [];

    if (event.ctrlKey || event.metaKey) {
      parts.push('ctrl');
    }
    if (event.shiftKey) {
      parts.push('shift');
    }
    if (event.altKey) {
      parts.push('alt');
    }

    // Normalize key names
    let key = event.key.toLowerCase();
    if (key === 'arrowup') {
      key = 'up';
    }
    if (key === 'arrowdown') {
      key = 'down';
    }
    if (key === 'arrowleft') {
      key = 'left';
    }
    if (key === 'arrowright') {
      key = 'right';
    }

    parts.push(key);
    return parts.join('+');
  }

  private _navigate(
    direction: NavigationDirection,
    filter: NavigationFilter
  ): CommandMark | undefined {
    const marks = this._getFilteredMarks(filter);
    if (marks.length === 0) {
      this._callbacks.onNavigate?.(undefined, direction);
      return undefined;
    }

    // Find current position based on scroll position
    if (this._currentMarkIndex < 0) {
      this._currentMarkIndex = this._findCurrentMarkIndex(marks);
    }

    // Calculate new index
    if (direction === 'previous') {
      this._currentMarkIndex = Math.max(0, this._currentMarkIndex - 1);
    } else {
      this._currentMarkIndex = Math.min(marks.length - 1, this._currentMarkIndex + 1);
    }

    const mark = marks[this._currentMarkIndex];
    if (mark) {
      this._scrollToMark(mark);
      this._callbacks.onNavigate?.(mark, direction);
      return mark;
    }

    return undefined;
  }

  private _getFilteredMarks(filter: NavigationFilter): CommandMark[] {
    if (!this._decorationsAddon) {
      return [];
    }

    const allMarks = this._decorationsAddon.getCommandMarks();

    switch (filter) {
      case 'failed':
        return allMarks.filter((m) => m.exitCode !== undefined && m.exitCode !== 0);
      case 'successful':
        return allMarks.filter((m) => m.exitCode === 0);
      case 'all':
      default:
        return [...allMarks];
    }
  }

  private _findCurrentMarkIndex(marks: CommandMark[]): number {
    if (!this._terminal || marks.length === 0) {
      return 0;
    }

    const buffer = this._terminal.buffer.active;
    const currentLine = buffer.baseY + buffer.cursorY;

    // Find the mark closest to current line
    for (let i = marks.length - 1; i >= 0; i--) {
      const mark = marks[i];
      if (mark && mark.startLine <= currentLine) {
        return i;
      }
    }

    return 0;
  }

  private _scrollToMark(mark: CommandMark): void {
    if (this._decorationsAddon) {
      this._decorationsAddon.scrollToMark(mark.id);
    } else if (this._terminal) {
      this._terminal.scrollToLine(mark.startLine);
    }

    this._callbacks.onMarkSelected?.(mark);
  }
}

// ============================================================================
// Export
// ============================================================================

export default MarkNavigationAddon;
