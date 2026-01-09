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
    <div className="px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
      <p className="text-xs text-foreground mb-2">
        Discard changes to <strong>{getFileName(path)}</strong>?
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => void onConfirm()}
          className="px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Discard
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-xs rounded border border-border hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
