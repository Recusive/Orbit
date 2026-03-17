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
    <div className="px-3 pt-3 pb-0">
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Commit message (Ctrl+Enter to commit)..."
        rows={COMMIT_TEXTAREA_ROWS} // Extracted constant
        className="
          w-full px-2.5 py-2 rounded-[14px] text-sm resize-none
          bg-menu-bg
          border border-border-menu
          shadow-menu
          placeholder:text-muted-foreground/60
          focus:outline-none
          transition-shadow duration-200
        "
      />
      {error ? <p className="text-xs text-destructive mt-1">{error}</p> : null}
    </div>
  );
};
