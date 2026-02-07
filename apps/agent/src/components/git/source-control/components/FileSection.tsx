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
      <div className="flex items-center justify-between px-3 h-7 bg-muted/30 border-l-2 border-primary/30">
        <span className="text-[10px] font-semibold text-muted-foreground/90 uppercase tracking-widest">
          {title} ({files.length})
        </span>
        <button
          onClick={() => void onBulkAction()}
          disabled={isLoading}
          className="h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 active:scale-95 transition-[background-color,color,transform] duration-150"
          title={isStaged ? 'Unstage All' : 'Stage All'}
        >
          {isStaged ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      </div>

      {/* File list */}
      <div>
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
