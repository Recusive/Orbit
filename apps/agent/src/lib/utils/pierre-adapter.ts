/**
 * Pierre Diffs Adapter Layer
 *
 * Shared configuration for all Pierre diff rendering surfaces:
 *   - Shared Pierre themes (dark/light)
 *   - Shared CSS variable overrides and options
 *   - Shared virtualization metrics and thresholds
 *   - Stable cache keys for worker-backed rendering
 *   - editToolToPierreDiff — for Edit tool widget (oldString + newString)
 */
import { DEFAULT_VIRTUAL_FILE_METRICS, parseDiffFromFile } from '@pierre/diffs';

import type { DiffScope } from '@/lib/api';
import type { FileContents, FileDiffMetadata, VirtualFileMetrics } from '@pierre/diffs/react';
const DARK_SEPARATOR = '#313131'; // --gray-5 (two steps up from dark sidebar)
const LIGHT_SEPARATOR = '#e2e2e2'; // proportional separator for lighter bg

/** Dual theme object — Orbit-customized Pierre themes with chat-area-matching backgrounds.
 * Registered in PierreProvider via registerCustomTheme('orbit-dark'/'orbit-light'). */
export const PIERRE_THEME = { dark: 'orbit-dark', light: 'orbit-light' } as const;

export const PIERRE_VIRTUAL_FILE_METRICS: VirtualFileMetrics = {
  ...DEFAULT_VIRTUAL_FILE_METRICS,
  lineHeight: 20,
  diffHeaderHeight: 44,
  hunkSeparatorHeight: 32,
  fileGap: 8,
};

export const PIERRE_VIRTUALIZER_OVERSCROLL_SIZE = 600;

export const LARGE_DIFF_INLINE_THRESHOLD = 400;
export const PATHOLOGICAL_DIFF_THRESHOLD = 10_000;

export type PierreDiffRenderTier = 'small' | 'large' | 'pathological';

// ---------------------------------------------------------------------------
// Shared Config
// ---------------------------------------------------------------------------

/**
 * CSS variable overrides applied to all Pierre diff instances via `style` prop.
 * Consumers must cast with `as React.CSSProperties` for JSX compatibility.
 */
/** CSS variable overrides applied to all Pierre diff instances via `style` prop.
 * Background comes from the orbit-dark/orbit-light theme (editor.background).
 * Consumers must cast with `as React.CSSProperties` for JSX compatibility. */
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

/** Shared unsafeCSS injected into Pierre's Shadow DOM.
 * Force background-color directly — bypasses Pierre's CSS variable chain
 * (getHighlighterThemeStyles sets inline --diffs-dark-bg on <pre>, which
 * beats inherited custom properties. Direct background-color !important wins). */
export const PIERRE_DIFF_UNSAFE_CSS =
  'pre[data-diffs] { margin: 0; } [data-code] { padding: 0 !important; overflow-x: auto !important; } [data-code]::-webkit-scrollbar { height: 0 !important; }';

// ---------------------------------------------------------------------------
// Cache Keys
// ---------------------------------------------------------------------------

function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getPierreContentCacheKey(params: {
  namespace: string;
  path: string;
  oldPath: string | null | undefined;
  side: 'old' | 'new';
  contents: string;
}): string {
  const identityPath = params.side === 'old' ? (params.oldPath ?? params.path) : params.path;
  return [params.namespace, params.side, identityPath, hashString(params.contents)].join('::');
}

export function getGitFileContentsCacheKey(params: {
  repoPath: string;
  scope: DiffScope;
  path: string;
  oldPath: string | null | undefined;
  side: 'old' | 'new';
  contents: string;
}): string {
  return getPierreContentCacheKey({
    namespace: `${params.repoPath}::${params.scope}`,
    path: params.path,
    oldPath: params.oldPath,
    side: params.side,
    contents: params.contents,
  });
}

export function buildGitFileContents(params: {
  repoPath: string;
  scope: DiffScope;
  path: string;
  oldPath: string | null | undefined;
  side: 'old' | 'new';
  contents: string;
}): FileContents {
  const name = params.side === 'old' ? (params.oldPath ?? params.path) : params.path;

  return {
    name,
    contents: params.contents,
    cacheKey: getGitFileContentsCacheKey(params),
  };
}

function buildInlineFileContents(params: {
  namespace: string;
  path: string;
  oldPath: string | null | undefined;
  side: 'old' | 'new';
  contents: string;
}): FileContents {
  const name = params.side === 'old' ? (params.oldPath ?? params.path) : params.path;

  return {
    name,
    contents: params.contents,
    cacheKey: getPierreContentCacheKey(params),
  };
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export function getPierreChangedLineCount(additions: number, deletions: number): number {
  return additions + deletions;
}

export function getPierreDiffRenderTier(totalChangedLines: number): PierreDiffRenderTier {
  if (totalChangedLines >= PATHOLOGICAL_DIFF_THRESHOLD) {
    return 'pathological';
  }

  if (totalChangedLines >= LARGE_DIFF_INLINE_THRESHOLD) {
    return 'large';
  }

  return 'small';
}

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
    const oldFile = buildInlineFileContents({
      namespace: 'edit-tool',
      path: filePath,
      oldPath: null,
      side: 'old',
      contents: oldString,
    });
    const newFile = buildInlineFileContents({
      namespace: 'edit-tool',
      path: filePath,
      oldPath: null,
      side: 'new',
      contents: newString,
    });
    return parseDiffFromFile(oldFile, newFile);
  } catch {
    return null;
  }
}

export function gitFileToPierreDiff(params: {
  repoPath: string;
  scope: DiffScope;
  path: string;
  oldPath: string | null | undefined;
  oldContent: string;
  newContent: string;
}): FileDiffMetadata | null {
  try {
    const oldFile = buildGitFileContents({
      repoPath: params.repoPath,
      scope: params.scope,
      path: params.path,
      oldPath: params.oldPath,
      side: 'old',
      contents: params.oldContent,
    });
    const newFile = buildGitFileContents({
      repoPath: params.repoPath,
      scope: params.scope,
      path: params.path,
      oldPath: params.oldPath,
      side: 'new',
      contents: params.newContent,
    });
    return parseDiffFromFile(oldFile, newFile);
  } catch {
    return null;
  }
}
