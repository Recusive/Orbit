import { GitCompareArrows } from 'lucide-react';
import { useMemo } from 'react';

import { FileChangeItem } from './file-change-item';

import type { FileChange } from '@/stores/file/file-store';
import type { FC } from 'react';

import { OrbitLogo } from '@/components/icons/orbit-logo';
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
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/50 dark:bg-background px-8 py-6 w-fit min-w-[14rem]">
          <div className="flex items-center gap-3 opacity-50">
            <OrbitLogo className="h-18 w-18" />
            <div className="w-0.5 h-8 bg-current opacity-40" />
            <GitCompareArrows className="h-12 w-12" />
          </div>
          <p className="text-sm">No files changed</p>
          <p className="text-xs opacity-50">Changes will appear here</p>
        </div>
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
