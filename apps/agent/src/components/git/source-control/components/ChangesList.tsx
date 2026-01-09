/**
 * ChangesList - Combined staged and unstaged changes sections
 */
import { Check } from 'lucide-react';
import React from 'react';

import { FileSection } from './FileSection';

import type { FileItem } from '../types';

interface ChangesListProps {
  stagedFiles: FileItem[];
  unstagedFiles: FileItem[];
  isStaging: boolean;
  onStageFile: (path: string) => Promise<void>;
  onUnstageFile: (path: string) => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onRequestDiscard: (path: string) => void;
}

export const ChangesList: React.FC<ChangesListProps> = ({
  stagedFiles,
  unstagedFiles,
  isStaging,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onRequestDiscard,
}) => {
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  return (
    <>
      {/* Staged Changes */}
      <FileSection
        title="Staged Changes"
        files={stagedFiles}
        isLoading={isStaging}
        onFileAction={onUnstageFile}
        isStaged={true}
        onBulkAction={onUnstageAll}
      />

      {/* Unstaged Changes */}
      <FileSection
        title="Changes"
        files={unstagedFiles}
        isLoading={isStaging}
        onFileAction={onStageFile}
        isStaged={false}
        onBulkAction={onStageAll}
        onDiscard={onRequestDiscard}
      />

      {/* Clean state */}
      {!hasChanges ? (
        <div className="p-5 text-center text-base text-muted-foreground/70">
          <Check className="h-5 w-5 mx-auto mb-1.5 text-emerald-500/80" />
          Working tree clean
        </div>
      ) : null}
    </>
  );
};
