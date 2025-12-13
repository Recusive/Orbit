import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface ThinkingBoxProps {
  readonly thinking: string;
  readonly thinkingDurationMs?: number | undefined;
  readonly defaultExpanded?: boolean | undefined;
}

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${String(seconds)} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${String(minutes)} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${String(minutes)}m ${String(remainingSeconds)}s`;
};

export const ThinkingBox: FC<ThinkingBoxProps> = ({
  thinking,
  thinkingDurationMs = 0,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
  const durationText = formatDuration(thinkingDurationMs);

  return (
    <div
      className={cn(
        'rounded-md border border-border/50 bg-muted/30 overflow-hidden mb-3',
        'transition-all duration-200'
      )}
    >
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm',
          'text-muted-foreground hover:text-foreground transition-colors',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
        )}
        aria-expanded={isExpanded}
        aria-label={`Thought for ${durationText}, ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        <ChevronIcon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium">
          Thought for {durationText}
        </span>
      </button>

      {/* Collapsible Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-out',
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-3 pb-3 pt-1">
          <div className="text-sm text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
            {thinking}
          </div>
        </div>
      </div>
    </div>
  );
};
