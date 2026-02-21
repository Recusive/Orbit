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
 * Module-level cache: avoids re-invoking Tauri for the same symbol.
 * Keyed by "name-size-weight", value is the symbol result (or null on failure).
 */
const symbolCache = new Map<string, Promise<SFSymbolResult | null>>();

function fetchSymbol(
  name: string,
  size: number,
  weight: SFSymbolWeight
): Promise<SFSymbolResult | null> {
  const key = `${name}-${String(size)}-${weight}`;
  const cached = symbolCache.get(key);
  if (cached) return cached;

  const promise = invoke<SFSymbolResult>('get_sf_symbol', {
    name,
    pointSize: size,
    weight,
  }).catch(() => null);

  symbolCache.set(key, promise);
  return promise;
}

export const SFSymbol: FC<SFSymbolProps> = ({
  name,
  size = 16,
  weight = 'regular',
  fallback,
  className,
  style,
  'aria-label': ariaLabel,
}) => {
  const [state, setState] = useState<SymbolState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void fetchSymbol(name, size, weight).then((data) => {
      if (cancelled) return;
      setState(data ? { status: 'loaded', data } : { status: 'failed' });
    });

    return (): void => {
      cancelled = true;
    };
  }, [name, size, weight]);

  // Loading or failed — show fallback if provided, otherwise nothing
  if (state.status !== 'loaded') {
    return fallback !== undefined ? <>{fallback}</> : null;
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
