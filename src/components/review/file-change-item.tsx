import { ChevronRight, ChevronDown, File } from 'lucide-react';
import React, { useState } from 'react';

import { DiffStats } from './diff-stats';
import { DiffViewer } from './diff-viewer';

import type { FileChange } from '../../stores/file-store';

export interface FileChangeItemProps {
  file: FileChange;
  defaultExpanded?: boolean;
}

export const FileChangeItem: React.FC<FileChangeItemProps> = ({
  file,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  const additions = (file.diff?.additions ?? 0) !== 0 ? (file.diff?.additions ?? 0) : 0;
  const deletions = (file.diff?.deletions ?? 0) !== 0 ? (file.diff?.deletions ?? 0) : 0;

  return (
    <div className="bg-white">
      {/* File Header */}
      <button
        onClick={toggleExpanded}
        className="
          w-full flex items-center gap-3 px-4 py-3
          hover:bg-gray-50 transition-colors
          text-left
        "
      >
        {/* Expand Icon */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
        )}

        {/* File Icon */}
        <File className="h-4 w-4 text-gray-400 flex-shrink-0" />

        {/* File Path */}
        <span className="text-sm font-medium text-gray-900 flex-1 truncate">
          {file.path}
        </span>

        {/* Diff Stats */}
        <DiffStats additions={additions} deletions={deletions} />
      </button>

      {/* Diff Content */}
      {isExpanded && file.diff ? <div className="border-t border-gray-200 bg-gray-50">
          <DiffViewer hunks={file.diff.hunks} />
        </div> : null}
    </div>
  );
};
