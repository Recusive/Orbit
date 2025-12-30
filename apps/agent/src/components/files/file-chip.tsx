import { X } from 'lucide-react';
import React from 'react';

import { FileIcon } from './file-icon';

import type { FC } from 'react';

export interface FileChipProps {
  fileName: string;
  filePath: string;
  onRemove?: () => void;
  draggable?: boolean;
  className?: string;
}

export const FileChip: FC<FileChipProps> = ({
  fileName,
  filePath,
  onRemove,
  draggable = true,
  className = '',
}) => {
  const handleDragStart = (e: React.DragEvent): void => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', filePath);
    e.dataTransfer.setData('application/file-path', filePath);
  };

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1.5
        bg-muted rounded-md border border-border
        hover:bg-muted/80 transition-colors
        cursor-grab active:cursor-grabbing
        group
        ${className}
      `}
      title={filePath}
    >
      <FileIcon fileName={fileName} className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium truncate max-w-[200px]">{fileName}</span>
      {onRemove ? (
        <button
          onClick={onRemove}
          className="ml-1 p-0.5 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove file"
        >
          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      ) : null}
    </div>
  );
};
