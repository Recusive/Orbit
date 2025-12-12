import React from 'react';

import { DiffLine } from './diff-line';

import type { DiffHunk } from '../../stores/file-store';

export interface DiffViewerProps {
  hunks: DiffHunk[];
  className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  hunks,
  className = '',
}) => {
  if (hunks.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No changes to display
      </div>
    );
  }

  return (
    <div className={`font-mono text-xs ${className}`}>
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          {/* Hunk header */}
          <div className="bg-diff-hunk border-l-2 border-diff-hunk-border px-3 py-1 text-diff-hunk-text">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </div>
          {/* Hunk lines */}
          {hunk.lines.map((line, lineIndex) => (
            <DiffLine key={lineIndex} line={line} />
          ))}
        </div>
      ))}
    </div>
  );
};
