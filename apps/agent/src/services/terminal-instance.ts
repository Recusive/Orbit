/**
 * TerminalInstance - VS Code-style terminal instance that owns xterm.js
 *
 * Lifecycle is NOT tied to React - persists until explicitly destroyed.
 * Uses VS Code's attach/detach pattern for DOM management.
 *
 * Reference: Orbit/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts
 */

import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import type { IDisposable, ITheme } from '@xterm/xterm';

import { trace } from '@/dev-monitor';
import { CommandDecorationsAddon } from '@/lib/terminal/addons/command-decorations-addon';
import { MarkNavigationAddon } from '@/lib/terminal/addons/mark-navigation-addon';
import { ShellIntegrationAddon } from '@/lib/terminal/addons/shell-integration-addon';
import { getBestTheme } from '@/lib/terminal/utils/theme-sync';
import { TerminalResizeDebouncer } from '@/services/terminal-resize-debouncer';

import '@xterm/xterm/css/xterm.css';

// ============================================================================
// Constants
// ============================================================================

const FLOW_CONTROL = {
  /** Threshold for sending acknowledgment (must be less than PTY highWaterMark of 25KB) */
  ackThreshold: 10000, // 10KB
} as const;

// ============================================================================
// Types
// ============================================================================

export interface TerminalInstanceOptions {
  sessionId: string;
  sessionName: string;
  postMessage: (message: unknown) => void;
  isMockMode?: boolean;
  /** Enable copy-on-selection (auto-copy selected text to clipboard) */
  copyOnSelection?: boolean;
  onConnected?: (terminalId: string, pid?: number, shellType?: string, name?: string) => void;
  onDisconnected?: (exitCode?: number) => void;
  onCwdChange?: (cwd: string) => void;
  onCommandStart?: (commandLine?: string) => void;
  onCommandEnd?: (exitCode: number) => void;
  onCapabilitiesChange?: (capabilities: {
    cwd_detection: boolean;
    command_detection: boolean;
    shell_integration: boolean;
  }) => void;
  onTitleChange?: (title: string) => void;
}

export interface TerminalCapabilities {
  cwd_detection: boolean;
  command_detection: boolean;
  shell_integration: boolean;
}

// ============================================================================
// TerminalInstance Class
// ============================================================================

export class TerminalInstance {
  // Core state
  readonly sessionId: string;
  readonly sessionName: string;
  private terminalId: string | null = null;
  private isConnected = false;
  private isDisposed = false;
  private ptyRequested = false;

  // Copy-on-selection
  private _copyOnSelection = false;

  // xterm.js
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private searchAddon: SearchAddon;
  private decorationsAddon: CommandDecorationsAddon;

  // DOM - VS Code pattern: wrapper element that can be moved between containers
  private wrapperElement: HTMLElement;
  private container: HTMLElement | null = null;
  private isVisible = false;

  // Flow control
  private unacknowledgedBytes = 0;
  private ackInterval: ReturnType<typeof setInterval> | null = null;

  // Resize debouncer (VS Code pattern - separates X/Y, uses idle callbacks)
  private resizeDebouncer: TerminalResizeDebouncer;
  private _disableLayout = false;

  // Disposables
  private disposables: IDisposable[] = [];

  // Theme observer
  private themeObserver: MutationObserver | null = null;

  // Callbacks
  private postMessage: (message: unknown) => void;
  private isMockMode: boolean;
  private onConnected?: TerminalInstanceOptions['onConnected'];
  private onDisconnected?: TerminalInstanceOptions['onDisconnected'];
  private onCwdChange?: TerminalInstanceOptions['onCwdChange'];
  private onCommandStart?: TerminalInstanceOptions['onCommandStart'];
  private onCommandEnd?: TerminalInstanceOptions['onCommandEnd'];
  private onCapabilitiesChange?: TerminalInstanceOptions['onCapabilitiesChange'];
  private onTitleChange?: TerminalInstanceOptions['onTitleChange'];

  constructor(options: TerminalInstanceOptions) {
    this.sessionId = options.sessionId;
    this.sessionName = options.sessionName;
    this.postMessage = options.postMessage;
    this.isMockMode = options.isMockMode ?? false;
    this._copyOnSelection = options.copyOnSelection ?? false;
    this.onConnected = options.onConnected;
    this.onDisconnected = options.onDisconnected;
    this.onCwdChange = options.onCwdChange;
    this.onCommandStart = options.onCommandStart;
    this.onCommandEnd = options.onCommandEnd;
    this.onCapabilitiesChange = options.onCapabilitiesChange;
    this.onTitleChange = options.onTitleChange;

    // Create wrapper element
    this.wrapperElement = document.createElement('div');
    this.wrapperElement.className = 'terminal-instance-wrapper';
    this.wrapperElement.style.cssText = 'height: 100%; width: 100%; padding: 4px 8px;';

    // Build xterm theme from CSS variables
    // xterm.js requires computed color values, not CSS variable references
    const theme = this.buildThemeFromCSSVars();

    // Create terminal and wrap with dev-monitor for performance tracking
    const rawTerminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.2,
      scrollback: 10000,
      theme,
      allowProposedApi: true,
    });
    this.terminal = trace.xterm(this.sessionName, rawTerminal);

    // Load addons
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.searchAddon = new SearchAddon();
    this.terminal.loadAddon(this.searchAddon);

    const webLinksAddon = new WebLinksAddon();
    this.terminal.loadAddon(webLinksAddon);

    // Command decorations addon
    this.decorationsAddon = new CommandDecorationsAddon({
      showGutterMarkers: true,
      showStatusIcons: true,
      gutterWidth: 24,
    });
    this.terminal.loadAddon(this.decorationsAddon);

    // Mark navigation addon
    const markNavigationAddon = new MarkNavigationAddon(this.decorationsAddon);
    this.terminal.loadAddon(markNavigationAddon);

    // Shell integration addon
    const shellIntegrationAddon = new ShellIntegrationAddon({
      onCommandStart: (commandLine) => {
        this.decorationsAddon.markCommandStart(commandLine);
        this.onCommandStart?.(commandLine);
      },
      onCommandEnd: (_commandLine, exitCode) => {
        this.decorationsAddon.markCommandEnd(exitCode ?? 0);
        if (exitCode !== undefined) {
          this.onCommandEnd?.(exitCode);
        }
      },
      onCwdChange: (cwd) => {
        this.onCwdChange?.(cwd);
      },
      onCapabilitiesChange: (capabilities) => {
        this.onCapabilitiesChange?.({
          cwd_detection: capabilities.cwdDetection,
          command_detection: capabilities.commandDetection,
          shell_integration: capabilities.shellIntegration,
        });
      },
    });
    this.terminal.loadAddon(shellIntegrationAddon);

    // Open terminal INTO the wrapper element (not a container yet)
    this.terminal.open(this.wrapperElement);

    // Set up input handling
    this.setupInputHandling();

    // Set up flow control
    this.setupFlowControl();

    // Set up copy-on-selection
    this.setupCopyOnSelection();

    // Set up resize debouncer (VS Code pattern)
    // This replaces ResizeObserver - container will call layout() instead
    this.resizeDebouncer = new TerminalResizeDebouncer(
      () => this.terminal,
      () => this.isVisible,
      () => {
        if (!this._disableLayout && !this.isDisposed) {
          this.fitAddon.fit();
        }
      }
    );

    // Set up theme observer to sync with app theme
    this.setupThemeObserver();
  }

  // ==========================================================================
  // VS Code Pattern: attach/detach/setVisible
  // ==========================================================================

  /**
   * Attach xterm to a container element.
   * Does NOT create new xterm - just moves the wrapper element.
   * Reference: terminalInstance.ts:981-1008
   */
  attachToElement(container: HTMLElement): void {
    if (this.isDisposed) return;

    // No-op if already attached to this container
    if (this.container === container) return;

    // Set new container and append wrapper
    this.container = container;
    this.container.appendChild(this.wrapperElement);

    // Refresh xterm rendering
    this.terminal.refresh(0, this.terminal.rows - 1);

    // Layout will be called by container's ResizeObserver

    // Request PTY creation on FIRST attach only
    if (!this.ptyRequested) {
      this.ptyRequested = true;
      this.requestPtyCreation();
    }
  }

  /**
   * Detach from container but keep xterm alive.
   * Reference: terminalInstance.ts:976-979
   */
  detachFromElement(): void {
    if (this.isDisposed) return;

    this.wrapperElement.remove();
    this.container = null;
  }

  /**
   * Show/hide with CSS - VS Code pattern.
   * Reference: terminalGroup.ts:517-523
   */
  setVisible(visible: boolean): void {
    if (this.isDisposed) return;
    // Skip if visibility hasn't changed - prevents expensive flush() on re-renders
    if (this.isVisible === visible) return;

    this.isVisible = visible;
    this.wrapperElement.style.display = visible ? '' : 'none';

    if (visible) {
      // Flush any pending resize operations when becoming visible
      this.resizeDebouncer.flush();
      // Auto-focus when becoming visible
      setTimeout(() => {
        this.terminal.focus();
      }, 50);
    }
  }

  /**
   * Focus the terminal
   */
  focus(): void {
    if (this.isDisposed) return;
    this.terminal.focus();
  }

  // ==========================================================================
  // PTY Communication
  // ==========================================================================

  private requestPtyCreation(): void {
    const cols = this.terminal.cols;
    const rows = this.terminal.rows;

    this.postMessage({
      type: 'terminal:create',
      uuid: crypto.randomUUID(),
      session_id: this.sessionId,
      name: this.sessionName,
      cols,
      rows,
      shell_integration: true,
    });

    // Mock mode: show welcome message
    if (this.isMockMode) {
      this.terminal.writeln(`Welcome to ${this.sessionName} (Mock Mode)`);
      this.terminal.writeln('Real PTY not available in browser development mode.');
      this.terminal.write('\r\n$ ');
    }
  }

  /**
   * Handle messages from Orbit backend
   */
  handleMessage(message: {
    type: string;
    terminal_id?: string;
    session_id?: string;
    data?: string;
    exit_code?: number;
    pid?: number;
    shell_type?: string;
    name?: string;
    cwd?: string;
    command_line?: string;
    capabilities?: TerminalCapabilities;
    title?: string;
  }): void {
    if (this.isDisposed) return;

    switch (message.type) {
      case 'terminal:created': {
        // Check if this message is for our session
        if (message.session_id !== this.sessionId) return;

        this.terminalId = message.terminal_id ?? null;
        this.isConnected = true;
        this.onConnected?.(
          message.terminal_id ?? '',
          message.pid,
          message.shell_type,
          message.name
        );
        break;
      }

      case 'terminal:data': {
        if (message.terminal_id !== this.terminalId) return;

        // Write data to xterm
        if (message.data) {
          this.terminal.write(message.data);
          this.unacknowledgedBytes += message.data.length;
        }
        break;
      }

      case 'terminal:exited': {
        if (message.terminal_id !== this.terminalId) return;

        this.isConnected = false;
        this.onDisconnected?.(message.exit_code);

        // Show exit message
        this.terminal.writeln('');
        this.terminal.writeln(`\r\n[Process exited with code ${String(message.exit_code ?? 0)}]`);
        break;
      }

      case 'terminal:cwd': {
        if (message.terminal_id !== this.terminalId) return;
        if (message.cwd) {
          this.onCwdChange?.(message.cwd);
        }
        break;
      }

      case 'terminal:capabilities': {
        if (message.terminal_id !== this.terminalId) return;
        if (message.capabilities) {
          this.onCapabilitiesChange?.(message.capabilities);
        }
        break;
      }

      case 'terminal:command:start': {
        if (message.terminal_id !== this.terminalId) return;
        this.decorationsAddon.markCommandStart(message.command_line);
        this.onCommandStart?.(message.command_line);
        break;
      }

      case 'terminal:command:end': {
        if (message.terminal_id !== this.terminalId) return;
        if (message.exit_code !== undefined) {
          this.decorationsAddon.markCommandEnd(message.exit_code);
          this.onCommandEnd?.(message.exit_code);
        }
        break;
      }

      case 'terminal:title': {
        if (message.terminal_id !== this.terminalId) return;
        if (message.title) {
          this.onTitleChange?.(message.title);
        }
        break;
      }
    }
  }

  // ==========================================================================
  // Private Setup Methods
  // ==========================================================================

  /**
   * Build xterm theme by computing CSS variable values.
   * xterm.js doesn't support CSS variables directly, so we compute the
   * actual color values at runtime.
   */
  private buildThemeFromCSSVars(): ITheme {
    const baseTheme = getBestTheme();

    // Create temporary element to compute CSS variable values
    const tempEl = document.createElement('div');
    document.body.appendChild(tempEl);

    const getComputedColor = (cssVar: string, property: 'color' | 'backgroundColor'): string => {
      tempEl.style[property] = `var(${cssVar})`;
      return getComputedStyle(tempEl)[property];
    };

    const bgColor = getComputedColor('--sidebar', 'backgroundColor');
    const fgColor = getComputedColor('--sidebar-foreground', 'color');
    const accentColor = getComputedColor('--sidebar-accent', 'color');
    const cursorColor = getComputedColor('--sidebar-foreground', 'color');

    document.body.removeChild(tempEl);

    // Convert rgb to rgba with opacity for selection highlight
    const selectionBg = accentColor.replace('rgb(', 'rgba(').replace(')', ', 0.5)');

    return {
      ...baseTheme,
      background: bgColor,
      foreground: fgColor,
      cursor: cursorColor,
      cursorAccent: bgColor,
      selectionBackground: selectionBg,
    };
  }

  private setupInputHandling(): void {
    // Handle user input
    const dataDisposable = this.terminal.onData((data) => {
      if (this.isMockMode) {
        // Mock mode: echo back
        this.terminal.write(data);
        if (data === '\r') {
          this.terminal.write('\n$ ');
        }
      } else if (this.terminalId && this.isConnected) {
        this.postMessage({
          type: 'terminal:write',
          uuid: crypto.randomUUID(),
          terminal_id: this.terminalId,
          data,
        });
      }
    });
    this.disposables.push(dataDisposable);

    // Handle terminal resize
    const resizeDisposable = this.terminal.onResize((size) => {
      if (this.terminalId && this.isConnected) {
        this.postMessage({
          type: 'terminal:resize',
          uuid: crypto.randomUUID(),
          terminal_id: this.terminalId,
          cols: size.cols,
          rows: size.rows,
        });
      }
    });
    this.disposables.push(resizeDisposable);
  }

  private setupFlowControl(): void {
    this.ackInterval = setInterval(() => {
      if (this.unacknowledgedBytes >= FLOW_CONTROL.ackThreshold && this.terminalId) {
        this.postMessage({
          type: 'terminal:ack',
          uuid: crypto.randomUUID(),
          terminal_id: this.terminalId,
          byte_count: this.unacknowledgedBytes,
        });
        this.unacknowledgedBytes = 0;
      }
    }, 100);
  }

  private setupCopyOnSelection(): void {
    const selectionDisposable = this.terminal.onSelectionChange(() => {
      if (!this._copyOnSelection) return;

      const selection = this.terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {
          // Silently fail if clipboard not available
        });
      }
    });
    this.disposables.push(selectionDisposable);
  }

  /**
   * Set up a MutationObserver to watch for theme changes (dark mode toggle).
   * Updates the terminal theme when the 'dark' class is added/removed from <html>.
   */
  private setupThemeObserver(): void {
    if (typeof document === 'undefined') return;

    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          // Theme changed, update terminal theme
          this.updateTheme();
          break;
        }
      }
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  /**
   * Update the terminal theme by recomputing CSS variable values.
   * Called when dark mode is toggled.
   */
  updateTheme(): void {
    if (this.isDisposed) return;

    const newTheme = this.buildThemeFromCSSVars();
    this.terminal.options.theme = newTheme;
  }

  // ==========================================================================
  // Clipboard Methods (for context menu)
  // ==========================================================================

  /**
   * Get the current text selection from the terminal
   */
  getSelection(): string {
    return this.terminal.getSelection();
  }

  /**
   * Check if there is an active selection
   */
  hasSelection(): boolean {
    return this.terminal.hasSelection();
  }

  /**
   * Copy the current selection to clipboard
   */
  async copySelection(): Promise<void> {
    const selection = this.terminal.getSelection();
    if (selection) {
      await navigator.clipboard.writeText(selection);
    }
  }

  /**
   * Paste text from clipboard into terminal
   */
  async paste(): Promise<void> {
    const text = await navigator.clipboard.readText();
    if (text && this.terminalId && this.isConnected) {
      this.postMessage({
        type: 'terminal:write',
        uuid: crypto.randomUUID(),
        terminal_id: this.terminalId,
        data: text,
      });
    }
  }

  /**
   * Clear the terminal buffer
   */
  clear(): void {
    this.terminal.clear();
  }

  /**
   * Enable or disable copy-on-selection
   */
  set copyOnSelection(value: boolean) {
    this._copyOnSelection = value;
  }

  get copyOnSelection(): boolean {
    return this._copyOnSelection;
  }

  // ==========================================================================
  // Search Methods
  // ==========================================================================

  /**
   * Search for text in the terminal buffer (forward)
   * @returns true if a match was found
   */
  findNext(
    query: string,
    options?: {
      caseSensitive?: boolean;
      regex?: boolean;
      wholeWord?: boolean;
    }
  ): boolean {
    if (!query) return false;
    return this.searchAddon.findNext(query, {
      caseSensitive: options?.caseSensitive ?? false,
      regex: options?.regex ?? false,
      wholeWord: options?.wholeWord ?? false,
    });
  }

  /**
   * Search for text in the terminal buffer (backward)
   * @returns true if a match was found
   */
  findPrevious(
    query: string,
    options?: {
      caseSensitive?: boolean;
      regex?: boolean;
      wholeWord?: boolean;
    }
  ): boolean {
    if (!query) return false;
    return this.searchAddon.findPrevious(query, {
      caseSensitive: options?.caseSensitive ?? false,
      regex: options?.regex ?? false,
      wholeWord: options?.wholeWord ?? false,
    });
  }

  /**
   * Clear the current search highlighting
   */
  clearSearch(): void {
    this.searchAddon.clearDecorations();
  }

  // ==========================================================================
  // Getters & Setters
  // ==========================================================================

  getTerminalId(): string | null {
    return this.terminalId;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  getIsDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Update the postMessage function.
   * Called by TerminalInstanceManager when React remounts and provides
   * a new postMessage reference. This keeps the terminal alive across
   * React lifecycle changes.
   */
  updatePostMessage(postMessage: (message: unknown) => void): void {
    this.postMessage = postMessage;
  }

  /**
   * Layout the terminal with given container dimensions.
   * Called by the container's ResizeObserver (VS Code pattern).
   * Uses debouncer to prevent UI blocking.
   */
  layout(width: number, height: number): void {
    if (this._disableLayout || this.isDisposed) return;
    if (width <= 0 || height <= 0) return;

    // Request resize through debouncer
    // The debouncer handles visibility-aware scheduling
    this.resizeDebouncer.resize(this.terminal.cols, this.terminal.rows);
  }

  /**
   * Disable/enable layout calculations.
   * Set to true during DOM manipulation to prevent expensive resize operations.
   * (VS Code pattern: _withDisabledLayout)
   */
  set disableLayout(value: boolean) {
    this._disableLayout = value;
  }

  get disableLayout(): boolean {
    return this._disableLayout;
  }

  // ==========================================================================
  // Disposal - Only called on explicit close
  // ==========================================================================

  /**
   * Dispose the terminal instance.
   * Sends terminal:close to backend and cleans up resources.
   * Only call this on explicit user close action!
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Clear flow control interval
    if (this.ackInterval) {
      clearInterval(this.ackInterval);
      this.ackInterval = null;
    }

    // Disconnect theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    // Dispose resize debouncer
    this.resizeDebouncer.dispose();

    // Send close message to backend
    if (this.terminalId && this.isConnected) {
      this.postMessage({
        type: 'terminal:close',
        uuid: crypto.randomUUID(),
        session_id: this.sessionId,
        terminal_id: this.terminalId,
      });
    }

    // Dispose all listeners
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    // Remove from DOM
    this.wrapperElement.remove();

    // Dispose xterm
    this.terminal.dispose();
  }
}
