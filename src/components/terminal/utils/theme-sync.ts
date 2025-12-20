/**
 * Terminal Theme Sync Utility
 *
 * Provides theme configuration for xterm.js terminal.
 */

import type { ITheme } from '@xterm/xterm';

// ============================================================================
// Types
// ============================================================================

/** Theme preset names */
export type ThemePreset = 'dark' | 'light' | 'high-contrast' | 'custom';

/** Terminal color configuration */
export interface TerminalColors {
  foreground?: string;
  background?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

// ============================================================================
// Default Themes
// ============================================================================

/** Default dark theme */
export const DARK_THEME: ITheme = {
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

/** Light theme */
export const LIGHT_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

/** High contrast theme */
export const HIGH_CONTRAST_THEME: ITheme = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: '#ffffff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#f44747',
  green: '#17a45e',
  yellow: '#ffff00',
  blue: '#75beff',
  magenta: '#b180d7',
  cyan: '#27d9d8',
  white: '#ffffff',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#73c991',
  brightYellow: '#ffff00',
  brightBlue: '#75beff',
  brightMagenta: '#b180d7',
  brightCyan: '#27d9d8',
  brightWhite: '#ffffff',
};

// ============================================================================
// Theme Conversion
// ============================================================================

/**
 * Convert terminal colors to xterm.js theme
 */
export function colorsToXtermTheme(colors: TerminalColors): ITheme {
  const theme: ITheme = { ...DARK_THEME };

  if (colors.background) theme.background = colors.background;
  if (colors.foreground) theme.foreground = colors.foreground;
  if (colors.cursor) theme.cursor = colors.cursor;
  if (colors.cursorAccent) theme.cursorAccent = colors.cursorAccent;
  if (colors.selectionBackground) theme.selectionBackground = colors.selectionBackground;
  if (colors.selectionForeground) theme.selectionForeground = colors.selectionForeground;
  if (colors.black) theme.black = colors.black;
  if (colors.red) theme.red = colors.red;
  if (colors.green) theme.green = colors.green;
  if (colors.yellow) theme.yellow = colors.yellow;
  if (colors.blue) theme.blue = colors.blue;
  if (colors.magenta) theme.magenta = colors.magenta;
  if (colors.cyan) theme.cyan = colors.cyan;
  if (colors.white) theme.white = colors.white;
  if (colors.brightBlack) theme.brightBlack = colors.brightBlack;
  if (colors.brightRed) theme.brightRed = colors.brightRed;
  if (colors.brightGreen) theme.brightGreen = colors.brightGreen;
  if (colors.brightYellow) theme.brightYellow = colors.brightYellow;
  if (colors.brightBlue) theme.brightBlue = colors.brightBlue;
  if (colors.brightMagenta) theme.brightMagenta = colors.brightMagenta;
  if (colors.brightCyan) theme.brightCyan = colors.brightCyan;
  if (colors.brightWhite) theme.brightWhite = colors.brightWhite;

  return theme;
}

/**
 * Get theme by preset name
 */
export function getThemeByPreset(preset: ThemePreset): ITheme {
  switch (preset) {
    case 'light':
      return LIGHT_THEME;
    case 'high-contrast':
      return HIGH_CONTRAST_THEME;
    case 'dark':
    case 'custom':
    default:
      return DARK_THEME;
  }
}

// ============================================================================
// CSS Variable Detection
// ============================================================================

/**
 * Try to detect theme from CSS custom properties
 */
export function detectThemeFromCSSVars(): ITheme | undefined {
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

/**
 * Get the best available theme
 * Tries CSS variables first, falls back to dark theme
 */
export function getBestTheme(): ITheme {
  return detectThemeFromCSSVars() ?? DARK_THEME;
}

// ============================================================================
// Theme Utilities
// ============================================================================

/**
 * Merge partial theme with defaults
 */
export function mergeTheme(partial: Partial<ITheme>, base: ITheme = DARK_THEME): ITheme {
  return { ...base, ...partial };
}

/**
 * Check if a theme is considered "dark"
 */
export function isThemeDark(theme: ITheme): boolean {
  const bg = theme.background ?? '#000000';
  // Parse hex color and check luminance
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
