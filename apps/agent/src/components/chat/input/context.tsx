import { createContext, useContext, useState } from 'react';

import { ContextDetailDialog } from './context-detail-dialog';
import { formatTokens, getContextProgressStyle } from './context-utils';

import type { ContextTokenUsage } from './context-utils';
import type { FC, ReactNode } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';

interface ContextData {
  maxTokens: number;
  usedTokens: number;
  usage: ContextTokenUsage | undefined;
  percentage: number;
  setDetailOpen: (open: boolean) => void;
}

const ContextContext = createContext<ContextData | null>(null);

const useContextData = (): ContextData => {
  const context = useContext(ContextContext);
  if (!context) {
    throw new Error('Context components must be used within a Context provider');
  }
  return context;
};

// Filled pie chart SVG component
interface ProgressPieProps {
  readonly percentage: number;
  readonly size?: number;
}

const ProgressPie: FC<ProgressPieProps> = ({ percentage, size = 16 }) => {
  const center = size / 2;
  const radius = size / 2 - 1;

  // Calculate the end point of the arc
  // Start from top (12 o'clock position), go clockwise
  const angle = (percentage / 100) * 360;
  const angleRad = ((angle - 90) * Math.PI) / 180;
  const x = center + radius * Math.cos(angleRad);
  const y = center + radius * Math.sin(angleRad);

  // Large arc flag: 1 if angle > 180, else 0
  const largeArcFlag = angle > 180 ? 1 : 0;

  // Path for filled pie slice
  // M = move to center, L = line to top, A = arc, Z = close path
  const path =
    percentage >= 100
      ? `M ${String(center)} ${String(center)} m 0 -${String(radius)} a ${String(radius)} ${String(radius)} 0 1 1 0 ${String(radius * 2)} a ${String(radius)} ${String(radius)} 0 1 1 0 -${String(radius * 2)}`
      : `M ${String(center)} ${String(center)} L ${String(center)} ${String(center - radius)} A ${String(radius)} ${String(radius)} 0 ${String(largeArcFlag)} 1 ${String(x)} ${String(y)} Z`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${String(size)} ${String(size)}`}>
      {/* Background circle */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="opacity-30"
      />
      {/* Filled pie slice */}
      {percentage > 0 && (
        <path
          d={path}
          fill="currentColor"
          className={cn(
            percentage < 50 && 'text-foreground',
            percentage >= 50 && percentage < 80 && 'text-warning',
            percentage >= 80 && 'text-destructive'
          )}
        />
      )}
    </svg>
  );
};

// Root Context component
interface ContextProps {
  readonly maxTokens: number;
  readonly usedTokens: number;
  readonly usage?: ContextTokenUsage;
  readonly children: ReactNode;
}

export const Context: FC<ContextProps> = ({ maxTokens, usedTokens, usage, children }) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const percentage = maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : 0;

  return (
    <ContextContext.Provider value={{ maxTokens, usedTokens, usage, percentage, setDetailOpen }}>
      <HoverCard openDelay={200} closeDelay={100}>
        {children}
      </HoverCard>
      {detailOpen ? (
        <ContextDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          maxTokens={maxTokens}
          usedTokens={usedTokens}
          percentage={percentage}
          usage={usage}
        />
      ) : null}
    </ContextContext.Provider>
  );
};

// Trigger component
interface ContextTriggerProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export const ContextTrigger: FC<ContextTriggerProps> = ({ children, className }) => {
  const { percentage } = useContextData();

  if (children !== undefined) {
    return <HoverCardTrigger asChild>{children}</HoverCardTrigger>;
  }

  return (
    <HoverCardTrigger asChild>
      <button
        className={cn(
          'h-7 flex items-center px-1.5 rounded-[9px] hover:bg-lg-control-hover transition-colors',
          className
        )}
        title="Context usage"
      >
        <ProgressPie percentage={percentage} />
      </button>
    </HoverCardTrigger>
  );
};

// Content component
interface ContextContentProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export const ContextContent: FC<ContextContentProps> = ({ children, className }) => {
  return (
    <HoverCardContent side="top" align="end" className={cn('w-56 p-0 rounded-[12px]', className)}>
      {children}
    </HoverCardContent>
  );
};

// Content Header
interface ContextContentHeaderProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export const ContextContentHeader: FC<ContextContentHeaderProps> = ({ children, className }) => {
  const { percentage, usedTokens, maxTokens } = useContextData();

  if (children !== undefined) {
    return <div className={cn('p-3 border-b border-lg-separator', className)}>{children}</div>;
  }

  return (
    <div className={cn('p-3 border-b border-lg-separator', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium tracking-tighter">Context Window</span>
        <span className="text-sm font-medium text-muted-foreground/70 tabular-nums">
          {Math.round(percentage)}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground/60 tabular-nums">
        <span>{formatTokens(usedTokens)}</span>
        <span className="opacity-50">/</span>
        <span>{formatTokens(maxTokens)} tokens</span>
      </div>
      {/* Progress bar — uses scaleX instead of width to stay on GPU (no layout reflow) */}
      <div className="mt-2.5 h-2 bg-lg-control rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full w-full origin-left rounded-full transition-transform duration-300 ease-out"
          style={{
            transform: `scaleX(${String(percentage / 100)})`,
            ...getContextProgressStyle(percentage),
          }}
        />
      </div>
    </div>
  );
};

// Content Body
interface ContextContentBodyProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export const ContextContentBody: FC<ContextContentBodyProps> = ({ children, className }) => {
  return <div className={cn('p-3 space-y-2.5', className)}>{children}</div>;
};

// Content Footer
interface ContextContentFooterProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export const ContextContentFooter: FC<ContextContentFooterProps> = ({ children, className }) => {
  return (
    <div
      className={cn(
        'px-3 py-2 bg-lg-control border-t border-border text-xs text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
  );
};

export const ContextMoreButton: FC<{ readonly className?: string }> = ({ className }) => {
  const { setDetailOpen } = useContextData();

  return (
    <button
      type="button"
      onClick={() => {
        setDetailOpen(true);
      }}
      className={cn(
        'flex w-full items-center justify-center rounded-[9px] border border-border/70 bg-background/60 px-3 py-2 text-sm font-medium text-foreground/85 transition-colors duration-150 hover:bg-lg-control-hover',
        className
      )}
    >
      More details
    </button>
  );
};

// Usage line component
interface UsageLineProps {
  readonly label: string;
  readonly tokens: number;
  readonly className?: string | undefined;
}

const UsageLine: FC<UsageLineProps> = ({ label, tokens, className }) => {
  return (
    <div className={cn('flex items-center justify-between text-sm', className)}>
      <span className="text-muted-foreground/60">{label}</span>
      <span className="font-medium tabular-nums text-foreground/90">{formatTokens(tokens)}</span>
    </div>
  );
};

// Input usage
export const ContextInputUsage: FC<{ readonly className?: string }> = ({ className }) => {
  const { usage } = useContextData();
  const tokens = usage?.promptTokens ?? 0;
  return <UsageLine label="Input" tokens={tokens} className={className} />;
};

// Cache usage
export const ContextCacheUsage: FC<{ readonly className?: string }> = ({ className }) => {
  const { usage } = useContextData();
  const tokens = (usage?.cacheReadTokens ?? 0) + (usage?.cacheCreationTokens ?? 0);
  return <UsageLine label="Cache" tokens={tokens} className={className} />;
};

// Output usage
export const ContextOutputUsage: FC<{ readonly className?: string }> = ({ className }) => {
  const { usage } = useContextData();
  const tokens = usage?.completionTokens ?? 0;
  return <UsageLine label="Output" tokens={tokens} className={className} />;
};
