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
    <div className="group flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/40 transition-colors duration-150">
      {/* Status indicator */}
      <span className="w-4 flex justify-center shrink-0">{getStatusIcon(file.displayStatus)}</span>

      {/* File name and path */}
      <div className="flex-1 min-w-0 text-sm">
        {file.oldPath ? (
          // Renamed file: show "oldName → newName"
          <span className="truncate block text-base">
            <span className="text-muted-foreground/70">{oldFileName}</span>
            <span className="text-muted-foreground/50 mx-1">→</span>
            <span>{fileName}</span>
          </span>
        ) : (
          <span className="truncate block text-base">{fileName}</span>
        )}
        <span className="text-sm text-muted-foreground/60 truncate block">
          {dirChanged ? `${oldFileDir} → ${fileDir}` : fileDir}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {onDiscard ? (
          <button
            onClick={() => {
              onDiscard(file.path);
            }}
            disabled={isLoading}
            className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground/70 hover:text-destructive active:scale-95 transition-[background-color,color,transform] duration-150"
            title="Discard"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
        <button
          onClick={() => void onAction(file.path)}
          disabled={isLoading}
          className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground/70 hover:text-foreground active:scale-95 transition-[background-color,color,transform] duration-150"
          title={actionIcon === 'stage' ? 'Stage' : 'Unstage'}
        >
          {actionIcon === 'stage' ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
};
