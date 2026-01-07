import React from 'react';

import type { DiffLine as DiffLineType } from '@/stores/file/file-store';

export interface DiffLineProps {
  line: DiffLineType;
  className?: string;
}

export const DiffLine: React.FC<DiffLineProps> = ({ line, className = '' }) => {
  const getStyles = (): {
    bg: string;
    border: string;
    indicator: string;
    indicatorColor: string;
    textColor: string;
  } => {
    switch (line.type) {
      case 'add':
        return {
          bg: 'bg-success/10',
          border: 'bg-success',
          indicator: '+',
          indicatorColor: 'text-success/70',
          textColor: 'text-foreground',
        };
      case 'delete':
        return {
          bg: 'bg-destructive/10',
          border: 'bg-destructive',
          indicator: '-',
          indicatorColor: 'text-destructive/70',
          textColor: 'text-foreground/70',
        };
      case 'context':
        return {
          bg: 'bg-background',
          border: 'bg-transparent',
          indicator: ' ',
          indicatorColor: 'text-muted-foreground',
          textColor: 'text-foreground',
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={`flex font-mono text-xs leading-5 ${styles.bg} ${className}`}>
      {/* Colored border strip */}
      <div className={`w-1 ${styles.border} shrink-0`} />

      {/* Change indicator */}
      <div className={`w-6 px-1 text-center ${styles.indicatorColor} select-none shrink-0`}>
        {styles.indicator}
      </div>

      {/* Content */}
      <div className={`flex-1 px-3 ${styles.textColor} whitespace-pre overflow-x-auto`}>
        {line.content}
      </div>
    </div>
  );
};
