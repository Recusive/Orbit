import { ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { useState } from 'react';

import type { OcToolPart } from '@/types/opencode';
import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface OcToolWidgetProps {
  readonly part: OcToolPart;
}

export const OcToolWidget: FC<OcToolWidgetProps> = ({ part }) => {
  const [expanded, setExpanded] = useState(false);
  const title =
    part.state.status === 'completed' || part.state.status === 'running'
      ? (part.state.title ?? part.tool)
      : part.tool;

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => {
          setExpanded((value) => !value);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {part.state.status === 'pending' || part.state.status === 'running' ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">{part.state.status}</div>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <pre className="overflow-x-auto rounded-lg bg-control-fill px-3 py-2 text-xs text-foreground">
            {JSON.stringify(part.state.input, null, 2)}
          </pre>
          {part.state.status === 'completed' ? (
            <div className="rounded-lg bg-control-fill px-3 py-2 whitespace-pre-wrap text-foreground">
              {part.state.output}
            </div>
          ) : null}
          {part.state.status === 'error' ? (
            <div
              className={cn(
                'rounded-lg bg-destructive/10 px-3 py-2 whitespace-pre-wrap',
                'text-destructive'
              )}
            >
              {part.state.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
