/**
 * FileChangeItem - Expandable diff view for a changed file
 *
 * NOTE: Header height comes from @/lib/utils/constants.
 * To change file change header dimensions, update HEIGHTS in constants.ts.
 */
import { ChevronRight, ChevronDown } from 'lucide-react';
import React, { useState } from 'react';

import { DiffStats } from './diff-stats';
import { DiffViewer } from './diff-viewer';

import type { FileChange } from '@/stores/file/file-store';

import { FileIcon } from '@/components/files/file-icon';
import { HEIGHTS } from '@/lib/utils/constants';

export interface FileChangeItemProps {
  readonly file: FileChange;
  readonly defaultExpanded?: boolean;
  readonly onOpenFile?: (file: FileChange) => void;
}

export const FileChangeItem: React.FC<FileChangeItemProps> = ({
  file,
  defaultExpanded = false,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  const handleFileClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onOpenFile?.(file);
  };

  const additions = file.diff?.additions ?? 0;
  const deletions = file.diff?.deletions ?? 0;
  const fileName = file.path.split('/').pop() ?? file.path;

  return (
    <div className="bg-background">
      {/* File Header */}
      <div
        className="w-full flex items-center gap-2 px-3 border-b border-border"
        style={{ height: HEIGHTS.headerBar }}
      >
        {/* File Button - Clickable with border, takes full width */}
        <button
          onClick={handleFileClick}
          className="flex items-center gap-2 px-2 py-0.5 rounded-md border border-border bg-muted/50 hover:bg-accent hover:border-accent transition-colors flex-1 min-w-0"
        >
          <FileIcon fileName={fileName} className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium text-foreground truncate flex-1 text-left">
            {fileName}
          </span>
        </button>

        {/* Expand Icon */}
        <button onClick={toggleExpanded} className="p-0.5 rounded hover:bg-accent shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Diff Stats */}
        <DiffStats additions={additions} deletions={deletions} />
      </div>

      {/* Diff Content */}
      {isExpanded && file.diff ? (
        <div className="border-t border-border bg-muted">
          <DiffViewer hunks={file.diff.hunks} />
        </div>
      ) : null}
    </div>
  );
};
