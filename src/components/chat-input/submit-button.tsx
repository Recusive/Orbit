import { ArrowUp } from 'lucide-react';
import React from 'react';

export interface SubmitButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  onClick,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center
        h-9 w-9 rounded-lg
        bg-blue-600 hover:bg-blue-700
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600
        ${className}
      `}
      aria-label="Submit message"
    >
      <ArrowUp className="h-5 w-5 text-white" />
    </button>
  );
};
