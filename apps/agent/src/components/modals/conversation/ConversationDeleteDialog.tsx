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
      <DialogContentGlass className="liquid-glass-dialog gap-0 overflow-hidden p-0 bg-chat-area border-0 shadow-none [&>.absolute]:hidden">
        {/* Close button */}
        <DialogClose className="liquid-glass-close absolute right-2 top-2 z-10 rounded-full p-1 opacity-60 transition-opacity duration-150 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Close</span>
        </DialogClose>

        {/* Content — matches Figma: padding 20px 16px 16px, gap 16px */}
        <div
          className="relative flex flex-col items-center"
          style={{ padding: '20px 16px 16px', gap: 16 }}
        >
          {/* Icon — 64x64, left-aligned within 228px row (6px padding) */}
          <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
            <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
          </div>

          {/* Title + Description — left-aligned, padding 0 6px 2px, gap 10px */}
          <div
            className="flex w-full flex-col items-start"
            style={{ padding: '0 6px 2px', gap: 10 }}
          >
            <DialogTitle className="liquid-glass-title w-full">Delete conversation?</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              This will permanently delete &ldquo;{conversationTitle}&rdquo;. This action cannot be
              undone.
            </DialogDescription>
          </div>

          {/* Buttons — pill-shaped, 32px height, gap 8px */}
          <div className="flex w-full items-center" style={{ gap: 8 }}>
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
