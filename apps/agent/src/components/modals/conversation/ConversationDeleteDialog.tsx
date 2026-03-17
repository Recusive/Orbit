import { AlertTriangle, X } from 'lucide-react';

import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
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
 * Apple Liquid Glass alert — macOS 26 UI Kit spec.
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
      <DialogContentGlass className="w-[260px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        {/* Close button */}
        <DialogClose className="absolute right-3 top-3 z-10 rounded-[9px] p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
          <X className="h-3.5 w-3.5" />
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
            <DialogTitle className="liquid-glass-title w-full">Delete conversation?</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              This will permanently delete &ldquo;{conversationTitle}&rdquo;. This action cannot be
              undone.
            </DialogDescription>
          </div>

          {/* Buttons */}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-destructive flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={handleConfirm}
            >
              Delete
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
