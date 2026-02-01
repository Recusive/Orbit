import { AlertTriangle } from 'lucide-react';

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

export interface ConversationDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly conversationTitle: string;
  readonly onConfirm: () => void;
}

/**
 * Confirmation dialog for deleting a conversation.
 * Shows warning about permanent deletion and requires explicit confirmation.
 */
export const ConversationDeleteDialog: FC<ConversationDeleteDialogProps> = ({
  open,
  onOpenChange,
  conversationTitle,
  onConfirm,
}) => {
  const handleConfirm = (): void => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Delete conversation?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            This will permanently delete &ldquo;{conversationTitle}&rdquo;. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            className="text-base"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="destructive" className="text-base" onClick={handleConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
