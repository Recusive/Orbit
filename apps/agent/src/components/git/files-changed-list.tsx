import { GitCompareArrows } from 'lucide-react';
import { useMemo } from 'react';

import { FileChangeItem } from './file-change-item';

import type { FileChange } from '@/stores/file/file-store';
import type { FC } from 'react';

import { useChangedFiles, useFileStore } from '@/stores/file/file-store';

export interface FilesChangedListProps {
  readonly className?: string;
  readonly onOpenFile?: (file: FileChange) => void;
}

export const FilesChangedList: FC<FilesChangedListProps> = ({ className = '', onOpenFile }) => {
  // useChangedFiles() provides memoized, sorted file list
  const changedFiles = useChangedFiles();
  const filterStatus = useFileStore((s) => s.filterStatus);

  // Memoize the filtered files to avoid recomputation on every render
  const filteredFiles = useMemo(
    () =>
      filterStatus === 'all'
        ? changedFiles
        : changedFiles.filter((file) => file.status === filterStatus),
    [changedFiles, filterStatus]
  );

  if (filteredFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <GitCompareArrows className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No files changed</p>
        <p className="text-xs mt-1 opacity-70">Changes will appear here</p>
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
