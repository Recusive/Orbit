import React from 'react';

import { useFileStore } from '../../stores/file-store';

import { FileChangeItem } from './file-change-item';

export interface FilesChangedListProps {
  className?: string;
}

export const FilesChangedList: React.FC<FilesChangedListProps> = ({
  className = '',
}) => {
  const { changedFiles, filterStatus } = useFileStore();

  const filteredFiles =
    filterStatus === 'all'
      ? changedFiles
      : changedFiles.filter((file) => file.status === filterStatus);

  if (filteredFiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        No files changed
      </div>
    );
  }

  return (
    <div className={`divide-y divide-gray-200 ${className}`}>
      {filteredFiles.map((file) => (
        <FileChangeItem key={file.id} file={file} />
      ))}
    </div>
  );
};
