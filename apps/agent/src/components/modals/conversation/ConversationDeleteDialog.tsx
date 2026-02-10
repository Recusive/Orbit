import { AlertTriangle, X } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
      <DialogContent className="sm:max-w-[400px] gap-0 overflow-hidden p-0 [&>.absolute]:hidden">
        {/* Header: icon + title + close, all on one line */}
        <div className="flex items-center gap-3 px-3 pt-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <DialogTitle className="flex-1">Delete conversation?</DialogTitle>
          <DialogClose className="shrink-0 rounded-md p-1.5 opacity-70 transition-[opacity,background-color] duration-150 hover:opacity-100 hover:bg-gray-4">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        {/* Body */}
        <DialogDescription className="px-3 pt-3 pb-6">
          This will permanently delete &ldquo;{conversationTitle}&rdquo;. This action cannot be
          undone.
        </DialogDescription>

        {/* Footer with distinct background */}
        <div className="flex justify-end gap-2 border-t border-gray-5 bg-gray-3 px-3 py-3">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
