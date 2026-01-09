/**
 * OperationError - Error banner for git operations
 */
import React from 'react';

interface OperationErrorProps {
  message: string;
}

export const OperationError: React.FC<OperationErrorProps> = ({ message }) => {
  return (
    <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20">
      <p className="text-xs text-destructive">{message}</p>
    </div>
  );
};
