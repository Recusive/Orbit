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
 */
function detectThemeFromCSSVars(): ITheme | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const root = document.documentElement;
  const style = getComputedStyle(root);

  // Check if we have terminal CSS variables
  const bgColor = style.getPropertyValue('--terminal-bg').trim();
  if (!bgColor) {
    return undefined;
  }

  const getCSSVar = (name: string): string | undefined => {
    const value = style.getPropertyValue(name).trim();
    return value || undefined;
  };

  const theme: ITheme = { ...DARK_THEME };

  const bg = getCSSVar('--terminal-bg');
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
 * Tries CSS variables first (--terminal-bg, --terminal-fg, --terminal-cursor),
 * falls back to the default dark theme if no CSS variables are defined.
 *
 * @returns ITheme object compatible with xterm.js Terminal options
 */
export function getBestTheme(): ITheme {
  return detectThemeFromCSSVars() ?? DARK_THEME;
}
