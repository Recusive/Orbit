/**
 * Pierre Diffs Adapter Layer
 *
 * Shared configuration for all Pierre diff rendering surfaces:
 *   - Shared Pierre themes (dark/light)
 *   - Shared CSS variable overrides and options
 *   - editToolToPierreDiff — for Edit tool widget (oldString + newString)
 */
import { parseDiffFromFile } from '@pierre/diffs';

import type { FileContents, FileDiffMetadata } from '@pierre/diffs/react';
const DARK_SEPARATOR = '#313131'; // --gray-5 (two steps up from dark sidebar)
const LIGHT_SEPARATOR = '#e2e2e2'; // proportional separator for lighter bg

/** Dual theme object — Pierre resolves both and uses `themeType` to pick one */
export const PIERRE_THEME = { dark: 'pierre-dark', light: 'pierre-light' } as const;

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
