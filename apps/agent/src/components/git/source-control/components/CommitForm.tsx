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
          bg-[#f3f3f3] dark:bg-[oklch(23%_0_0)]
          border-0 dark:border dark:border-white/5
          shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_4px_12px_-2px_rgba(0,0,0,0.1),0_8px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-md
          placeholder:text-muted-foreground/60
          focus:outline-none
          transition-shadow duration-200
        "
      />
      {error ? <p className="text-xs text-destructive mt-1">{error}</p> : null}
    </div>
  );
};
