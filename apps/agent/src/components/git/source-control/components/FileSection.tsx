/**
 * FileSection - Section header with file list
 *
 * Renders a collapsible section for staged or unstaged changes.
 */
import { Minus, Plus } from 'lucide-react';
import React from 'react';

import { ChangeItem } from './ChangeItem';

import type { FileItem } from '../types';

interface FileSectionProps {
  title: string;
  files: FileItem[];
  isLoading: boolean;
  /** Primary action for each file */
  onFileAction: (path: string) => Promise<void>;
  /** Whether this is the staged section (determines icon direction) */
  isStaged: boolean;
  /** Handler for stage all / unstage all */
  onBulkAction: () => Promise<void>;
  /** Discard handler - only for unstaged section */
  onDiscard?: (path: string) => void;
}

export const FileSection: React.FC<FileSectionProps> = ({
  title,
  files,
  isLoading,
  onFileAction,
  isStaged,
  onBulkAction,
  onDiscard,
}) => {
  if (files.length === 0) return null;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">
          {title} ({files.length})
        </span>
        <button
          onClick={() => void onBulkAction()}
          disabled={isLoading}
          className="text-xs text-muted-foreground hover:text-foreground"
          title={isStaged ? 'Unstage All' : 'Stage All'}
        >
          {isStaged ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      </div>

      {/* File list */}
      <div className="py-1">
        {files.map((file) => (
          <ChangeItem
            key={file.path}
            file={file}
            isLoading={isLoading}
            onAction={onFileAction}
            actionIcon={isStaged ? 'unstage' : 'stage'}
            onDiscard={isStaged ? undefined : onDiscard}
          />
        ))}
      </div>
    </div>
  );
};
