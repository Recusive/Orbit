import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { UnifiedDoc } from '@/features/vault/types';
import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

interface VaultDeleteDialogProps {
  readonly open: boolean;
  readonly doc: UnifiedDoc | null;
  readonly onClose: () => void;
  readonly onConfirmDelete: (relativePath: string) => Promise<void>;
}

export const VaultDeleteDialog: FC<VaultDeleteDialogProps> = ({
  open,
  doc,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (!nextOpen) {
        onClose();
        setError('');
        setIsDeleting(false);
      }
    },
    [onClose]
  );

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!doc) return;

    setIsDeleting(true);
    setError('');

    try {
      await onConfirmDelete(doc.relativePath);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }, [doc, onConfirmDelete, onClose]);

  const itemType = doc?.isDir ? 'folder' : 'document';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContentGlass className="w-[260px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        <DialogClose className="absolute right-3 top-3 z-10 rounded-[9px] p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
          <X className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <div className="relative flex flex-col items-center gap-4 px-4 pb-4 pt-5">
          {/* Icon */}
          <div className="flex w-full items-center px-1.5">
            <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
          </div>

          {/* Title + Description */}
          <div className="flex w-full flex-col items-start gap-2.5 px-1.5 pb-0.5">
            <DialogTitle className="liquid-glass-title w-full">Delete {itemType}?</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              This will permanently delete &ldquo;{doc?.name ?? 'this item'}&rdquo;.
              {doc?.isDir ? ' All contents inside the folder will be removed.' : ''} This action
              cannot be undone.
            </DialogDescription>
          </div>

          {error.length > 0 ? (
            <p className="w-full px-1.5 text-[12px] text-destructive">{error}</p>
          ) : null}

          {/* Buttons */}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-destructive flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting\u2026' : 'Delete'}
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
