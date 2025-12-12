import React from 'react';

import type { DiffLine as DiffLineType } from '../../stores/file-store';

export interface DiffLineProps {
  line: DiffLineType;
  className?: string;
}

export const DiffLine: React.FC<DiffLineProps> = ({ line, className = '' }) => {
  const getBackgroundColor = (): string => {
    switch (line.type) {
      case 'add':
        return 'bg-diff-added border-l-2 border-diff-added-border';
      case 'delete':
        return 'bg-diff-removed border-l-2 border-diff-removed-border';
      case 'context':
        return 'bg-background';
    }
  };

  const getLineIndicator = (): string => {
    switch (line.type) {
      case 'add':
        return '+';
      case 'delete':
        return '-';
      case 'context':
        return ' ';
    }
  };

  const getTextColor = (): string => {
    switch (line.type) {
      case 'add':
        return 'text-diff-added-text';
      case 'delete':
        return 'text-diff-removed-text';
      case 'context':
        return 'text-foreground';
    }
  };

  return (
    <div
      className={`
        flex items-start
        ${getBackgroundColor()}
        ${className}
      `}
    >
      {/* Line Numbers */}
      <div className="flex gap-2 px-3 py-1 select-none">
        <span className="w-10 text-right text-muted-foreground tabular-nums">
          {line.oldLineNumber ?? ''}
        </span>
        <span className="w-10 text-right text-muted-foreground tabular-nums">
          {line.newLineNumber ?? ''}
        </span>
      </div>

      {/* Change Indicator */}
      <div className="px-2 py-1 select-none">
        <span className={getTextColor()}>{getLineIndicator()}</span>
      </div>

      {/* Content */}
      <div className={`flex-1 py-1 pr-3 ${getTextColor()}`}>
        <pre className="whitespace-pre-wrap break-all">{line.content}</pre>
      </div>
    </div>
  );
};
