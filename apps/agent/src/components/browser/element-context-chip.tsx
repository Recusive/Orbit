import { Code2, FileCode, X } from 'lucide-react';
import { useState } from 'react';

import type { ReactElementContext } from '@/types/protocol';
import type { FC } from 'react';

import { cn } from '@/lib/utils';

export interface ElementContextChipProps {
  readonly element: ReactElementContext;
  readonly onRemove: () => void;
  readonly compact?: boolean;
}

export const ElementContextChip: FC<ElementContextChipProps> = ({
  element,
  onRemove,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Format props for display (truncate long values)
  const formatProps = (props: Record<string, unknown>): string => {
    const entries = Object.entries(props)
      .filter(([, value]) => value !== undefined && typeof value !== 'function')
      .slice(0, 3) // Show max 3 props
      .map(([key, value]) => {
        let valueStr: string;
        if (typeof value === 'string') {
          valueStr = `"${value.length > 20 ? value.slice(0, 20) + '...' : value}"`;
        } else if (typeof value === 'object' && value !== null) {
          valueStr = '{...}';
        } else if (typeof value === 'boolean' || typeof value === 'number') {
          valueStr = String(value);
        } else {
          valueStr = 'undefined';
        }
        return `${key}: ${valueStr}`;
      });

    return entries.join(', ');
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent text-xs">
        <Code2 className="h-3 w-3 text-primary" />
        <span className="font-medium">{element.componentName}</span>
        <button onClick={onRemove} className="ml-0.5 hover:text-destructive transition-colors">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={(): void => {
          setIsExpanded(!isExpanded);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
      >
        <Code2 className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{element.componentName}</span>
            <span className="text-xs text-muted-foreground truncate">{element.tagName}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileCode className="h-3 w-3" />
            <span className="truncate">{element.displayName}</span>
          </div>
        </div>
        <button
          onClick={(e): void => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </button>

      {/* Expanded content */}
      {isExpanded ? (
        <div className="px-3 pb-3 space-y-2 border-t border-border">
          {/* File path */}
          <div className="pt-2">
            <span className="text-xs text-muted-foreground">File:</span>
            <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 truncate">
              {element.filePath}:{element.lineNumber}
            </div>
          </div>

          {/* Props */}
          {Object.keys(element.props).length > 0 ? (
            <div>
              <span className="text-xs text-muted-foreground">Props:</span>
              <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1">
                {formatProps(element.props)}
              </div>
            </div>
          ) : null}

          {/* Component stack */}
          {element.componentStack.length > 0 ? (
            <div>
              <span className="text-xs text-muted-foreground">Component Stack:</span>
              <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 max-h-20 overflow-y-auto">
                {element.componentStack.map((name, i) => (
                  <div key={i} className={cn(i > 0 && 'text-muted-foreground')}>
                    {i > 0 ? '└ ' : ''}
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Selector */}
          <div>
            <span className="text-xs text-muted-foreground">Selector:</span>
            <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 truncate">
              {element.selector}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// Compact list of element chips for chat input
export interface ElementContextListProps {
  readonly elements: ReactElementContext[];
  readonly onRemove: (index: number) => void;
}

export const ElementContextList: FC<ElementContextListProps> = ({ elements, onRemove }) => {
  if (elements.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border bg-muted/30">
      {elements.map((element, index) => (
        <ElementContextChip
          key={`${element.displayName}-${String(index)}`}
          element={element}
          onRemove={(): void => {
            onRemove(index);
          }}
          compact
        />
      ))}
    </div>
  );
};
