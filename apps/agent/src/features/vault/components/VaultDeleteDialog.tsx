import { useCallback, useState } from 'react';

import type { UnifiedDoc } from '@/features/vault/types';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete {itemType}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{doc?.name ?? 'this item'}</strong>?
            {doc?.isDir ? ' This will delete all contents inside the folder.' : ''} This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error.length > 0 ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
