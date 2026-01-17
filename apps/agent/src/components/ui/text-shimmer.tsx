import { useMemo } from 'react';

import type { CSSProperties, JSX } from 'react';

import { cn } from '@/lib/utils';

// Extend CSSProperties to include CSS custom properties
interface ShimmerStyle extends CSSProperties {
  '--spread': string;
  '--duration': string;
}

interface TextShimmerProps {
  children: string;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  duration?: number;
  spread?: number;
}

export function TextShimmer({
  children,
  as: Component = 'span',
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps): JSX.Element {
  const dynamicSpread = useMemo(() => {
    return children.length * spread;
  }, [children, spread]);

  const shimmerStyle: ShimmerStyle = {
    '--spread': `${String(dynamicSpread)}px`,
    '--duration': `${String(duration)}s`,
    backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
  };

  return (
    <Component
      className={cn(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text',
        // Use theme colors: muted-foreground as base, foreground as highlight
        'text-transparent [--base-color:var(--muted-foreground)] [--base-gradient-color:var(--foreground)]',
        '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]',
        'animate-shimmer',
        className
      )}
      style={shimmerStyle}
    >
      {children}
    </Component>
  );
}
