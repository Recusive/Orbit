/**
 * TerminalInstance - VS Code-style terminal instance that owns xterm.js
 *
 * Lifecycle is NOT tied to React - persists until explicitly destroyed.
 * Uses VS Code's attach/detach pattern for DOM management.
 *
 * Reference: Orbit/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts
 */

import { createLogger } from '@orbit/common/lib';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import type { IDisposable, ITheme } from '@xterm/xterm';

import { CommandDecorationsAddon } from '@/lib/terminal/addons/command-decorations-addon';
import { MarkNavigationAddon } from '@/lib/terminal/addons/mark-navigation-addon';
import { ShellIntegrationAddon } from '@/lib/terminal/addons/shell-integration-addon';
import { getBestTheme } from '@/lib/terminal/utils/theme-sync';
import { TerminalFitDebouncer } from '@/services/terminal/terminal-fit-debouncer';

import '@xterm/xterm/css/xterm.css';
// CSS imported here (not in component) because TerminalInstance creates DOM elements directly.
// This ensures styles are loaded when the class is instantiated, regardless of React lifecycle.
import '@/styles/terminal.css';

const logger = createLogger('TerminalInstance');

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
  private ptyCreationObserver: ResizeObserver | null = null;

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

  // Fit debouncer - debounces fitAddon.fit() calls for performance
  private fitDebouncer: TerminalFitDebouncer;
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

    logger.info(`Creating terminal: ${options.sessionName}`, { sessionId: options.sessionId });

    // Create wrapper element - uses CSS from terminal.css
    // Padding is handled by .terminal-wrapper .xterm CSS rules
    this.wrapperElement = document.createElement('div');
    this.wrapperElement.className = 'terminal-instance-wrapper';

    // Build xterm theme from CSS variables
    // xterm.js requires computed color values, not CSS variable references
    const theme = this.buildThemeFromCSSVars();

    // Create terminal
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.2,
      scrollback: 10000,
      theme,
      allowProposedApi: true,
    });

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

    // Set up fit debouncer - debounces fitAddon.fit() calls
    // Container's ResizeObserver calls layout() which triggers this
    this.fitDebouncer = new TerminalFitDebouncer(this.fitAddon, () => this.isVisible);

    // Set up theme observer to sync with app theme
    this.setupThemeObserver();

    // Set up keyboard shortcuts (Cmd+C to copy when selection exists)
    this.setupKeyboardShortcuts();
  }

  // ==========================================================================
  // VS Code Pattern: attach/detach/setVisible
  // ==========================================================================

  /**
   * Attach xterm to a container element.
   * Does NOT create new xterm - just moves the wrapper element.
   *
   * IMPORTANT: On first attach, we use ResizeObserver to wait for the container
   * to have valid dimensions (width > 0 && height > 0) before creating the PTY.
   * This is more robust than RAF-based timing because it handles complex layout
   * hierarchies (flexbox, absolute positioning, etc.) that may need multiple
   * layout passes before dimensions are finalized.
   */
  attachToElement(container: HTMLElement): void {
    if (this.isDisposed) return;

    // No-op if already attached to this container
    if (this.container === container) return;

    const isFirstAttach = !this.ptyRequested;

    // Set new container and append wrapper
    this.container = container;
    this.container.appendChild(this.wrapperElement);

    // Refresh xterm rendering
    this.terminal.refresh(0, this.terminal.rows - 1);

    // Request PTY creation on FIRST attach only
    if (isFirstAttach) {
      this.ptyRequested = true;

      // Use ResizeObserver to wait for valid dimensions
      // This is more reliable than RAF because it fires when the browser
      // has actually calculated the layout, regardless of how many passes that takes
      this.ptyCreationObserver = new ResizeObserver((entries) => {
        if (this.isDisposed) return;

        const entry = entries[0];
        if (!entry) return;

        const { width, height } = entry.contentRect;

        // Wait until we have actual dimensions
        if (width > 0 && height > 0) {
          // Disconnect observer - we only need it once
          this.ptyCreationObserver?.disconnect();
          this.ptyCreationObserver = null;

          // Now fit to container - this calculates correct cols/rows
          this.fitDebouncer.forcefit();

          // Log dimensions for debugging
          logger.info('Terminal fitted before PTY creation', {
            sessionId: this.sessionId,
            cols: this.terminal.cols,
            rows: this.terminal.rows,
            containerWidth: width,
            containerHeight: height,
          });

          // Now request PTY with correct cols/rows
          this.requestPtyCreation();
        } else {
          logger.debug('Waiting for container dimensions', {
            sessionId: this.sessionId,
            width,
            height,
          });
        }
      });

      this.ptyCreationObserver.observe(container);
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
      // Flush any pending fit operations and force re-fit when becoming visible
      this.fitDebouncer.flush();
      this.fitDebouncer.forcefit();
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

    const bgColor = getComputedColor('--chat-area', 'backgroundColor');
    const fgColor = getComputedColor('--foreground', 'color');
    const cursorColor = getComputedColor('--foreground', 'color');
    const selectionColor = getComputedColor('--accent', 'backgroundColor');

    document.body.removeChild(tempEl);

    // WARNING: Do NOT modify selectionBg to add rgba() transparency!
    // The accent color from CSS already has correct opacity for selection.
    // Adding .replace('rgb(', 'rgba(').replace(')', ', 0.5)') breaks selection rendering.
    const selectionBg = selectionColor;

    return {
      ...baseTheme,
      background: bgColor,
      foreground: fgColor,
      cursor: cursorColor,
      cursorAccent: bgColor,
      selectionBackground: selectionBg,
      // Note: xterm.js uses native browser scrollbar styled via CSS in terminal.css
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

  /**
   * Set up keyboard shortcuts for the terminal.
   *
   * Uses a DOM event listener on the wrapper element (capturing phase) to intercept
   * keyboard events BEFORE xterm processes them. This is more reliable than
   * attachCustomKeyEventHandler which can be overwritten by addons.
   *
   * VS Code pattern for Cmd+C / Ctrl+C:
   * - If there's a selection → copy to clipboard (don't send to PTY)
   * - If no selection → send SIGINT to PTY (interrupt running process)
   *
   * Also handles Cmd+V / Ctrl+V for paste.
   */
  private setupKeyboardShortcuts(): void {
    // Use capturing phase to intercept before xterm
    this.wrapperElement.addEventListener(
      'keydown',
      (event) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const modKey = isMac ? event.metaKey : event.ctrlKey;
        const key = event.key.toLowerCase();

        // Cmd+C / Ctrl+C - Copy if selection exists, otherwise let through for SIGINT
        if (modKey && key === 'c' && !event.shiftKey && !event.altKey) {
          if (this.terminal.hasSelection()) {
            // Copy selection to clipboard
            const selection = this.terminal.getSelection();
            if (selection) {
              event.preventDefault();
              event.stopPropagation();
              navigator.clipboard.writeText(selection).catch(() => {
                // Silently fail if clipboard not available
              });
              logger.debug('Copied selection to clipboard', { length: selection.length });
            }
            return;
          }
          // No selection - let event propagate to xterm for SIGINT
          return;
        }

        // Cmd+V / Ctrl+V - Paste from clipboard
        if (modKey && key === 'v' && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text && this.terminalId && this.isConnected) {
                this.postMessage({
                  type: 'terminal:write',
                  uuid: crypto.randomUUID(),
                  terminal_id: this.terminalId,
                  data: text,
                });
                logger.debug('Pasted from clipboard', { length: text.length });
              }
            })
            .catch(() => {
              // Silently fail if clipboard not available
            });
          return;
        }
      },
      true
    ); // true = capturing phase
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
   * Layout the terminal to fit container dimensions.
   * Called by the container's ResizeObserver.
   *
   * Uses debounced fitAddon.fit() which:
   * 1. Calculates proper cols/rows from container size
   * 2. Resizes xterm internally
   * 3. Triggers xterm's onResize event → sends to backend PTY
   */
  layout(): void {
    if (this._disableLayout || this.isDisposed) return;
    this.fitDebouncer.fit();
  }

  /**
   * Force an immediate fit to container dimensions.
   * Bypasses debouncer - use for critical moments like initial PTY creation.
   */
  forceFit(): void {
    if (this.isDisposed) return;
    this.fitDebouncer.forcefit();
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

    // Disconnect PTY creation observer (if still waiting)
    if (this.ptyCreationObserver) {
      this.ptyCreationObserver.disconnect();
      this.ptyCreationObserver = null;
    }

    // Dispose fit debouncer
    this.fitDebouncer.dispose();

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
