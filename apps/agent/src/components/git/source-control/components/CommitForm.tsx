/**
 * CommitForm - Commit message textarea
 */
import React, { useCallback } from 'react';

import { COMMIT_TEXTAREA_ROWS } from '../constants';

interface CommitFormProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => Promise<void>;
  error: string | null;
}

export const CommitForm: React.FC<CommitFormProps> = ({ value, onChange, onCommit, error }) => {
  // Handle Ctrl/Cmd+Enter to commit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void onCommit();
      }
    },
    [onCommit]
  );

  return (
    <div className="p-3 border-b border-border/40">
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Commit message (Ctrl+Enter to commit)..."
        rows={COMMIT_TEXTAREA_ROWS} // Extracted constant
        className="
          w-full px-2.5 py-2 rounded-lg text-sm
          bg-muted/30 border border-border/50
          placeholder:text-muted-foreground/50
          focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-border/70 focus:bg-muted/40
          transition-[background-color,border-color,box-shadow] duration-200 resize-none
        "
      />
      {error ? <p className="text-xs text-destructive mt-1">{error}</p> : null}
    </div>
  );
};
