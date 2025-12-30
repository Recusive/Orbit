import { createContext, useContext } from 'react';

import type { FC, ReactNode } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';

// Token usage from AI SDK
interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

interface ContextData {
  maxTokens: number;
  usedTokens: number;
  usage: TokenUsage | undefined;
  percentage: number;
}

const ContextContext = createContext<ContextData | null>(null);

const useContextData = (): ContextData => {
  const context = useContext(ContextContext);
  if (!context) {
    throw new Error('Context components must be used within a Context provider');
  }
  return context;
};

// Format token count with K, M, B suffixes
const formatTokens = (count: number): string => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
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
  readonly usage?: TokenUsage;
  readonly children: ReactNode;
}

export const Context: FC<ContextProps> = ({ maxTokens, usedTokens, usage, children }) => {
  const percentage = Math.min(100, Math.round((usedTokens / maxTokens) * 100));

  return (
    <ContextContext.Provider value={{ maxTokens, usedTokens, usage, percentage }}>
      <HoverCard openDelay={200} closeDelay={100}>
        {children}
      </HoverCard>
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
          'h-7 flex items-center gap-1.5 px-2 rounded hover:bg-accent transition-colors text-xs',
          className
        )}
        title="Context usage"
      >
        <ProgressPie percentage={percentage} />
        <span className="text-muted-foreground">{percentage}%</span>
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
    <HoverCardContent side="top" align="end" className={cn('w-56 p-0', className)}>
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
    return <div className={cn('p-3 border-b border-border', className)}>{children}</div>;
  }

  return (
    <div className={cn('p-3 border-b border-border', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">Context Window</span>
        <span className="text-xs text-muted-foreground">{percentage}%</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatTokens(usedTokens)}</span>
        <span>/</span>
        <span>{formatTokens(maxTokens)} tokens</span>
      </div>
      {/* Progress bar */}
      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percentage < 50 && 'bg-success',
            percentage >= 50 && percentage < 80 && 'bg-warning',
            percentage >= 80 && 'bg-destructive'
          )}
          style={{ width: `${String(percentage)}%` }}
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
  return <div className={cn('p-3 space-y-2', className)}>{children}</div>;
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
        'px-3 py-2 bg-muted/50 border-t border-border text-xs text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
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
    <div className={cn('flex items-center justify-between text-xs', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span>{formatTokens(tokens)}</span>
    </div>
  );
};

// Input usage
export const ContextInputUsage: FC<{ readonly className?: string }> = ({ className }) => {
  const { usage } = useContextData();
  const tokens = usage?.promptTokens ?? 0;
  return <UsageLine label="Input" tokens={tokens} className={className} />;
};

// Output usage
export const ContextOutputUsage: FC<{ readonly className?: string }> = ({ className }) => {
  const { usage } = useContextData();
  const tokens = usage?.completionTokens ?? 0;
  return <UsageLine label="Output" tokens={tokens} className={className} />;
};

// Total usage
export const ContextTotalUsage: FC<{ readonly className?: string }> = ({ className }) => {
  const { usage } = useContextData();
  const tokens = usage?.totalTokens ?? 0;
  return <UsageLine label="Total" tokens={tokens} className={className} />;
};
