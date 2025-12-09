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
        return 'bg-green-50 border-l-2 border-green-500';
      case 'delete':
        return 'bg-red-50 border-l-2 border-red-500';
      case 'context':
        return 'bg-white';
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
        return 'text-green-800';
      case 'delete':
        return 'text-red-800';
      case 'context':
        return 'text-gray-700';
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
        <span className="w-10 text-right text-gray-400 tabular-nums">
          {line.oldLineNumber ?? ''}
        </span>
        <span className="w-10 text-right text-gray-400 tabular-nums">
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
