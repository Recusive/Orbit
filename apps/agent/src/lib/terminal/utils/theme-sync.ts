/**
 * Terminal Theme Sync Utility
 *
 * Provides theme configuration for xterm.js terminal.
 * Only exports getBestTheme() - the single function needed by TerminalInstance.
 */

import type { ITheme } from '@xterm/xterm';

// ============================================================================
// Internal: Default Theme
// ============================================================================

/**
 * Default dark theme (internal - used as fallback)
 */
const DARK_THEME: ITheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
};

// ============================================================================
// Internal: CSS Variable Detection
// ============================================================================

/**
 * Try to detect theme from CSS custom properties (internal)
 *
 * Background uses --background (the app background) for consistency.
 * Foreground and cursor still use --terminal-fg / --terminal-cursor.
 */
function detectThemeFromCSSVars(): ITheme | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const root = document.documentElement;
  const style = getComputedStyle(root);

  // Check if terminal CSS variables exist
  const fgColor = style.getPropertyValue('--terminal-fg').trim();
  if (!fgColor) {
    return undefined;
  }

  const getCSSVar = (name: string): string | undefined => {
    const value = style.getPropertyValue(name).trim();
    return value || undefined;
  };

  const theme: ITheme = { ...DARK_THEME };

  // Use --chat-area for the base theme since the terminal sits inside the chat area.
  // buildThemeFromCSSVars() in TerminalInstance will override this with a
  // computed value anyway, but this keeps the fallback chain consistent.
  const bg = getCSSVar('--chat-area');
  if (bg) theme.background = bg;
  const fg = getCSSVar('--terminal-fg');
  if (fg) theme.foreground = fg;
  const cursor = getCSSVar('--terminal-cursor');
  if (cursor) theme.cursor = cursor;

  return theme;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the best available theme for xterm.js
 *
 * Tries CSS variables first (--chat-area, --terminal-fg, --terminal-cursor),
 * falls back to the default dark theme if no CSS variables are defined.
 *
 * @returns ITheme object compatible with xterm.js Terminal options
 */
export function getBestTheme(): ITheme {
  return detectThemeFromCSSVars() ?? DARK_THEME;
}
