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
          w-full px-2.5 py-2 rounded-lg text-sm
          bg-background border-3 border-transparent
          ring-1 ring-gray-5
          placeholder:text-gray-10
          hover:ring-gray-6
          focus:outline-none focus:ring-0 focus:border-ring focus:bg-gray-4
          transition-[background-color,border-color,box-shadow] duration-200 resize-none
        "
      />
      {error ? <p className="text-xs text-destructive mt-1">{error}</p> : null}
    </div>
  );
};
