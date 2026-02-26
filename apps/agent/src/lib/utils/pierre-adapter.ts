/**
 * Pierre Diffs Adapter Layer
 *
 * Shared configuration for all Pierre diff rendering surfaces:
 *   - Custom Orbit themes (dark/light: sidebar-matched backgrounds)
 *   - Shared CSS variable overrides and options
 *   - editToolToPierreDiff — for Edit tool widget (oldString + newString)
 *
 * Theme registration happens at module-load time; Pierre lazy-loads
 * the actual theme on first render via the async loader.
 */
import { parseDiffFromFile, registerCustomTheme } from '@pierre/diffs';

import type { FileContents, FileDiffMetadata } from '@pierre/diffs/react';
import type { ThemeRegistration } from 'shiki';

// ---------------------------------------------------------------------------
// Custom Orbit Themes
// ---------------------------------------------------------------------------

// Sidebar-matched background colors (from globals.css gray scale)
const DARK_BG = '#232323'; // --gray-3 (dark sidebar)
const LIGHT_BG = '#e5e5e5'; // --gray-2 (light sidebar)
const DARK_SEPARATOR = '#313131'; // --gray-5 (two steps up from dark sidebar)
const LIGHT_SEPARATOR = '#d2d2d2'; // --gray-3 (one step up from light sidebar)

/** Custom dark theme: github-dark with sidebar-matched background */
registerCustomTheme('orbit-dark', async (): Promise<ThemeRegistration> => {
  const { default: githubDark } = (await import('shiki/themes/github-dark.mjs')) as {
    default: ThemeRegistration;
  };
  const theme = structuredClone(githubDark);
  theme.name = 'orbit-dark';
  theme.bg = DARK_BG;
  theme.colors = { ...theme.colors, 'editor.background': DARK_BG };
  return theme;
});

/** Custom light theme: github-light with sidebar-matched background */
registerCustomTheme('orbit-light', async (): Promise<ThemeRegistration> => {
  const { default: githubLight } = (await import('shiki/themes/github-light.mjs')) as {
    default: ThemeRegistration;
  };
  const theme = structuredClone(githubLight);
  theme.name = 'orbit-light';
  theme.bg = LIGHT_BG;
  theme.colors = { ...theme.colors, 'editor.background': LIGHT_BG };
  return theme;
});

/** Dual theme object — Pierre resolves both and uses `themeType` to pick one */
export const PIERRE_THEME = { dark: 'orbit-dark', light: 'orbit-light' } as const;

// ---------------------------------------------------------------------------
// Shared Config
// ---------------------------------------------------------------------------

/**
 * CSS variable overrides applied to all Pierre diff instances via `style` prop.
 * Consumers must cast with `as React.CSSProperties` for JSX compatibility.
 */
export const PIERRE_DIFF_STYLE = {
  '--diffs-gap-fallback': '0px',
  '--diffs-gap-block': '0px',
  '--diffs-gap-inline': '0px',
  '--diffs-font-family':
    "'Berkeley Mono', 'Geist Mono Variable', 'Geist Mono', ui-monospace, Menlo, monospace",
  '--diffs-font-size': '0.8125rem',
  '--diffs-line-height': '1.5',
  '--diffs-bg-separator-override': `light-dark(${LIGHT_SEPARATOR}, ${DARK_SEPARATOR})`,
} as const;

/** Shared unsafeCSS injected into Pierre's Shadow DOM */
export const PIERRE_DIFF_UNSAFE_CSS =
  'pre[data-diffs] { margin: 0; } [data-code] { padding: 0 !important; overflow-x: auto !important; } [data-code]::-webkit-scrollbar { height: 0 !important; }';

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

/**
 * Convert an Edit tool's old/new strings into Pierre's FileDiffMetadata.
 * Used by edit-tool-widget.tsx and file-diff-viewer.tsx.
 */
export function editToolToPierreDiff(
  filePath: string,
  oldString: string,
  newString: string
): FileDiffMetadata | null {
  try {
    const oldFile: FileContents = { name: filePath, contents: oldString };
    const newFile: FileContents = { name: filePath, contents: newString };
    return parseDiffFromFile(oldFile, newFile);
  } catch {
    return null;
  }
}
