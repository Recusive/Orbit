import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { DELAYS } from '@/lib/utils/constants';

export interface CopyButtonProps {
  text: string;
  className?: string;
}

export const CopyButton: FC<CopyButtonProps> = ({ text, className = '' }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, DELAYS.toastDuration);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`
        p-1.5 rounded
        hover:bg-muted transition-colors
        text-muted-foreground hover:text-foreground
        ${className}
      `}
      title={isCopied ? 'Copied!' : 'Copy to clipboard'}
    >
      {isCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </button>
  );
};
