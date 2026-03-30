/**
 * SFSymbol - Renders a native macOS SF Symbol as a themed icon.
 *
 * Uses Tauri invoke to render the symbol server-side via `AppKit`, then
 * displays it with CSS `mask-image` so the icon inherits `currentColor`
 * and automatically matches the current theme (light/dark, hover, disabled).
 *
 * The symbol's natural aspect ratio is preserved — SF Symbols are not
 * square, so the component sizes itself based on the height matching the
 * requested `size` prop, with width scaling proportionally.
 *
 * When SF Symbols are unavailable (web demo, Windows, Linux), renders the
 * `fallback` prop instead. This ensures cross-platform and web compatibility.
 *
 * @example
 * <SFSymbol name="sidebar.left" size={16} weight="medium" />
 * <SFSymbol
 *   name="gear"
 *   size={18}
 *   fallback={<Settings2 className="h-4 w-4" />}
 * />
 */
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import type { CSSProperties, FC, ReactNode } from 'react';

export type SFSymbolWeight =
  | 'ultralight'
  | 'thin'
  | 'light'
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'heavy'
  | 'black';

interface SFSymbolResult {
  base64: string;
  width: number;
  height: number;
}

type SymbolState =
  | { status: 'loading' }
  | { status: 'loaded'; data: SFSymbolResult }
  | { status: 'failed' };

interface SFSymbolProps {
  /** SF Symbol name (e.g. "sidebar.left", "chevron.right") */
  readonly name: string;
  /** Desired height in pixels — width scales proportionally (default: 16) */
  readonly size?: number;
  /** Symbol weight (default: "regular") */
  readonly weight?: SFSymbolWeight;
  /** Fallback icon for non-macOS / web demo (e.g. a lucide icon) */
  readonly fallback?: ReactNode;
  /** Additional CSS classes */
  readonly className?: string;
  /** Inline styles (merged with mask-image styles) */
  readonly style?: CSSProperties;
  /** Accessibility label — when provided, removes aria-hidden */
  readonly 'aria-label'?: string;
}

/**
 * Two-tier cache for SF Symbols:
 *
 * 1. `promiseCache` — stores in-flight Promises for dedup (two components
 *    mounting the same icon share one IPC call). Evicts on failure.
 *
 * 2. `resolvedCache` — stores resolved SFSymbolResult values for synchronous
 *    reads. useState initializers read this to skip the loading state entirely
 *    when the symbol was pre-warmed before the component mounted.
 */
const promiseCache = new Map<string, Promise<SFSymbolResult | null>>();
const resolvedCache = new Map<string, SFSymbolResult>();

function symbolCacheKey(name: string, size: number, weight: SFSymbolWeight): string {
  return `${name}-${String(size)}-${weight}`;
}

function fetchSymbol(
  name: string,
  size: number,
  weight: SFSymbolWeight
): Promise<SFSymbolResult | null> {
  const key = symbolCacheKey(name, size, weight);
  const cached = promiseCache.get(key);
  if (cached) return cached;

  const promise = invoke<SFSymbolResult>('get_sf_symbol', {
    name,
    pointSize: size,
    weight,
  })
    .then((result) => {
      // Store resolved value for synchronous reads by useState initializers
      resolvedCache.set(key, result);
      return result;
    })
    .catch(() => {
      // Evict failed entries so subsequent renders retry instead of
      // serving a permanently-cached null (e.g. if Tauri backend
      // wasn't ready during early preload).
      promiseCache.delete(key);
      return null;
    });

  promiseCache.set(key, promise);
  return promise;
}

/**
 * All SF Symbols used in the workspace UI. Add new entries here when
 * introducing `<SFSymbol>` in any workspace component.
 *
 * Enforced by: __tests__/integration/sf-symbol-preload.test.ts
 */
export const WORKSPACE_SF_SYMBOLS = [
  // ContentTopBar + HeaderBar
  { name: 'sidebar.squares.right', size: 18, weight: 'medium' },
  { name: 'apple.terminal', size: 18, weight: 'medium' },
  { name: 'switch.2', size: 18, weight: 'medium' },
  // ActionsBar mode buttons
  { name: 'paintpalette', size: 18, weight: 'medium' },
  { name: 'chevron.left.forwardslash.chevron.right', size: 18, weight: 'medium' },
  { name: 'command', size: 18, weight: 'medium' },
  // ContentTopBar + PrimarySidebar navigation
  { name: 'sidebar.left', size: 18, weight: 'medium' },
  { name: 'arrow.left', size: 13, weight: 'semibold' },
  { name: 'arrow.right', size: 13, weight: 'semibold' },
  // PrimarySidebar actions
  { name: 'square.and.pencil', size: 18, weight: 'medium' },
  { name: 'exclamationmark.bubble', size: 18, weight: 'medium' },
  { name: 'gear', size: 18, weight: 'medium' },
  // SettingsSidebar
  { name: 'rectangle.connected.to.line.below', size: 18, weight: 'medium' },
] as const satisfies readonly { name: string; size?: number; weight?: SFSymbolWeight }[];

/**
 * Pre-warm the SF Symbol cache by firing Tauri IPC calls early.
 * Safe on non-macOS — invoke fails, evicts from cache, fallback renders.
 */
export function preloadSFSymbols(
  symbols: readonly { name: string; size?: number; weight?: SFSymbolWeight }[]
): void {
  for (const { name, size = 16, weight = 'regular' } of symbols) {
    void fetchSymbol(name, size, weight);
  }
}

// ── Eager preload ──────────────────────────────────────────────────────
// Fires on module import (before any React render cycle begins).
// useEffect-based preload is too late — React effects fire child→parent,
// so SFSymbol component effects would run before the parent's preload.
preloadSFSymbols(WORKSPACE_SF_SYMBOLS);

export const SFSymbol: FC<SFSymbolProps> = ({
  name,
  size = 16,
  weight = 'regular',
  fallback,
  className,
  style,
  'aria-label': ariaLabel,
}) => {
  // Check resolved cache synchronously — if preload already completed,
  // start in 'loaded' state on the very first render (no fallback frame).
  const [state, setState] = useState<SymbolState>(() => {
    const key = symbolCacheKey(name, size, weight);
    const resolved = resolvedCache.get(key);
    if (resolved) return { status: 'loaded', data: resolved };
    return { status: 'loading' };
  });

  useEffect(() => {
    // Already loaded from sync cache — skip the async path
    if (state.status === 'loaded') return;

    let cancelled = false;

    void fetchSymbol(name, size, weight).then((data) => {
      if (cancelled) return;
      setState(data ? { status: 'loaded', data } : { status: 'failed' });
    });

    return (): void => {
      cancelled = true;
    };
  }, [name, size, weight, state.status]);

  // Loading or failed — show fallback in a stable-dimension wrapper.
  // Reserves size × size so the layout doesn't shift when the real icon
  // arrives (loaded width is proportional to the SF Symbol's natural aspect
  // ratio — typically close to square but not exact. The ~1-3px horizontal
  // delta is imperceptible, especially with pre-warming).
  if (state.status !== 'loaded') {
    if (fallback === undefined) return null;
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          flexShrink: 0,
          ...style,
        }}
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : undefined}
      >
        {fallback}
      </div>
    );
  }

  // Scale to fit the requested height, preserving natural aspect ratio
  const { data } = state;
  const scale = size / data.height;
  const displayWidth = data.width * scale;
  const displayHeight = size;

  const maskStyle: CSSProperties = {
    width: displayWidth,
    height: displayHeight,
    backgroundColor: 'currentColor',
    maskImage: `url(data:image/png;base64,${data.base64})`,
    WebkitMaskImage: `url(data:image/png;base64,${data.base64})`,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    flexShrink: 0,
    ...style,
  };

  return (
    <div
      className={className}
      style={maskStyle}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    />
  );
};
