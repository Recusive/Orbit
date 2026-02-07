/**
 * OperationError - Error banner for git operations
 */
import React from 'react';

interface OperationErrorProps {
  message: string;
}

export const OperationError: React.FC<OperationErrorProps> = ({ message }) => {
  return (
    <div className="mx-3 my-2 px-2.5 py-2 rounded-lg bg-destructive/10 text-xs text-destructive">
      {message}
    </div>
  );
};
