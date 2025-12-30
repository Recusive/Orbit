import React from 'react';

import { useFileStore } from '../../stores/file-store';

import { FileChangeItem } from './file-change-item';

import type { FileChange } from '../../stores/file-store';

export interface FilesChangedListProps {
  readonly className?: string;
  readonly onOpenFile?: (file: FileChange) => void;
}

export const FilesChangedList: React.FC<FilesChangedListProps> = ({
  className = '',
  onOpenFile,
}) => {
  const { changedFiles, filterStatus } = useFileStore();

  const filteredFiles =
    filterStatus === 'all'
      ? changedFiles
      : changedFiles.filter((file) => file.status === filterStatus);

  if (filteredFiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        No files changed
      </div>
    );
  }

  return (
    <div className={`divide-y divide-border ${className}`}>
      {filteredFiles.map((file) => (
        <FileChangeItem key={file.id} file={file} {...(onOpenFile ? { onOpenFile } : {})} />
      ))}
    </div>
  );
};
