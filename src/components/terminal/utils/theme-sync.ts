/**
 * Terminal Theme Sync Utility
 *
 * Provides theme synchronization between VS Code and xterm.js terminal.
 * Can receive theme colors from VS Code or detect from CSS variables.
 */

import type { ITheme } from '@xterm/xterm';

// ============================================================================
// Types
// ============================================================================

/** VS Code terminal color tokens */
export interface VSCodeTerminalColors {
  'terminal.foreground'?: string;
  'terminal.background'?: string;
  'terminal.cursor'?: string;
  'terminal.cursorAccent'?: string;
  'terminal.selectionBackground'?: string;
  'terminal.selectionForeground'?: string;
  'terminalCursor.foreground'?: string;
  'terminalCursor.background'?: string;
  'terminal.ansiBlack'?: string;
  'terminal.ansiRed'?: string;
  'terminal.ansiGreen'?: string;
  'terminal.ansiYellow'?: string;
  'terminal.ansiBlue'?: string;
  'terminal.ansiMagenta'?: string;
  'terminal.ansiCyan'?: string;
  'terminal.ansiWhite'?: string;
  'terminal.ansiBrightBlack'?: string;
  'terminal.ansiBrightRed'?: string;
  'terminal.ansiBrightGreen'?: string;
  'terminal.ansiBrightYellow'?: string;
  'terminal.ansiBrightBlue'?: string;
  'terminal.ansiBrightMagenta'?: string;
  'terminal.ansiBrightCyan'?: string;
  'terminal.ansiBrightWhite'?: string;
}

/** Theme preset names */
export type ThemePreset = 'dark' | 'light' | 'high-contrast' | 'custom';

// ============================================================================
// Default Themes
// ============================================================================

/** Default dark theme (VS Code Dark+) */
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

/** Light theme (VS Code Light+) */
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
 * Convert VS Code terminal colors to xterm.js theme
 */
export function vsCodeColorsToXtermTheme(colors: VSCodeTerminalColors): ITheme {
  // Start with a copy of the dark theme, then override with provided colors
  const theme: ITheme = { ...DARK_THEME };

  if (colors['terminal.background']) theme.background = colors['terminal.background'];
  if (colors['terminal.foreground']) theme.foreground = colors['terminal.foreground'];
  if (colors['terminalCursor.foreground']) theme.cursor = colors['terminalCursor.foreground'];
  else if (colors['terminal.cursor']) theme.cursor = colors['terminal.cursor'];
  if (colors['terminalCursor.background']) theme.cursorAccent = colors['terminalCursor.background'];
  else if (colors['terminal.cursorAccent']) theme.cursorAccent = colors['terminal.cursorAccent'];
  if (colors['terminal.selectionBackground']) theme.selectionBackground = colors['terminal.selectionBackground'];
  if (colors['terminal.selectionForeground']) theme.selectionForeground = colors['terminal.selectionForeground'];
  if (colors['terminal.ansiBlack']) theme.black = colors['terminal.ansiBlack'];
  if (colors['terminal.ansiRed']) theme.red = colors['terminal.ansiRed'];
  if (colors['terminal.ansiGreen']) theme.green = colors['terminal.ansiGreen'];
  if (colors['terminal.ansiYellow']) theme.yellow = colors['terminal.ansiYellow'];
  if (colors['terminal.ansiBlue']) theme.blue = colors['terminal.ansiBlue'];
  if (colors['terminal.ansiMagenta']) theme.magenta = colors['terminal.ansiMagenta'];
  if (colors['terminal.ansiCyan']) theme.cyan = colors['terminal.ansiCyan'];
  if (colors['terminal.ansiWhite']) theme.white = colors['terminal.ansiWhite'];
  if (colors['terminal.ansiBrightBlack']) theme.brightBlack = colors['terminal.ansiBrightBlack'];
  if (colors['terminal.ansiBrightRed']) theme.brightRed = colors['terminal.ansiBrightRed'];
  if (colors['terminal.ansiBrightGreen']) theme.brightGreen = colors['terminal.ansiBrightGreen'];
  if (colors['terminal.ansiBrightYellow']) theme.brightYellow = colors['terminal.ansiBrightYellow'];
  if (colors['terminal.ansiBrightBlue']) theme.brightBlue = colors['terminal.ansiBrightBlue'];
  if (colors['terminal.ansiBrightMagenta']) theme.brightMagenta = colors['terminal.ansiBrightMagenta'];
  if (colors['terminal.ansiBrightCyan']) theme.brightCyan = colors['terminal.ansiBrightCyan'];
  if (colors['terminal.ansiBrightWhite']) theme.brightWhite = colors['terminal.ansiBrightWhite'];

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
 * This is useful when running in VS Code webview where CSS vars are set
 */
export function detectThemeFromCSSVars(): ITheme | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const root = document.documentElement;
  const style = getComputedStyle(root);

  // Check if we have VS Code CSS variables
  const bgColor = style.getPropertyValue('--vscode-terminal-background').trim();
  if (!bgColor) {
    return undefined;
  }

  const getCSSVar = (name: string): string | undefined => {
    const value = style.getPropertyValue(name).trim();
    return value || undefined;
  };

  // Start with a copy of the dark theme, then override with CSS vars
  const theme: ITheme = { ...DARK_THEME };

  const bg = getCSSVar('--vscode-terminal-background');
  if (bg) theme.background = bg;
  const fg = getCSSVar('--vscode-terminal-foreground');
  if (fg) theme.foreground = fg;
  const cursor = getCSSVar('--vscode-terminalCursor-foreground') ?? getCSSVar('--vscode-terminal-foreground');
  if (cursor) theme.cursor = cursor;
  const cursorAccent = getCSSVar('--vscode-terminalCursor-background');
  if (cursorAccent) theme.cursorAccent = cursorAccent;
  const selBg = getCSSVar('--vscode-terminal-selectionBackground');
  if (selBg) theme.selectionBackground = selBg;
  const selFg = getCSSVar('--vscode-terminal-selectionForeground');
  if (selFg) theme.selectionForeground = selFg;

  const black = getCSSVar('--vscode-terminal-ansiBlack');
  if (black) theme.black = black;
  const red = getCSSVar('--vscode-terminal-ansiRed');
  if (red) theme.red = red;
  const green = getCSSVar('--vscode-terminal-ansiGreen');
  if (green) theme.green = green;
  const yellow = getCSSVar('--vscode-terminal-ansiYellow');
  if (yellow) theme.yellow = yellow;
  const blue = getCSSVar('--vscode-terminal-ansiBlue');
  if (blue) theme.blue = blue;
  const magenta = getCSSVar('--vscode-terminal-ansiMagenta');
  if (magenta) theme.magenta = magenta;
  const cyan = getCSSVar('--vscode-terminal-ansiCyan');
  if (cyan) theme.cyan = cyan;
  const white = getCSSVar('--vscode-terminal-ansiWhite');
  if (white) theme.white = white;

  const brightBlack = getCSSVar('--vscode-terminal-ansiBrightBlack');
  if (brightBlack) theme.brightBlack = brightBlack;
  const brightRed = getCSSVar('--vscode-terminal-ansiBrightRed');
  if (brightRed) theme.brightRed = brightRed;
  const brightGreen = getCSSVar('--vscode-terminal-ansiBrightGreen');
  if (brightGreen) theme.brightGreen = brightGreen;
  const brightYellow = getCSSVar('--vscode-terminal-ansiBrightYellow');
  if (brightYellow) theme.brightYellow = brightYellow;
  const brightBlue = getCSSVar('--vscode-terminal-ansiBrightBlue');
  if (brightBlue) theme.brightBlue = brightBlue;
  const brightMagenta = getCSSVar('--vscode-terminal-ansiBrightMagenta');
  if (brightMagenta) theme.brightMagenta = brightMagenta;
  const brightCyan = getCSSVar('--vscode-terminal-ansiBrightCyan');
  if (brightCyan) theme.brightCyan = brightCyan;
  const brightWhite = getCSSVar('--vscode-terminal-ansiBrightWhite');
  if (brightWhite) theme.brightWhite = brightWhite;

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
