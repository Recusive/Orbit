import { useCallback, useEffect, useRef, useState } from 'react';

import type { FC, KeyboardEvent } from 'react';

import { Dialog, DialogContentTopCenter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useActiveFile, useFileViewerStore } from '@/stores/file/file-viewer-store';

export interface GoToLineDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * VS Code-style "Go to Line" dialog.
 * Allows user to jump to a specific line number in the current file.
 */
export const GoToLineDialog: FC<GoToLineDialogProps> = ({ open, onOpenChange }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeFile = useActiveFile();
  const gotoPosition = useFileViewerStore((state) => state.gotoPosition);

  // Get total line count from active file
  const totalLines = activeFile?.content.split('\n').length ?? 0;

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setValue('');
      // Small delay to ensure dialog is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const handleGoToLine = useCallback((): void => {
    if (!activeFile) return;

    const lineNumber = parseInt(value, 10);
    if (isNaN(lineNumber) || lineNumber < 1) return;

    // Clamp to valid range
    const targetLine = Math.min(lineNumber, totalLines);

    // gotoPosition uses 0-indexed line numbers
    gotoPosition(activeFile.path, targetLine - 1, 0, activeFile.content);
    onOpenChange(false);
  }, [value, activeFile, totalLines, gotoPosition, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleGoToLine();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    },
    [handleGoToLine, onOpenChange]
  );

  // Parse current input for validation display
  const parsedLine = parseInt(value, 10);
  const isValidLine = !isNaN(parsedLine) && parsedLine >= 1 && parsedLine <= totalLines;
  const showError = value.length > 0 && !isValidLine;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentTopCenter className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="flex flex-col">
          {/* Input area */}
          <div className="p-2 border-b border-border">
            <Input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={`Go to line (1-${String(totalLines)})`}
              value={value}
              onChange={(e): void => {
                // Only allow numeric input
                const newValue = e.target.value.replace(/[^0-9]/g, '');
                setValue(newValue);
              }}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 bg-transparent"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {/* Status/hint area */}
          <div className="px-3 py-2 text-xs text-muted-foreground bg-lg-control">
            {showError ? (
              <span className="text-destructive">
                Line number must be between 1 and {totalLines}
              </span>
            ) : value.length > 0 ? (
              <span>
                Go to line {value} of {totalLines}
              </span>
            ) : (
              <span>Type a line number and press Enter</span>
            )}
          </div>
        </div>
      </DialogContentTopCenter>
    </Dialog>
  );
};
