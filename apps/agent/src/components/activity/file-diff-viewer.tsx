import { DiffViewer } from './diff-viewer';

import type { ViewedFileDiff } from '@/stores/file-viewer-store';
import type { FC } from 'react';

export interface FileDiffViewerProps {
  readonly diffData: ViewedFileDiff;
  readonly className?: string;
}

/**
 * Renders diff data in the file viewer context.
 * Wraps the existing DiffViewer component with file viewer styling.
 */
export const FileDiffViewer: FC<FileDiffViewerProps> = ({ diffData, className = '' }) => {
  return (
    <div className={`h-full overflow-y-auto ${className}`}>
      <DiffViewer hunks={diffData.diff.hunks} />
    </div>
  );
};
