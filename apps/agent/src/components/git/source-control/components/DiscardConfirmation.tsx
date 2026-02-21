/**
 * DiscardConfirmation - Inline confirmation for discarding changes
 */
import React from 'react';

/** Extract filename from path */
function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

interface DiscardConfirmationProps {
  path: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const DiscardConfirmation: React.FC<DiscardConfirmationProps> = ({
  path,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="mx-3 my-2 px-2.5 py-2.5 rounded-lg bg-yellow-500/10">
      <p className="text-xs text-foreground mb-2.5">
        Discard changes to <strong>{getFileName(path)}</strong>?
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={() => void onConfirm()}
          className="px-2.5 h-6 text-xs rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98] transition-[background-color,transform] duration-150"
        >
          Discard
        </button>
        <button
          onClick={onCancel}
          className="px-2.5 h-6 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-lg-control-hover active:scale-[0.98] transition-[background-color,color,transform] duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
