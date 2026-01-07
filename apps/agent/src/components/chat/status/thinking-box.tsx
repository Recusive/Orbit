import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';

interface ThinkingBoxProps {
  readonly thinking: string;
  readonly thinkingDurationMs?: number | undefined;
  readonly defaultExpanded?: boolean | undefined;
  /** When true, auto-expand; when transitions to false, auto-collapse */
  readonly isStreaming?: boolean | undefined;
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
  isStreaming = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const wasStreamingRef = useRef(false);

  // Auto-expand when streaming starts, auto-collapse when streaming ends
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      // Streaming just started - expand
      setIsExpanded(true);
    } else if (!isStreaming && wasStreamingRef.current) {
      // Streaming just ended - collapse
      setIsExpanded(false);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  const durationText = formatDuration(thinkingDurationMs);

  return (
    <div
      className={cn(
        'rounded-lg border border-border/40 overflow-hidden mb-3',
        'bg-gradient-to-b from-muted/20 to-muted/30',
        'shadow-sm transition-all duration-200'
      )}
    >
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm',
          'text-muted-foreground/70 hover:text-foreground',
          'hover:bg-muted/20 transition-all duration-150',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/30'
        )}
        aria-expanded={isExpanded}
        aria-label={`Thought for ${durationText}, ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        <span className="flex items-center gap-1.5">
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn(
              'text-violet-500/60 transition-colors duration-150',
              isStreaming && 'animate-pulse'
            )}
          >
            <path
              d="M7 21V16.267C7 15.9401 6.83705 15.6376 6.58354 15.4312C5.00702 14.1477 4 12.1914 4 10C4 6.13401 7.13401 3 11 3C14.7645 3 17.8349 5.97158 17.9936 9.69702C18.002 9.89426 18.0584 10.0877 18.1679 10.2519L19.7376 12.6064C19.8848 12.8272 19.8339 13.1246 19.6216 13.2838L18.4 14.2C18.1482 14.3889 18 14.6852 18 15V16C18 17.1046 17.1046 18 16 18H15C14.4477 18 14 18.4477 14 19V21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11.9059 7.94536L11.4756 6.82667C11.3999 6.62986 11.2109 6.5 11 6.5C10.7891 6.5 10.6001 6.62986 10.5244 6.82667L10.0941 7.94536C9.89094 8.47354 9.47355 8.89094 8.94536 9.09409L7.82667 9.52436C7.62986 9.60005 7.5 9.78914 7.5 10C7.5 10.2109 7.62986 10.3999 7.82667 10.4756L8.94536 10.9059C9.47354 11.1091 9.89094 11.5265 10.0941 12.0546L10.5244 13.1733C10.6001 13.3701 10.7891 13.5 11 13.5C11.2109 13.5 11.3999 13.3701 11.4756 13.1733L11.9059 12.0546C12.1091 11.5265 12.5265 11.1091 13.0546 10.9059L14.1733 10.4756C14.3701 10.3999 14.5 10.2109 14.5 10C14.5 9.78914 14.3701 9.60005 14.1733 9.52436L13.0546 9.09409C12.5265 8.89094 12.1091 8.47355 11.9059 7.94536Z"
              fill="currentColor"
            />
          </svg>
          <span className="text-[11px] font-medium text-muted-foreground/60">
            Thought for {durationText}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Collapsible Content */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          {/* Divider */}
          <div className="border-t border-border/30 mx-3.5" />

          {/* Content */}
          <div className="px-3.5 pb-3.5 pt-2.5 max-h-[500px] overflow-y-auto">
            <div className="text-[13px] text-muted-foreground/60 leading-[1.7] whitespace-pre-wrap font-mono tracking-[-0.01em]">
              {thinking}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
