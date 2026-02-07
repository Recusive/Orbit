/**
 * ChangeItem - Individual file change row
 *
 * Displays file status, name, path, and action buttons.
 * Handles renamed files with "oldName → newName" display.
 */
import { Minus, Plus, X } from 'lucide-react';
import React from 'react';

import type { DisplayFileStatus, FileItem } from '../types';

import { cn, GIT_STATUS_STYLES } from '@/lib/utils';

/** Get status indicator icon/label */
function getStatusIcon(status: DisplayFileStatus): React.ReactNode {
  const style = GIT_STATUS_STYLES[status];
  return <span className={cn('text-xs font-bold', style.color)}>{style.label}</span>;
}

/** Extract filename from path */
function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Extract directory from path */
function getFileDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

export interface ChangeItemProps {
  file: FileItem;
  isLoading: boolean;
  /** Primary action (stage or unstage) */
  onAction: (path: string) => Promise<void>;
  actionIcon: 'stage' | 'unstage';
  /** Secondary action (discard) - only for unstaged files */
  onDiscard?: ((path: string) => void) | undefined;
}

export const ChangeItem: React.FC<ChangeItemProps> = ({
  file,
  isLoading,
  onAction,
  actionIcon,
  onDiscard,
}) => {
  const fileName = getFileName(file.path);
  const fileDir = getFileDirectory(file.path);
  const oldFileName = file.oldPath ? getFileName(file.oldPath) : null;
  const oldFileDir = file.oldPath ? getFileDirectory(file.oldPath) : null;

  // Check if directory changed for renamed files
  const dirChanged = oldFileDir !== null && oldFileDir !== fileDir;

  return (
    <div className="group flex items-center gap-2 px-3 h-7 hover:bg-muted/40 transition-[background-color] duration-150">
      {/* Status indicator */}
      <span className="w-4 flex justify-center shrink-0">{getStatusIcon(file.displayStatus)}</span>

      {/* File name and path */}
      <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
        {file.oldPath ? (
          <span className="truncate text-sm">
            <span className="text-muted-foreground/70">{oldFileName}</span>
            <span className="text-muted-foreground/40 mx-1">→</span>
            <span>{fileName}</span>
          </span>
        ) : (
          <span className="truncate text-sm">{fileName}</span>
        )}
        <span className="text-[10px] text-muted-foreground/90 truncate shrink-[2]">
          {dirChanged ? `${oldFileDir} → ${fileDir}` : fileDir}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {onDiscard ? (
          <button
            onClick={() => {
              onDiscard(file.path);
            }}
            disabled={isLoading}
            className="h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-muted/40 active:scale-95 transition-[background-color,color,transform] duration-150"
            title="Discard"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
        <button
          onClick={() => void onAction(file.path)}
          disabled={isLoading}
          className="h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 active:scale-95 transition-[background-color,color,transform] duration-150"
          title={actionIcon === 'stage' ? 'Stage' : 'Unstage'}
        >
          {actionIcon === 'stage' ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
};
