import React from 'react';

import { DiffLine } from './diff-line';

import type { DiffHunk, DiffLine as DiffLineType } from '../../stores/file-store';

export interface DiffViewerProps {
  hunks: DiffHunk[];
  className?: string;
  showHunkHeaders?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  hunks,
  className = '',
  showHunkHeaders = false,
}) => {
  if (hunks.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No changes to display
      </div>
    );
  }

  // Render lines with separator between delete and add sections
  const renderLinesWithSeparator = (lines: DiffLineType[]): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let prevType: DiffLineType['type'] | null = null;

    lines.forEach((line, index) => {
      // Add separator when transitioning from delete to add
      if (prevType === 'delete' && line.type === 'add') {
        result.push(<div key={`sep-${String(index)}`} className="h-px bg-border" />);
      }
      result.push(<DiffLine key={String(index)} line={line} />);
      prevType = line.type;
    });

    return result;
  };

  return (
    <div className={className}>
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          {/* Hunk header - optional */}
          {showHunkHeaders ? (
            <div className="bg-muted/50 px-3 py-1 text-xs text-muted-foreground font-mono">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </div>
          ) : null}
          {/* Hunk lines with separator */}
          {renderLinesWithSeparator(hunk.lines)}
        </div>
      ))}
    </div>
  );
};
